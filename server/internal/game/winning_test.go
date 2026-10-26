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
