package battle

import "testing"

func TestAnAttackMoveStopsToFightThenGoesOn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	m, g := s.Squads[0], s.Squads[1]
	freeAt(t, s, g, m.Cell, max(1, int(m.reach)-1))
	far := Cell{s.Field.W - 1 - m.Cell.X, s.Field.H - 1 - m.Cell.Y}
	s.Command(Attacker, Order{Kind: AttackMove, Squad: m.ID, Cell: far})
	at := m.Cell
	for range 3 {
		s.Step()
	}
	if m.Cell != at || !m.alive() {
		t.Fatalf("an Attack-move with a Grunt squad in range moved from %v to %v; want it to stop and fight", at, m.Cell)
	}
	g.Members = nil
	for range 2 * s.TPS() {
		s.Step()
	}
	if m.Cell == at {
		t.Error("with nothing left in range, the Attack-move didn't go on")
	}
}

func TestAGroupMoveKeepsItsShape(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(3)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ids := []int{1, 2, 3}
	to := Cell{s.Field.W / 2, s.Field.H / 2}
	cells := s.Formation(Attacker, ids, to)
	seen := map[Cell]bool{}
	for i, c := range cells {
		sq := s.squad(ids[i])
		if seen[c] || !s.standable(sq, c) || dist(c, to) > maxSpread+4 {
			t.Errorf("squad %d sent to %v; want its own standable cell near %v", sq.ID, c, to)
		}
		seen[c] = true
	}
}

func TestTheAttackerCantMoveInSetup(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	s.Setup = 10 * s.TPS()
	s.Command(Attacker, Order{Kind: Move, Squad: 1, Cell: Cell{s.Field.W / 2, s.Field.H / 2}})
	if len(s.squad(1).path) > 0 {
		t.Error("the attacker was given a path in setup")
	}
}

// A Shift order goes on the end of the squad's queue; each starts once the
// one before is done, and an order without Shift, or Hold, replaces them all.
func TestQueuedOrdersRunInTurn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	m := s.Squads[0]
	first, second := m.Cell.add(Cell{3, 0}), m.Cell.add(Cell{3, 3})
	s.Command(Attacker, Order{Kind: Move, Squad: m.ID, Cell: first})
	s.Command(Attacker, Order{Kind: Move, Squad: m.ID, Cell: second, Queue: true})
	if v := s.Snapshot(Attacker).Squads[0]; v.Goal != first || len(v.Queue) != 1 || v.Queue[0].Cell != second {
		t.Fatalf("goal %v, queue %v; want on to %v, then %v", v.Goal, v.Queue, first, second)
	}
	for i := 0; i < 20*s.TPS() && m.Cell != second; i++ {
		s.Step()
	}
	if m.Cell != second {
		t.Fatalf("stopped at %v; want it at %v after %v", m.Cell, second, first)
	}

	s.Command(Attacker, Order{Kind: Move, Squad: m.ID, Cell: first})
	s.Command(Attacker, Order{Kind: Move, Squad: m.ID, Cell: second, Queue: true})
	s.Command(Attacker, Order{Kind: Hold, Squad: m.ID})
	if len(m.queue) != 0 || len(m.path) != 0 {
		t.Error("Hold left the queue; want it dropped")
	}
	s.Command(Attacker, Order{Kind: Move, Squad: m.ID, Cell: first, Queue: true}) // nothing under way: at once
	if m.goal != first || len(m.path) == 0 {
		t.Error("a queued order with nothing before it waits; want it started at once")
	}
}
