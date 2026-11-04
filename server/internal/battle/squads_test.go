package battle

import "testing"

// A Unit Slot fights as squads of at most its Unit Class's squadSize, all
// from the slot, so they go back to it together.
func TestAUnitSlotDeploysAsSquadsOfItsClassesSize(t *testing.T) {
	c := modContent(t)
	for id, n := range map[string]int{"base:infantry": 5, "base:vehicle": 2} {
		uc := c.UnitClasses[id]
		uc.SquadSize = &n
		c.UnitClasses[id] = uc
	}
	attack := Force{Formations: [][]Slot{{{"base:marine", 12, 0}, {"base:warthog", 3, 1}}}}
	_, cov := kits()
	s := newSim(c, attack, cov, 1)

	got := map[string][]int{}
	for _, sq := range s.Squads {
		if sq.Side != Attacker {
			continue
		}
		if sq.Formation != 0 || (sq.Unit == "base:marine") != (sq.Slot == 0) {
			t.Errorf("%s squad from formation %d, slot %d; want its Unit Slot's", sq.Unit, sq.Formation, sq.Slot)
		}
		got[sq.Unit] = append(got[sq.Unit], len(sq.Members))
	}
	if m, w := got["base:marine"], got["base:warthog"]; len(m) != 3 || m[0]+m[1]+m[2] != 12 || m[0] != 5 || len(w) != 2 || w[0] != 2 || w[1] != 1 {
		t.Errorf("squads %v; want Marines 5 5 2 and Warthogs 2 1", got)
	}
}
