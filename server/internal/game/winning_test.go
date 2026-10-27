package game

import (
	"slices"
	"testing"
)

// In fixedMatch, Seat 0's Capital is a and Seat 1's is e, on a 5-Planet
// line. The map's share is 0.6 for 90 s, so holding 4 Planets wins.

func TestLosingYourCapitalEliminatesYou(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	cp := s.Planets["c"] // Seat 1's other Planet, with a Barracks and a queue
	cp.Owner, cp.Stacks = 1, [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 2}}}
	cp.Buildings[0] = "base:barracks"
	_ = s.QueueBuilding(c, 1, "c", 1, "base:barracks")
	s.Planets["e"].Stacks = [StacksPerPlanet]Stack{}
	s.Planets["d"].Owner = 0
	s.Planets["d"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	s.LastID++
	s.Armies = map[uint32]*Army{s.LastID: {ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:grunt", Count: 1}}, From: "c", To: "b", Arrives: 99_000}}
	if err := s.OrderArmy(0, "d", marines(3), "e", 0); err != nil {
		t.Fatal(err)
	}

	ev := s.Advance(c, 30_000) // onto Seat 1's empty Capital: a Battle with no defenders

	if !s.Players[1].Eliminated || !slices.Equal(ev.Eliminated, []int{1}) {
		t.Fatalf("eliminated %v, Seat 1 %+v", ev.Eliminated, s.Players[1])
	}
	if e := s.Planets["e"]; e.Owner != 0 || e.Capital {
		t.Errorf("e = %+v, want Seat 0's and no one's Capital", e)
	}
	if cp.Owner != Neutral || cp.Buildings[0] != "base:barracks" || cp.Stacks[0][0].Count != 2 || len(cp.Queue) != 0 {
		t.Errorf("c = %+v, want neutral, keeping its Barracks and garrison, with no queue", cp)
	}
	for _, a := range s.Armies {
		if a.Owner == 1 {
			t.Errorf("Seat 1's Army %+v survived its elimination", a)
		}
	}
	if !s.View(c, 0).Players[1].Eliminated {
		t.Error("the elimination isn't public")
	}
	if ev.MatchEnded == nil || ev.MatchEnded.Winner != 0 {
		t.Errorf("ended = %+v, want Seat 0 last standing", ev.MatchEnded)
	}
}

func TestTheLastPlayerStandingWins(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	var ev Events
	s.eliminate(1, &ev)

	ev = s.Advance(c, 200)

	if ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: 0, Reason: ReasonLastStanding}) {
		t.Fatalf("ended = %+v, want Seat 0 last standing", ev.MatchEnded)
	}
	if ev := s.Advance(c, 90_000); len(ev.Paydays) != 0 {
		t.Error("the Match went on after it ended")
	}
}

func TestASoloMatchHasNoLastPlayerStanding(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	// Started alone, as on a one-player map: Seat 1's Planets are neutral.
	for _, p := range s.Planets {
		if p.Owner == 1 {
			p.Owner = Neutral
		}
	}
	s.Players = s.Players[:1]

	if ev := s.Advance(c, 200); ev.MatchEnded != nil {
		t.Fatalf("ended = %+v, want a solo Match to go on", ev.MatchEnded)
	}
	s.Forfeit(0)
	if ev := s.Advance(c, 400); ev.MatchEnded == nil || ev.MatchEnded.Reason != ReasonAbandoned {
		t.Errorf("ended = %+v, want surrendering to end it", ev.MatchEnded)
	}
}

func TestHoldingTheShareForTheHoldTimeWins(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	for _, id := range []string{"b", "c", "d"} {
		s.Planets[id].Owner = 0 // 4 of 5 is over 0.6
	}

	s.Advance(c, 1_000)
	if s.HoldSeat != 0 || s.HoldEnds != 91_000 {
		t.Fatalf("hold = Seat %d until %d, want Seat 0 until 91 s", s.HoldSeat, s.HoldEnds)
	}
	if h := s.View(c, 1).Hold; h != (Hold{Seat: 0, Ends: 91_000}) {
		t.Errorf("Seat 1 sees the hold as %+v; it's public", h)
	}
	if ev := s.Advance(c, 90_800); ev.MatchEnded != nil {
		t.Fatal("won before the hold ran out")
	}
	ev := s.Advance(c, 91_000)
	if ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: 0, Reason: ReasonHold}) {
		t.Errorf("ended = %+v, want Seat 0 by hold", ev.MatchEnded)
	}
}

