package nakama

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
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

	if r := h.rejection(u1, 1); !strings.Contains(r, "0 to its Stockpile cap, 3000") {
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

func TestQueueBuildingWorksOnlyInPlayAndShowsInTheNextDelta(t *testing.T) {
	h := newLobbyHarness(t)
	queue := func(seq uint32, planet string) runtime.MatchData {
		return cmd(u1, wire.OpQueueBuilding, &wire.QueueBuildingT{Seq: seq, Planet: planet, Slot: 0, Building: "base:hall"})
	}
	h.loop(queue(1, "x"))
	if r := h.rejection(u1, 1); !strings.Contains(r, "during play") {
		t.Errorf("QueueBuilding in the lobby: rejection = %q", r)
	}

	h.start()
	capital := ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital {
			capital = p.Id
		}
	}
	h.loop(queue(103, capital))

	if r := h.rejection(u1, 103); r != "" {
		t.Fatalf("QueueBuilding rejected: %s", r)
	}
	if h.seat("u1").LastSeq != 103 {
		t.Errorf("last_seq = %d, want 103 so the client settles the command", h.seat("u1").LastSeq)
	}
	deltas := h.d.deltas[u1.session]
	last := deltas[len(deltas)-1]
	if len(last.Planets) != 1 || len(last.Planets[0].Queue) != 1 {
		t.Fatalf("delta = %+v, want the Capital with its new queue", last)
	}
	q := last.Planets[0].Queue[0]
	if q.Building != "base:hall" || !q.Started || q.Paused || q.EndsAt != 200+30_000 {
		t.Errorf("queue item = %+v, want the Hall running until 30.2 s", q)
	}
	if last.Economy == nil || last.Economy.Resources[0].Amount != 850 {
		t.Errorf("economy = %+v, want 850 Credits after paying 150", last.Economy)
	}
}

func TestOrderArmyCapturesTheEmptyPlanetBetweenTheCapitals(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	capital := ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital {
			capital = p.Id
		}
	}

	// a-map's Lanes have no length or time, so the Army arrives on this tick.
	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{
		Seq: 103, FromPlanet: capital, ToPlanet: "y", ToStack: 1,
		Units: []*wire.ArmyUnitsT{{Stack: 0, Unit: "base:grunt", Count: 2}},
	}))

	if r := h.rejection(u1, 103); r != "" {
		t.Fatalf("OrderArmy rejected: %s", r)
	}
	for _, p := range []presence{u1, u2} { // y is next to both Capitals
		c := h.d.captured[p.session]
		if len(c) != 1 || c[0].Planet != "y" || c[0].From != -1 || c[0].To != 0 {
			t.Errorf("%s got PlanetCaptured %+v, want y going from neutral to Seat 0", p.user, c)
		}
	}
	deltas := h.d.deltas[u1.session]
	for _, pl := range deltas[len(deltas)-1].Planets {
		if pl.Id == "y" && (pl.Owner != 0 || pl.Stacks[1].Slots[0].Count != 2) {
			t.Errorf("y = %+v, want Seat 0's with 2 Grunts in Stack 2", pl)
		}
	}
}

func TestAnArmyAtAnEnemyCapitalStartsABattleBothSidesHear(t *testing.T) {
	h := newLobbyHarness(t)
	r := h.m.content.Doc.Rulesets["base:rules"]
	r.Battle.StartDelay, r.Battle.TimeCap = 0, 5 // the test units have no combat stats: the defender holds at the cap
	h.m.content.Doc.Rulesets["base:rules"] = r
	h.start()
	mine, theirs := "", ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital {
			mine = p.Id
		}
	}
	for _, p := range h.d.views[u2.session].Planets {
		if p.Capital {
			theirs = p.Id
		}
	}
	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{
		Seq: 103, FromPlanet: mine, ToPlanet: "y", Units: []*wire.ArmyUnitsT{{Stack: 0, Unit: "base:grunt", Count: 2}},
	})) // takes empty y

	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{
		Seq: 104, FromPlanet: "y", ToPlanet: theirs, Units: []*wire.ArmyUnitsT{{Stack: 0, Unit: "base:grunt", Count: 2}},
	}))

	if r := h.rejection(u1, 104); r != "" {
		t.Fatalf("OrderArmy rejected: %s", r)
	}
	for range 6 * tickRate { // the Battle plays out live, to its cap
		if slices.Contains(h.d.ops[u1.session], wire.OpBattleEnded) {
			break
		}
		h.loop()
	}
	for _, p := range []presence{u1, u2} {
		ops := h.d.ops[p.session]
		if !slices.Contains(ops, wire.OpBattleStarted) || !slices.Contains(ops, wire.OpBattleEnded) {
			t.Errorf("%s got %v, want BattleStarted and BattleEnded", p.user, ops)
		}
	}
}

