package nakama

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

func TestASpectatorJoinsAFullLobbyWatchesAndGivesNoOrders(t *testing.T) {
	h := newLobbyHarness(t) // u1 (Host) and u2 fill base:a-map's 2 Seats
	u3 := presence{user: "u3", session: "s3"}
	if !h.join(u3) || len(h.d.lobby.Spectators) != 1 || h.d.lobby.Spectators[0].User != "u3" {
		t.Fatalf("spectators %v; want u3, the lobby being full", h.d.lobby.Spectators)
	}

	// The Host spectates, stays Host, and takes a Seat again.
	h.loop(cmd(u1, wire.OpSpectate, &wire.SpectateT{Seq: 1}))
	if r := h.rejection(u1, 1); r != "" || h.d.lobby.Host != "u1" || len(h.d.lobby.Seats) != 1 {
		t.Fatalf("spectate: %q, host %q, seats %v", r, h.d.lobby.Host, seatNames(h.d.lobby))
	}
	h.loop(cmd(u1, wire.OpTakeSeat, &wire.TakeSeatT{Seq: 2}))
	if r := h.rejection(u1, 2); r != "" || len(h.d.lobby.Seats) != 2 {
		t.Fatalf("take a Seat: %q, seats %v", r, seatNames(h.d.lobby))
	}

	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 9, Ready: true}), cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 10}))
	s := h.state.(*matchState)
	if s.phase != wire.PhasePlay {
		t.Fatalf("phase %v; Start shouldn't wait for a Spectator", s.phase)
	}
	v := h.d.views["s3"]
	if v == nil || !v.Spectating || len(v.Planets) != len(s.play.Planets) || len(v.Economy.Resources) != 0 {
		t.Fatalf("the Spectator's ViewFull %+v; want every Planet and no economy of its own", v)
	}
	for _, p := range v.Players {
		if p.Stats == nil || len(p.Stats.Resources) == 0 {
			t.Errorf("player %d's stats %+v", p.Seat, p.Stats)
		}
	}
	if h.d.views["s1"].Spectating || h.d.views["s1"].Players[0].Stats != nil {
		t.Error("a player's ViewFull is a Spectator's")
	}

	h.loop(cmd(u3, wire.OpSurrender, &wire.SurrenderT{Seq: 3}))
	if r := h.rejection(u3, 3); r != errSpectating.Error() {
		t.Errorf("a Spectator's order: %q", r)
	}

	// An eliminated player watches: their View becomes the Spectator View.
	s.play.Players[s.seat("u2")].Eliminated = true
	if v, ok := s.viewer()("u2"); !ok || v.You != game.Spectating {
		t.Errorf("eliminated u2's View: you %d, ok %v", v.You, ok)
	}
	// ...and gets events once, as a watcher, not also as a side.
	before := len(h.d.ops["s2"])
	t2 := &wire.PlanetCapturedT{Planet: "x", From: int8(s.seat("u2")), To: 0}
	s.sendTo(nopLogger{}, h.d, wire.OpPlanetCaptured, finish(t2), s.seat("u2"))
	s.sendToPresences(nopLogger{}, h.d, wire.OpPlanetCaptured, finish(t2), s.watchers())
	if got := len(h.d.ops["s2"]) - before; got != 1 {
		t.Errorf("eliminated u2 got %d copies of a capture; want 1", got)
	}
}
