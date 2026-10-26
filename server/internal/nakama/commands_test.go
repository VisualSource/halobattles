package nakama

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/heroiclabs/nakama-common/runtime"
)

type message struct {
	presence
	op   wire.Op
	data []byte
}

func (m message) GetOpCode() int64      { return int64(m.op) }
func (m message) GetData() []byte       { return m.data }
func (m message) GetReliable() bool     { return true }
func (m message) GetReceiveTime() int64 { return 0 }

type packer interface {
	Pack(*flatbuffers.Builder) flatbuffers.UOffsetT
}

func cmd(from presence, op wire.Op, t packer) runtime.MatchData {
	b := flatbuffers.NewBuilder(64)
	b.Finish(t.Pack(b))
	return message{presence: from, op: op, data: b.FinishedBytes()}
}

// lobbyHarness is a Match with u1 (Host) and u2 seated.
type lobbyHarness struct {
	t     *testing.T
	m     *match
	d     *fakeDispatcher
	state interface{}
	tick  int64
}

var (
	u1 = presence{user: "u1", session: "s1"}
	u2 = presence{user: "u2", session: "s2"}
)

func newLobbyHarness(t *testing.T) *lobbyHarness {
	h := &lobbyHarness{t: t, m: &match{content: testContent()}, d: &fakeDispatcher{}}
	h.state, _, _ = h.m.MatchInit(context.Background(), nopLogger{}, nil, fakeNK{}, nil)
	h.join(u1)
	h.join(u2)
	return h
}

func (h *lobbyHarness) join(p presence) bool {
	state, ok, _ := h.m.MatchJoinAttempt(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, h.tick, h.state, p, nil)
	if ok {
		h.state = h.m.MatchJoin(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, h.tick, state, []runtime.Presence{p})
	}
	return ok
}

func (h *lobbyHarness) leave(p presence) {
	h.state = h.m.MatchLeave(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, h.tick, h.state, []runtime.Presence{p})
}

func (h *lobbyHarness) loop(msgs ...runtime.MatchData) {
	h.tick++
	h.state = h.m.MatchLoop(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, h.tick, h.state, msgs)
}

// rejection returns the reason p's command seq was rejected, or "".
func (h *lobbyHarness) rejection(p presence, seq uint32) string {
	for _, r := range h.d.rejected[p.session] {
		if r.Seq == seq {
			return r.Reason
		}
	}
	return ""
}

func (h *lobbyHarness) seat(user string) *wire.SeatT {
	for _, s := range h.d.lobby.Seats {
		if s.User == user {
			return s
		}
	}
	h.t.Fatalf("no Seat for %s in %+v", user, h.d.lobby)
	return nil
}

func TestCommandsApplyOrAreRejectedWithTheirSeq(t *testing.T) {
	h := newLobbyHarness(t)

	h.loop(
		cmd(u1, wire.OpSetFaction, &wire.SetFactionT{Seq: 1, Faction: "base:unsc"}),
		cmd(u2, wire.OpSetMap, &wire.SetMapT{Seq: 7, Map: "base:b-map"}),
		cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 8, Ready: true}),
	)

	if got := h.seat("u1"); got.Faction != "base:unsc" || got.LastSeq != 1 {
		t.Errorf("u1 seat = %+v, want Faction base:unsc, last_seq 1", got)
	}
	if got := h.seat("u2"); !got.Ready || got.LastSeq != 8 {
		t.Errorf("u2 seat = %+v, want ready, last_seq 8", got)
	}
	if r := h.rejection(u2, 7); !strings.Contains(r, "only the Host") {
		t.Errorf("u2's SetMap rejection = %q", r)
	}
	if len(h.d.rejected["s1"]) != 0 {
		t.Errorf("u1 got rejections: %+v", h.d.rejected["s1"])
	}
}