func TestHoldingTheShareEndsTheMatchIntoResults(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	mine := ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital {
			mine = p.Id
		}
	}
	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{
		Seq: 103, FromPlanet: mine, ToPlanet: "y", Units: []*wire.ArmyUnitsT{{Stack: 0, Unit: "base:grunt", Count: 1}},
	})) // 2 of 3 Planets: over the 0.6 share, so a 90 s hold starts

	for range 90 * tickRate {
		h.loop()
	}

	if h.d.lobby.Phase != wire.PhaseResults || h.d.lobby.Winner != 0 || h.d.lobby.EndReason != "hold" {
		t.Fatalf("LobbyState = phase %v, winner %d, reason %q; want results, Seat 0, hold",
			h.d.lobby.Phase, h.d.lobby.Winner, h.d.lobby.EndReason)
	}
	if !slices.Contains(h.d.toAll, wire.OpMatchEnded) {
		t.Error("MatchEnded wasn't broadcast to everyone")
	}
	for range 60*tickRate - 1 {
		h.loop()
	}
	if h.state == nil {
		t.Fatal("the Match ended before resultsSeconds were up")
	}
	h.loop()
	if h.state != nil {
		t.Error("the Match should terminate after resultsSeconds")
	}
}

func TestResultsCloseOnceEveryoneLeaves(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	s := h.state.(*matchState)
	s.play.Result = &game.Result{Winner: 1, Reason: game.ReasonLastStanding}
	s.phase, s.endTick = wire.PhaseResults, h.tick

	h.leave(u1)
	h.leave(u2)
	h.loop()
	if h.state != nil {
		t.Error("an empty results phase should close the Match")
	}
}

func TestADroppedPlayerForfeitsWhenTheirGraceRunsOut(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()

	h.leave(u2) // the socket dropped
	h.loop()
	var p1 *wire.PlayerViewT
	deltas := h.d.deltas[u1.session]
	for _, p := range deltas[len(deltas)-1].Players {
		if p.Seat == 1 {
			p1 = p
		}
	}
	if p1 == nil || p1.Connected || p1.GraceEnds != 180_000 {
		t.Fatalf("u1 sees u2 as %+v, want disconnected with a 180 s Grace Period", p1)
	}

	for range 180 * tickRate {
		h.loop()
	}
	if h.d.lobby.Phase != wire.PhaseResults || h.d.lobby.Winner != 0 || h.d.lobby.EndReason != "last-standing" {
		t.Errorf("after the Grace Period: phase %v, winner %d, reason %q", h.d.lobby.Phase, h.d.lobby.Winner, h.d.lobby.EndReason)
	}
}

func TestRejoiningWithinTheGracePeriodGetsAViewFull(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	h.leave(u2)
	for range 60 * tickRate {
		h.loop()
	}

	back := presence{user: "u2", session: "s2b"}
	if !h.join(back) {
		t.Fatal("a returning Seat was refused")
	}
	for range 180 * tickRate {
		h.loop()
	}

	if v := h.d.views[back.session]; v == nil || v.You != 1 || !v.Players[1].Connected {
		t.Errorf("rejoin ViewFull = %+v, want Seat 1, connected", v)
	}
	if h.d.lobby.Phase != wire.PhasePlay {
		t.Errorf("phase %v: the returning player shouldn't have forfeited", h.d.lobby.Phase)
	}
}

func TestLeavingOrSurrenderingInPlayIsAForfeit(t *testing.T) {
	for _, tc := range []struct {
		name string
		quit func(h *lobbyHarness)
	}{
		{"leave", func(h *lobbyHarness) {
			h.leave(presence{user: "u2", session: "s2", reason: runtime.PresenceReasonLeave})
		}},
		{"surrender", func(h *lobbyHarness) { h.loop(cmd(u2, wire.OpSurrender, &wire.SurrenderT{Seq: 102})) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newLobbyHarness(t)
			h.start()

			tc.quit(h)
			h.loop()

			if !slices.Contains(h.d.toAll, wire.OpPlayerEliminated) || h.d.lobby.Phase != wire.PhaseResults || h.d.lobby.Winner != 0 {
				t.Errorf("broadcasts %v, phase %v, winner %d; want u2 eliminated and u1 the winner",
					h.d.toAll, h.d.lobby.Phase, h.d.lobby.Winner)
			}
		})
	}
}

func TestRetreatingFromNoBattleIsRejected(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	h.loop(cmd(u1, wire.OpBattleRetreat, &wire.BattleRetreatT{Seq: 103, Planet: "y"}))
	if r := h.rejection(u1, 103); r != "you aren't fighting a Battle there" {
		t.Errorf("rejection %q", r)
	}
}

