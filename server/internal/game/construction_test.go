package game

import (
	"strings"
	"testing"
)

// Seat 0's Capital a has 4 Building Slots: Barracks, Supply Pad, and two
// empty. Seat 0 starts with 1000 Credits.

func TestQueueBuildingChargesTheFullCostAndBuildsInItsSlot(t *testing.T) {
	s, c := fixedMatch(t), lineContent()

	if err := s.QueueBuilding(c, 0, "a", 2, "base:barracks"); err != nil {
		t.Fatal(err)
	}
	if got := s.Players[0].Resources["base:credits"]; got != 850 {
		t.Errorf("Credits = %d, want 850 after paying 150 up front", got)
	}

	s.Advance(c, 200)
	if q := s.Planets["a"].Queue; len(q) != 1 || q[0].EndsAt != 30_200 || !q[0].Started {
		t.Fatalf("queue = %+v, want it running until 30.2 s", q)
	}
	s.Advance(c, 30_200)
	if a := s.Planets["a"]; a.Buildings[2] != "base:barracks" || len(a.Queue) != 0 {
		t.Errorf("after 30 s: buildings %q, queue %+v", a.Buildings, a.Queue)
	}
}

func TestOnlyTheFirstQueueItemRuns(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueBuilding(c, 0, "a", 2, "base:barracks")
	_ = s.QueueBuilding(c, 0, "a", 3, "base:supply-pad")

	s.Advance(c, 0)
	if q := s.Planets["a"].Queue; q[1].Started || q[1].EndsAt != 0 {
		t.Fatalf("the second item started early: %+v", q[1])
	}
	s.Advance(c, 30_000)
	if q := s.Planets["a"].Queue; len(q) != 1 || q[0].Building != "base:supply-pad" || q[0].EndsAt != 60_000 {
		t.Errorf("after the first finished: queue %+v, want the Supply Pad running until 60 s", q)
	}
}

func TestQueueBuildingRejections(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(s *State)
		planet string
		slot   int
		build  string
		want   string
	}{
		{"not your Planet", nil, "b", 0, "base:barracks", "don't own"},
		{"occupied slot", nil, "a", 0, "base:barracks", "taken"},
		{"slot already queued", func(s *State) { _ = s.QueueBuilding(lineContent(), 0, "a", 2, "base:barracks") }, "a", 2, "base:barracks", "taken"},
		{"no such slot", nil, "a", 4, "base:barracks", "no Building Slot 5"},
		{"another Faction's building", nil, "a", 2, "base:hall", "can't build"},
		{"in debt", func(s *State) { s.Players[0].Resources["base:materials"] = -1 }, "a", 2, "base:barracks", "debt"},
		{"can't afford", func(s *State) { s.Players[0].Resources["base:credits"] = 100 }, "a", 2, "base:barracks", "not enough Credits"},
		{"Locked", func(s *State) { s.Planets["a"].Locked = true }, "a", 2, "base:barracks", "Locked"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := fixedMatch(t)
			if tc.setup != nil {
				tc.setup(s)
			}
			before := s.Players[0].Resources["base:credits"]

			err := s.QueueBuilding(lineContent(), 0, tc.planet, tc.slot, tc.build)

			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want %q", err, tc.want)
			}
			if s.Players[0].Resources["base:credits"] != before {
				t.Error("a rejected command still charged the cost")
			}
		})
	}
}

func TestCancelRefundsInFullBeforeStartAndHalfAfter(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueBuilding(c, 0, "a", 2, "base:barracks")
	_ = s.QueueBuilding(c, 0, "a", 3, "base:supply-pad")
	s.Advance(c, 0) // the Barracks starts; the Supply Pad waits
	barracks, supplyPad := s.Planets["a"].Queue[0].ID, s.Planets["a"].Queue[1].ID
	credits := func() int { return s.Players[0].Resources["base:credits"] }

	if err := s.CancelQueueItem(c, 0, supplyPad); err != nil || credits() != 850 {
		t.Errorf("cancel unstarted Supply Pad: err %v, Credits %d, want the full 200 back (850)", err, credits())
	}
	if err := s.CancelQueueItem(c, 0, barracks); err != nil || credits() != 925 {
		t.Errorf("cancel started Barracks: err %v, Credits %d, want 75 back (925)", err, credits())
	}
	if len(s.Planets["a"].Queue) != 0 {
		t.Errorf("queue = %+v, want empty", s.Planets["a"].Queue)
	}
	if err := s.CancelQueueItem(c, 0, barracks); err == nil {
		t.Error("cancelled an item that's already gone")
	}
}

func TestCancelingAnotherPlayersItemIsRejected(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueBuilding(c, 0, "a", 2, "base:barracks")

	if err := s.CancelQueueItem(c, 1, s.Planets["a"].Queue[0].ID); err == nil || !strings.Contains(err.Error(), "don't own") {
		t.Errorf("err = %v, want don't own", err)
	}
}

func TestSellRefundsHalfAndStopsUpkeepAtOnce(t *testing.T) {
	s, c := fixedMatch(t), lineContent()

	if err := s.SellBuilding(c, 0, "a", 0); err != nil { // the Barracks
		t.Fatal(err)
	}
	if got := s.Players[0].Resources["base:credits"]; got != 1075 || s.Planets["a"].Buildings[0] != "" {
		t.Errorf("Credits %d, slot %q; want 75 back and the slot empty", got, s.Planets["a"].Buildings[0])
	}
	paid := s.Advance(c, 90_000).Paydays
	if got := paid[0].Net["base:credits"]; got != 400 {
		t.Errorf("Payday net = %d, want 400 with no Barracks Upkeep", got)
	}
	if err := s.SellBuilding(c, 0, "a", 0); err == nil {
		t.Error("sold an empty slot")
	}
}

func TestQueuesPauseInDebtAndResumeAfter(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueBuilding(c, 0, "a", 2, "base:barracks")
	s.Advance(c, 0) // runs until 30 s

	s.Players[0].Resources["base:materials"] = -5
	s.Advance(c, 10_000)
	q := s.Planets["a"].Queue[0]
	if q.EndsAt != 0 || q.Remaining != 20_000 {
		t.Fatalf("in debt: %+v, want paused with 20 s left", q)
	}
	if v := s.View(c, 0); len(v.Planets[0].Queue) != 1 {
		t.Errorf("own queue missing from the View: %+v", v.Planets[0])
	}

	s.Advance(c, 50_000) // still in debt: no progress
	s.Players[0].Resources["base:materials"] = 0
	s.Advance(c, 60_000)
	if q := s.Planets["a"].Queue[0]; q.EndsAt != 80_000 {
		t.Errorf("out of debt: %+v, want it to resume and end at 80 s", q)
	}
}

func TestOtherPlayersQueuesStayHidden(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["d"].Owner = 0 // e, Seat 1's Capital, is now in Seat 0's vision
	_ = s.QueueBuilding(c, 1, "e", 2, "base:barracks")

	for _, p := range s.View(c, 0).Planets {
		if p.ID == "e" && len(p.Queue) != 0 {
			t.Errorf("Seat 0 sees Seat 1's queue on e: %+v", p.Queue)
		}
	}
}