func TestStartingResourcesAndMapAreValidated(t *testing.T) {
	h := newLobbyHarness(t)

	h.loop(
		cmd(u1, wire.OpSetStartingResources, &wire.SetStartingResourcesT{Seq: 1, Amounts: []*wire.AmountT{{Resource: "base:credits", Amount: 2_000_000}}}),
		cmd(u1, wire.OpSetStartingResources, &wire.SetStartingResourcesT{Seq: 2, Amounts: []*wire.AmountT{{Resource: "base:credits", Amount: 500}}}),
	)

	if r := h.rejection(u1, 1); !strings.Contains(r, "0 to 1,000,000") {
		t.Errorf("out-of-range rejection = %q", r)
	}
	if got := h.d.lobby.StartingResources; len(got) != 1 || got[0].Amount != 500 {
		t.Errorf("starting resources = %+v", got)
	}
}

func TestCommandsFromAReplacedSessionAreIgnored(t *testing.T) {
	h := newLobbyHarness(t)
	// u2 reloads: the new session joins before the old one is gone.
	h.join(presence{user: "u2", session: "s2b"})

	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 9, Ready: true}))

	if got := h.seat("u2"); got.Ready || got.LastSeq != 0 {
		t.Errorf("a stale session's command applied: %+v", got)
	}
}

func TestOversizedCommandIsRejected(t *testing.T) {
	h := newLobbyHarness(t)

	h.loop(cmd(u1, wire.OpSetFaction, &wire.SetFactionT{Seq: 1, Faction: strings.Repeat("x", 5000)}))

	if r := h.rejection(u1, 1); !strings.Contains(r, "too large") {
		t.Errorf("oversized command rejection = %q", r)
	}
}

func TestCommandsAreCappedAt20PerPlayerPerTick(t *testing.T) {
	h := newLobbyHarness(t)
	var msgs []runtime.MatchData
	for seq := uint32(1); seq <= 21; seq++ {
		msgs = append(msgs, cmd(u1, wire.OpSetReady, &wire.SetReadyT{Seq: seq, Ready: seq%2 == 0}))
	}

	h.loop(msgs...)

	if r := h.rejection(u1, 21); !strings.Contains(r, "too many commands") {
		t.Errorf("21st command rejection = %q", r)
	}
	if h.rejection(u1, 20) != "" || h.seat("u1").Ready != true {
		t.Errorf("the first 20 should apply; seat %+v", h.seat("u1"))
	}
}

func TestMalformedCommandIsRejectedNotFatal(t *testing.T) {
	h := newLobbyHarness(t)

	h.loop(cmd(u1, wire.OpSetReady, &wire.SetReadyT{Seq: 5, Ready: true}),
		message{presence: u1, op: wire.OpSetFaction, data: []byte{0xff, 0xff}},
		message{presence: u1, op: 42, data: nil})

	if len(h.d.rejected["s1"]) != 2 {
		t.Errorf("rejections = %+v, want 2", h.d.rejected["s1"])
	}
	if got := h.seat("u1").LastSeq; got != 5 {
		t.Errorf("last_seq = %d after malformed commands, want 5 kept", got)
	}
}

func TestStartMovesToPlayAndOnlyReturningSeatsMayJoin(t *testing.T) {
	h := newLobbyHarness(t)
	h.loop(cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 1}))
	if r := h.rejection(u1, 1); !strings.Contains(r, "not every Seat is ready") {
		t.Fatalf("early Start rejection = %q", r)
	}

	h.loop(
		cmd(u1, wire.OpSetReady, &wire.SetReadyT{Seq: 2, Ready: true}),
		cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 1, Ready: true}),
		cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 3}),
	)
	if h.d.lobby.Phase != wire.PhasePlay || h.d.label["phase"] != "play" {
		t.Fatalf("after Start: phase %v, label %v", h.d.lobby.Phase, h.d.label)
	}

	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 2, Ready: false}))
	if r := h.rejection(u2, 2); !strings.Contains(r, "lobby") {
		t.Errorf("lobby command after Start: rejection = %q", r)
	}

	if h.join(presence{user: "u3", session: "s3"}) {
		t.Error("a new player joined after Start")
	}
	h.leave(u2)
	if !h.join(presence{user: "u2", session: "s2b"}) {
		t.Error("a returning Seat couldn't rejoin after Start")
	}
	h.leave(u1)
	h.leave(presence{user: "u2", session: "s2b"})
	h.loop()
	if h.state == nil {
		t.Error("a running Match ended when everyone disconnected")
	}
}

