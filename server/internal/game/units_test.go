package game

import (
	"fmt"
	"strings"
	"testing"
)

// Seat 0's Capital a: a Barracks in slot 0 (trains Marines, ODSTs and a
// Spartan), a Supply Pad in slot 1, and Stack 1 holding 10 Marines and 2
// Warthogs: 16 of its 20 Command Points.

func TestQueueUnitExpandsIntoItemsThatReserveCommandPoints(t *testing.T) {
	s, c := fixedMatch(t), lineContent()

	if err := s.QueueUnit(c, 0, "a", 0, "base:marine", 4); err != nil {
		t.Fatal(err)
	}
	if q := s.Planets["a"].UnitQueues[0]; len(q) != 4 || s.Players[0].Resources["base:credits"] != 800 {
		t.Errorf("queue %d items, Credits %d; want 4 items and 200 charged", len(q), s.Players[0].Resources["base:credits"])
	}
	if used, _ := s.commandPoints(c, 0); used != 20 {
		t.Errorf("Command Points used = %d, want 20: queued units count", used)
	}

	err := s.QueueUnit(c, 0, "a", 0, "base:marine", 1)
	if err == nil || !strings.Contains(err.Error(), "Command Points") {
		t.Fatalf("over the cap: err = %v", err)
	}
	_ = s.CancelQueueItem(c, 0, s.Planets["a"].UnitQueues[0][3].ID)
	if err := s.QueueUnit(c, 0, "a", 0, "base:marine", 1); err != nil {
		t.Errorf("cancelling should free the Command Points: %v", err)
	}
}

func TestMaxCountCountsQueuedUnits(t *testing.T) {
	s, c := fixedMatch(t), lineContent()

	if err := s.QueueUnit(c, 0, "a", 0, "base:spartan", 2); err == nil || !strings.Contains(err.Error(), "at most 1 Spartans") {
		t.Errorf("2 over a maxCount of 1: err = %v", err)
	}
	if err := s.QueueUnit(c, 0, "a", 0, "base:spartan", 1); err != nil {
		t.Fatal(err)
	}
	if err := s.QueueUnit(c, 0, "a", 0, "base:spartan", 1); err == nil {
		t.Error("queued a second Spartan while one is in the queue")
	}
}

func TestQueueUnitRejections(t *testing.T) {
	cases := []struct {
		name  string
		setup func(s *State)
		slot  int
		unit  string
		count int
		want  string
	}{
		{"not a production building", nil, 1, "base:marine", 1, "can't train"},
		{"empty slot", nil, 2, "base:marine", 1, "no building"},
		{"unit it doesn't train", nil, 0, "base:grunt", 1, "can't train"},
		{"no count", nil, 0, "base:marine", 0, "at least one"},
		{"in debt", func(s *State) { s.Players[0].Resources["base:materials"] = -1 }, 0, "base:marine", 1, "debt"},
		{"can't afford all", func(s *State) { s.Players[0].Resources["base:credits"] = 120 }, 0, "base:marine", 3, "not enough Credits"},
		{"Locked", func(s *State) { s.Planets["a"].Locked = true }, 0, "base:marine", 1, "Locked"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := fixedMatch(t)
			if tc.setup != nil {
				tc.setup(s)
			}
			err := s.QueueUnit(lineContent(), 0, "a", tc.slot, tc.unit, tc.count)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want %q", err, tc.want)
			}
			if len(s.Planets["a"].UnitQueues) != 0 {
				t.Error("a rejected command still queued units")
			}
		})
	}
}

func TestTrainedUnitsJoinTheRallyStackOneAtATime(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.SetRallyStack(0, "a", 2)
	_ = s.QueueUnit(c, 0, "a", 0, "base:marine", 2)

	s.Advance(c, 0)
	s.Advance(c, 15_000)
	a := s.Planets["a"]
	if len(a.Stacks[2]) != 1 || a.Stacks[2][0] != (UnitSlot{Unit: "base:marine", Count: 1}) {
		t.Fatalf("Rally Stack 3 = %+v, want 1 Marine", a.Stacks[2])
	}
	if q := a.UnitQueues[0]; len(q) != 1 || q[0].EndsAt != 30_000 {
		t.Errorf("queue = %+v, want the second Marine running until 30 s", q)
	}
	s.Advance(c, 30_000)
	if a.Stacks[2][0].Count != 2 || len(a.UnitQueues) != 0 {
		t.Errorf("Stack 3 %+v, queues %+v; want 2 Marines merged and no queue", a.Stacks[2], a.UnitQueues)
	}
}

