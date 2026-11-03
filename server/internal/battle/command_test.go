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
	for range 2 * TicksPerSecond {
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
	s.Setup = 10 * TicksPerSecond
	s.Command(Attacker, Order{Kind: Move, Squad: 1, Cell: Cell{s.Field.W / 2, s.Field.H / 2}})
	if len(s.squad(1).path) > 0 {
		t.Error("the attacker was given a path in setup")
	}
}