func (h *lobbyHarness) start() {
	h.t.Helper()
	h.loop(
		cmd(u1, wire.OpSetReady, &wire.SetReadyT{Seq: 101, Ready: true}),
		cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 101, Ready: true}),
		cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 102}),
	)
	if h.d.lobby.Phase != wire.PhasePlay {
		h.t.Fatalf("Start failed: %+v", h.d.rejected)
	}
}

func TestStartSendsEachPlayerTheirOwnViewFull(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()

	for seat, p := range []presence{u1, u2} {
		v := h.d.views[p.session]
		if v == nil {
			t.Fatalf("%s got no ViewFull", p.user)
		}
		if int(v.You) != seat || v.ContentHash != "hash1" || v.Ruleset != "base:rules" || v.Map != "base:a-map" || v.MatchTime != 0 {
			t.Errorf("%s ViewFull header = you %d, hash %q, ruleset %q, map %q, time %d", p.user, v.You, v.ContentHash, v.Ruleset, v.Map, v.MatchTime)
		}
		// a-map is x - y - z with starts x and z: each player sees their
		// Capital and y, never the other Capital.
		var ids []string
		for _, pl := range v.Planets {
			ids = append(ids, pl.Id)
			if pl.Capital && int(pl.Owner) != seat {
				t.Errorf("%s can see another player's Capital %s", p.user, pl.Id)
			}
		}
		if len(ids) != 2 || !slices.Contains(ids, "y") {
			t.Errorf("%s sees %v, want its Capital and y", p.user, ids)
		}
		if len(v.Players) != 2 || v.Players[1].PlanetCount != 1 {
			t.Errorf("players = %+v", v.Players)
		}
	}
}

func TestReturningPlayerGetsViewFullWithMatchTime(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	for range 10 {
		h.loop() // 10 ticks at 5 Hz = 2 s
	}

	h.leave(u2)
	back := presence{user: "u2", session: "s2c"}
	if !h.join(back) {
		t.Fatal("returning Seat refused")
	}

	v := h.d.views["s2c"]
	if v == nil || v.You != 1 || v.MatchTime != 2000 {
		t.Fatalf("rejoin ViewFull = %+v, want Seat 1 at Match Time 2000", v)
	}
}

func TestPaydaySendsPaydayPaidAndAViewDelta(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	if v := h.d.views[u1.session]; v.Economy == nil || v.Economy.PaydayEnd != 90_000 || v.Economy.Resources[0].Amount != 1000 {
		t.Fatalf("ViewFull economy = %+v, want 1000 Credits and Payday at 90 s", v.Economy)
	}

	for range 449 { // up to 89.8 s: nothing changes
		h.loop()
	}
	if len(h.d.deltas[u1.session]) != 0 || len(h.d.paydays[u1.session]) != 0 {
		t.Fatalf("sent %d deltas and %d paydays before anything changed", len(h.d.deltas[u1.session]), len(h.d.paydays[u1.session]))
	}

	h.loop() // 90 s
	paid := h.d.paydays[u1.session]
	if len(paid) != 1 || paid[0].MatchTime != 90_000 || paid[0].Net[0].Amount != 300 {
		t.Fatalf("PaydayPaid = %+v, want +300 Credits at 90 s", paid)
	}
	deltas := h.d.deltas[u1.session]
	if len(deltas) != 1 || deltas[0].Economy == nil || deltas[0].Economy.Resources[0].Amount != 1300 ||
		deltas[0].Economy.PaydayStart != 90_000 || deltas[0].Economy.PaydayEnd != 180_000 || len(deltas[0].Planets) != 0 {
		t.Errorf("ViewDelta = %+v, want only the economy: 1300 Credits, next Payday 90–180 s", deltas)
	}
}