func TestALayoutSwapComesBackToItsSender(t *testing.T) {
	h := newLobbyHarness(t)
	h.start()
	capital := ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital && p.Owner == 0 {
			capital = p.Id
		}
	}
	p := h.state.(*matchState).play.Planets[capital]
	p.Buildings[0], p.Buildings[1] = "base:hall", "base:hall"
	h.loop(cmd(u1, wire.OpRequestDefenceLayout, &wire.RequestDefenceLayoutT{Seq: 103, Planet: capital}))
	if r := h.rejection(u1, 103); r != "" || h.d.layout == nil {
		t.Fatalf("rejected %q; want a DefenceLayout", r)
	}
	a, b := h.d.layout.BuildingSites[0], h.d.layout.BuildingSites[1]
	h.loop(cmd(u1, wire.OpSetDefenceLayout, &wire.SetDefenceLayoutT{Seq: 104, Planet: capital, Sites: []int8{b, a}}))
	if r := h.rejection(u1, 104); r != "" {
		t.Fatalf("swap rejected: %s", r)
	}
	if got := h.d.layout.BuildingSites; got[0] != b || got[1] != a {
		t.Errorf("sites after the swap %v; want %d and %d swapped", got, a, b)
	}
}

// lastBattle is the latest Battle view a session was sent in a delta.
func (h *lobbyHarness) lastBattle(p presence) *wire.BattleViewT {
	ds := h.d.deltas[p.session]
	for i := len(ds) - 1; i >= 0; i-- {
		if bs := ds[i].Battles; len(bs) > 0 {
			return bs[0]
		}
	}
	return nil
}

func TestOnlyTheBattleYouHaveOpenSendsPositions(t *testing.T) {
	h := newLobbyHarness(t)
	r := h.m.content.Doc.Rulesets["base:rules"]
	r.Battle.StartDelay, r.Battle.TimeCap = 0, 30
	h.m.content.Doc.Rulesets["base:rules"] = r
	h.start()
	mine, theirs := "", ""
	for _, p := range h.d.views[u1.session].Planets {
		if p.Capital {
			mine = p.Id
		}
	}
	for _, p := range h.d.views[u2.session].Planets {
		if p.Capital {
			theirs = p.Id
		}
	}
	army := []*wire.ArmyUnitsT{{Stack: 0, Unit: "base:grunt", Count: 2}}
	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{Seq: 103, FromPlanet: mine, ToPlanet: "y", Units: army}))
	h.loop(cmd(u1, wire.OpOrderArmy, &wire.OrderArmyT{Seq: 104, FromPlanet: "y", ToPlanet: theirs, Units: army}))
	for i := 0; i < 6*tickRate && h.lastBattle(u2) == nil; i++ {
		h.loop()
	}
	b := h.lastBattle(u2)
	if b == nil || !b.Summary || b.Tick != 0 || len(b.Points) != 0 || len(b.Squads) == 0 {
		t.Fatalf("u2's Battle %+v; want a summary: squads, no tick or Landing Zones", b)
	}
	for _, sq := range b.Squads {
		if sq.X != 0 || sq.Y != 0 || sq.Hp != 0 || sq.Count == 0 {
			t.Errorf("summary squad %+v; want its counts without its cell or layers", sq)
		}
	}
	h.loop(cmd(u1, wire.OpWatchBattle, &wire.WatchBattleT{Seq: 105, Planet: theirs}))
	h.loop()
	if b := h.lastBattle(u1); b == nil || b.Summary || len(b.Points) == 0 {
		t.Errorf("u1's Battle after opening it %+v; want the full view", b)
	}
}

// A side's report adds each volley's damage to the shooter's side and takes
// its kills off the target, for the volleys that side saw.
func TestABattleReportCountsDamageBySideAndKills(t *testing.T) {
	b := &game.Battle{Sim: &battle.Sim{Squads: []*battle.Squad{
		{ID: 1, Side: battle.Attacker}, {ID: 2, Side: battle.Defender},
	}}}
	s := &matchState{reports: map[uint32]*battleReport{}}
	r := s.report(5)
	r.see(int(battle.Defender), []battle.SquadView{{ID: 1, Side: battle.Attacker, Count: 4, Start: 4}})
	r.fire(int(battle.Defender), b, []battle.Volley{
		{Actor: 1, Target: 2, ShieldDmg: 3, ArmorDmg: 4, HPDmg: 5},
		{Actor: 2, Target: 1, HPDmg: 7, Kills: 1},
	})
	if d := r.damage[battle.Defender]; d[battle.Attacker] != 12 || d[battle.Defender] != 7 {
		t.Errorf("the defender saw damage %v; want 12 by the attacker and 7 by itself", d)
	}
	if r.damage[battle.Attacker] != [2]float64{} || r.damage[2] != [2]float64{} {
		t.Error("damage counted for a side that didn't see it")
	}
	if n := r.squads[battle.Defender][1].Count; n != 3 {
		t.Errorf("the Marines it saw have %d left after a kill; want 3", n)
	}
}