func TestDroppingBelowTheShareCancelsTheHold(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	for _, id := range []string{"b", "c", "d"} {
		s.Planets[id].Owner = 0
	}
	s.Advance(c, 1_000)

	s.Planets["d"].Owner = 1 // back to 3 of 5: exactly 0.6 isn't over it
	s.Advance(c, 2_000)
	if s.HoldSeat != Neutral {
		t.Fatalf("hold = Seat %d, want it cancelled", s.HoldSeat)
	}

	s.Planets["d"].Owner = 0
	s.Advance(c, 50_000)
	if s.HoldEnds != 140_000 {
		t.Errorf("hold ends at %d, want a fresh 90 s from 50 s", s.HoldEnds)
	}
}

const grace = 180_000

func TestRunningOutTheGracePeriodIsAForfeit(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Advance(c, 10_000)
	s.Disconnect(1, grace)

	if p := s.View(c, 0).Players[1]; p.Connected || p.GraceEnds != 190_000 {
		t.Errorf("Seat 1 in Seat 0's View = %+v, want disconnected until 190 s", p)
	}
	if ev := s.Advance(c, 189_800); len(ev.Eliminated) != 0 {
		t.Fatal("eliminated before the Grace Period ran out")
	}
	ev := s.Advance(c, 190_000)
	if !slices.Equal(ev.Eliminated, []int{1}) || ev.MatchEnded == nil || ev.MatchEnded.Winner != 0 {
		t.Errorf("eliminated %v, ended %+v; want Seat 1 out and Seat 0 last standing", ev.Eliminated, ev.MatchEnded)
	}
}

func TestRejoiningWithinTheGracePeriodKeepsTheSeat(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Disconnect(1, grace)
	_ = s.QueueBuilding(c, 1, "e", 2, "base:barracks")
	s.Advance(c, 30_000) // the queue carries on while they're away
	s.Reconnect(1)

	ev := s.Advance(c, 200_000)

	if len(ev.Eliminated) != 0 || s.Players[1].Eliminated {
		t.Errorf("a returning player was eliminated: %v", ev.Eliminated)
	}
	if s.Planets["e"].Buildings[2] != "base:barracks" {
		t.Error("the disconnected player's queue didn't carry on")
	}
	if p := s.View(c, 0).Players[1]; !p.Connected || p.GraceEnds != 0 {
		t.Errorf("Seat 1 = %+v, want connected again", p)
	}
}

func TestSurrenderingIsAForfeitOnTheNextTick(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Forfeit(0)

	ev := s.Advance(c, 200)

	if !slices.Equal(ev.Eliminated, []int{0}) || ev.MatchEnded == nil || ev.MatchEnded.Winner != 1 {
		t.Errorf("eliminated %v, ended %+v; want Seat 0 out and Seat 1 the winner", ev.Eliminated, ev.MatchEnded)
	}
}

func TestTheLastPlayerMustBeConnectedToWin(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Disconnect(0, grace)
	s.Forfeit(1)

	if ev := s.Advance(c, 200); ev.MatchEnded != nil {
		t.Fatalf("a disconnected player won: %+v", ev.MatchEnded)
	}
	s.Reconnect(0)
	if ev := s.Advance(c, 400); ev.MatchEnded == nil || ev.MatchEnded.Winner != 0 {
		t.Errorf("ended %+v, want Seat 0 to win once back", ev.MatchEnded)
	}
}

func TestEveryoneRunningOutTheirGraceAbandonsTheMatch(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Disconnect(0, grace)
	s.Advance(c, 60_000)
	s.Disconnect(1, grace)

	ev := s.Advance(c, 180_000) // Seat 0 runs out first; Seat 1 is away too
	if ev.MatchEnded != nil {
		t.Fatalf("ended %+v while Seat 1 could still return", ev.MatchEnded)
	}
	ev = s.Advance(c, 240_000)
	if ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: Neutral, Reason: ReasonAbandoned}) {
		t.Errorf("ended %+v, want no winner, abandoned", ev.MatchEnded)
	}
}