// fill gives a Stack n Unit Slots of filler units, keeping what it has.
func fill(st *Stack, n int) {
	for i := len(*st); i < n; i++ {
		*st = append(*st, UnitSlot{Unit: fmt.Sprintf("base:filler-%d", i), Count: 1})
	}
}

func TestTrainedUnitsOverflowThenBlockTheQueue(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]
	a.Stacks[0][0].Count = 1 // room for 3 ODSTs' Command Points
	fill(&a.Stacks[0], 10)   // the Rally Stack is full, and has no ODSTs
	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 1); err != nil {
		t.Fatal(err)
	}

	s.Advance(c, 0)
	s.Advance(c, 25_000)
	if len(a.Stacks[1]) != 1 || a.Stacks[1][0].Unit != "base:odst" {
		t.Fatalf("Stack 2 = %+v, want the ODST spilled over", a.Stacks[1])
	}

	fill(&a.Stacks[1], 10)
	fill(&a.Stacks[2], 10)
	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 2); err != nil { // they merge into Stack 2
		t.Fatal(err)
	}
	s.Advance(c, 25_000)
	s.Advance(c, 50_000)
	if a.Stacks[1][0].Count != 2 {
		t.Fatalf("an ODST should still merge into its existing Unit Slot: %+v", a.Stacks[1][0])
	}

	a.Stacks[1] = a.Stacks[1][1:] // the ODSTs leave; every Stack is full
	fill(&a.Stacks[1], 10)
	s.Advance(c, 75_000)
	s.Advance(c, 90_000)
	q := a.UnitQueues[0]
	if len(q) != 1 || q[0].EndsAt != 75_000 {
		t.Fatalf("queue = %+v, want the finished ODST stuck at the head", q)
	}

	a.Stacks[2] = a.Stacks[2][:9] // make room
	s.Advance(c, 90_200)
	if len(a.UnitQueues) != 0 || a.Stacks[0][9].Unit != "base:filler-9" || a.Stacks[2][9].Unit != "base:odst" {
		t.Errorf("after making room: queues %+v, Stack 3 %+v", a.UnitQueues, a.Stacks[2])
	}
}

func TestMoveUnitsBetweenStacks(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]

	if err := s.MoveUnits(c, 0, "a", 0, 1, "base:marine", 4); err != nil {
		t.Fatal(err)
	}
	if a.Stacks[0][0].Count != 6 || a.Stacks[1][0] != (UnitSlot{Unit: "base:marine", Count: 4}) {
		t.Fatalf("after moving 4: %+v", a.Stacks)
	}
	if err := s.MoveUnits(c, 0, "a", 0, 1, "base:marine", 6); err != nil {
		t.Fatal(err)
	}
	if a.Stacks[0][0].Unit != "base:warthog" || a.Stacks[1][0].Count != 10 {
		t.Errorf("moving the rest should empty and drop the Unit Slot, merging: %+v", a.Stacks)
	}

	for _, tc := range []struct {
		name     string
		setup    func()
		from, to int
		count    int
		want     string
	}{
		{"more than there are", nil, 1, 2, 11, "doesn't have"},
		{"same Stack", nil, 1, 1, 1, "two different"},
		{"full target", func() { fill(&a.Stacks[2], 10) }, 1, 2, 1, "no free Unit Slot"},
		{"Locked", func() { a.Locked = true }, 1, 0, 1, "Locked"},
	} {
		if tc.setup != nil {
			tc.setup()
		}
		if err := s.MoveUnits(c, 0, "a", tc.from, tc.to, "base:marine", tc.count); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: err = %v, want %q", tc.name, err, tc.want)
		}
	}
}

func TestSellingABuildingWithAUnitQueueIsRejected(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueUnit(c, 0, "a", 0, "base:marine", 1)

	if err := s.SellBuilding(c, 0, "a", 0); err == nil || !strings.Contains(err.Error(), "unit queue") {
		t.Errorf("err = %v, want the unit queue to block selling", err)
	}
}

func TestOtherPlayersSeeYourStacksButNotYourUnitQueues(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["d"].Owner = 0 // e is in Seat 0's vision
	_ = s.QueueUnit(c, 1, "e", 0, "base:marine", 1)
	_ = s.SetRallyStack(1, "e", 2)

	for _, p := range s.View(c, 0).Planets {
		if p.ID == "e" && (len(p.UnitQueue) != 0 || p.Rally != 0 || len(p.Stacks[0]) == 0) {
			t.Errorf("Seat 0's view of e = %+v, want Stacks but no unit queue or Rally Stack", p)
		}
	}
	for _, p := range s.View(c, 1).Planets {
		if p.ID == "e" && (len(p.UnitQueue) != 1 || p.Rally != 2) {
			t.Errorf("Seat 1's own e = %+v, want its unit queue and Rally Stack", p)
		}
	}
}
