package nakama

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

func TestTeamsGoFromTheLobbyIntoTheMatch(t *testing.T) {
	h := newLobbyHarness(t) // u1 (Host) and u2 on base:a-map's 2 Seats
	h.loop(cmd(u1, wire.OpSetTeams, &wire.SetTeamsT{Seq: 1, On: true}))
	if r := h.rejection(u1, 1); r != "" || !h.d.lobby.Teams || h.d.lobby.Seats[0].Team != 1 || h.d.lobby.Seats[1].Team != 2 {
		t.Fatalf("SetTeams: %q, lobby %+v", r, h.d.lobby)
	}
	h.loop(cmd(u2, wire.OpSetTeam, &wire.SetTeamT{Seq: 2, User: "u2", Team: 3}))
	if r := h.rejection(u2, 2); r != "" || h.d.lobby.Seats[1].Team != 3 {
		t.Fatalf("SetTeam: %q, seats %+v", r, h.d.lobby.Seats)
	}

	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 9, Ready: true}), cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 10}))
	s := h.state.(*matchState)
	if s.phase != wire.PhasePlay {
		t.Fatalf("phase %v", s.phase)
	}
	v := h.d.views["s1"]
	if v.Players[0].Team != 0 || v.Players[1].Team != 2 {
		t.Errorf("Teams in the ViewFull: %d, %d; want 0 (Team 1) and 2 (Team 3)", v.Players[0].Team, v.Players[1].Team)
	}
}
