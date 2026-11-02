package game

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

// A Spectator sees every Planet, Army and Battle without fog, where every
// Army is going and each player's Stats, but no queues, and no economy or
// research of its own.
func TestASpectatorSeesTheWholeMatchButNotQueues(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	if err := s.QueueBuilding(c, 0, "a", 2, "base:barracks"); err != nil {
		t.Fatal(err)
	}
	_ = s.OrderArmy(1, "e", marines(5), "c", 0) // two hops: e - d - c
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000) // Seat 0 reaches b: a Battle

	v := s.SpectatorView(c)
	if v.You != Spectating || v.Economy.Resources != nil || v.Research.Rates != nil {
		t.Errorf("you %d, economy %+v, research %+v; want none of its own", v.You, v.Economy, v.Research)
	}
	if len(v.Planets) != len(s.Planets) {
		t.Errorf("%d Planets seen of %d", len(v.Planets), len(s.Planets))
	}
	for _, p := range v.Planets {
		if p.Queue != nil || p.UnitQueue != nil {
			t.Errorf("%s's queues shown: %+v %+v", p.ID, p.Queue, p.UnitQueue)
		}
	}
	if len(v.Armies) != 1 || v.Armies[0].Destination != "c" {
		t.Errorf("Armies %+v; want Seat 1's, headed for c", v.Armies)
	}
	for _, p := range v.Players {
		if p.Stats == nil || p.Stats.Resources == nil || p.Stats.CommandPointsCap == 0 {
			t.Errorf("player %d's Stats %+v", p.Seat, p.Stats)
		}
	}
	if len(v.Battles) != 1 {
		t.Fatalf("%d Battles; want the one at b", len(v.Battles))
	}
	sides := map[battle.Side]bool{}
	for _, sq := range v.Battles[0].Squads {
		sides[sq.Side] = true
	}
	if !sides[battle.Attacker] || !sides[battle.Defender] {
		t.Errorf("Battle squads %+v; want both sides", v.Battles[0].Squads)
	}

	if own := s.View(c, 0); own.Players[0].Stats != nil {
		t.Error("a player's View carries Stats")
	}
}

// Two Bots and a Spectator: the Bots play on while it watches, and the
// Match is abandoned when it's gone for good.
func TestASpectatorKeepsABotMatchGoing(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Players[0].Bot, s.Players[1].Bot = "hard", "easy"
	s.AddSpectator("w")

	if ev := s.Advance(c, 1_000); ev.MatchEnded != nil {
		t.Fatalf("ended %+v while watched", ev.MatchEnded)
	}
	s.SpectatorAway("w", grace) // a reload: the place is kept
	if ev := s.Advance(c, 2_000); ev.MatchEnded != nil {
		t.Fatalf("ended %+v in the Spectator's Grace Period", ev.MatchEnded)
	}
	s.SpectatorBack("w")
	s.SpectatorLeft("w")
	if ev := s.Advance(c, 3_000); ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: Neutral, Reason: ReasonAbandoned}) {
		t.Errorf("ended %+v; want abandoned once the Spectator left", ev.MatchEnded)
	}
}

func TestADroppedSpectatorsGraceRunningOutAbandonsABotMatch(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Players[0].Bot, s.Players[1].Bot = "hard", "easy"
	s.AddSpectator("w")
	s.SpectatorAway("w", 1_000)
	if ev := s.Advance(c, 2_000); ev.MatchEnded == nil || ev.MatchEnded.Reason != ReasonAbandoned {
		t.Errorf("ended %+v; want abandoned after the Grace Period", ev.MatchEnded)
	}
}

// Watched, a Bot that beats the other wins; and an eliminated player who
// stays watches too, keeping two Bots playing.
func TestWatchedBotsPlayToAWinner(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Players[0].Bot, s.Players[1].Bot = "hard", "easy"
	s.AddSpectator("w")
	s.eliminate(0, &Events{})
	if ev := s.Advance(c, 1_000); ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: 1, Reason: ReasonLastStanding}) {
		t.Errorf("ended %+v; want the last Bot to win", ev.MatchEnded)
	}

	s = fixedMatch(t)
	s.Players[1].Bot = "hard"
	s.Players = append(s.Players, Player{Seat: 2, Bot: "easy"})
	s.eliminate(0, &Events{}) // the player, beaten, stays to watch
	if ev := s.Advance(c, 1_000); ev.MatchEnded != nil {
		t.Errorf("ended %+v; want the two Bots to play on for the eliminated player", ev.MatchEnded)
	}
	s.Forfeit(0) // and then leaves
	if ev := s.Advance(c, 2_000); ev.MatchEnded == nil || ev.MatchEnded.Reason != ReasonAbandoned {
		t.Errorf("ended %+v; want abandoned once nobody watches", ev.MatchEnded)
	}
}
