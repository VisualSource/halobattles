package battle

import (
	"slices"
	"testing"
)

func TestASquadKitesOnlyWhatItOutrangesAndOutruns(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:warthog", 1, 0}, {"base:marine", 5, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:scorpion", 1, 1}}}})
	warthog, marines, grunts := s.Squads[0], s.Squads[1], s.Squads[2]
	if got := s.standoff(warthog, grunts); got != grunts.reach {
		t.Errorf("a Warthog's standoff from Grunts %v; want their range %v", got, grunts.reach)
	}
	if got := s.standoff(marines, grunts); got != 0 {
		t.Errorf("Marines' standoff from Grunts %v; want 0: no faster, no longer range", got)
	}
	if got := s.standoff(grunts, warthog); got != 0 {
		t.Errorf("Grunts' standoff from a Warthog %v; want 0", got)
	}
}

// kiteSim has a Warthog with Grunts close by, inside the Grunts' range.
func kiteSim(t *testing.T) (s *Sim, warthog, grunts *Squad) {
	t.Helper()
	s = aiSim(t, Force{Formations: [][]Slot{{{"base:warthog", 1, 0}}}}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	warthog, grunts = s.Squads[0], s.Squads[1]
	freeAt(t, s, grunts, s.Points[0].Cell, 0)
	freeAt(t, s, warthog, grunts.Cell, 3)
	s.see()
	return
}

func TestAKitingSquadPlansToFireFromOutOfReach(t *testing.T) {
	s, warthog, grunts := kiteSim(t)
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.own = v.Own()
	p := &plan{goal: goal{kind: kill, cell: grunts.Cell, target: grunts.ID}}
	ai.replan(v, warthog, p)
	if !slices.Contains(p.steps, keepDistance) {
		t.Fatalf("steps %v; want it to keep its distance from Grunts it outranges", p.steps)
	}
	to, ok := ai.cellFor(v, warthog, p)
	if d := dist(to, grunts.Cell); !ok || d <= grunts.reach || d > warthog.reach {
		t.Errorf("it fires from %v, %.1f cells off; want out of the Grunts' range %v and in its own %v", to, d, grunts.reach, warthog.reach)
	}
}

func TestAKitingGuardBacksOffAsItsTargetCloses(t *testing.T) {
	s, warthog, grunts := kiteSim(t)
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	p := &plan{goal: goal{kind: defend, cell: warthog.Cell}}
	orders := ai.engage(v, warthog, p, grunts)
	if len(orders) != 1 || orders[0].Kind != Move || dist(orders[0].Cell, grunts.Cell) <= grunts.reach {
		t.Errorf("orders %+v with the Grunts %.0f cells off; want it moving out of their range %v", orders, dist(warthog.Cell, grunts.Cell), grunts.reach)
	}
}

func TestACorneredKitingSquadHoldsAndFires(t *testing.T) {
	s, warthog, grunts := kiteSim(t)
	// Nowhere to stand past the Grunts' range: every such cell is blocked.
	foot := s.costsFor(warthog.class)
	for i := range foot {
		if d := dist(s.Field.cell(i), grunts.Cell); d > grunts.reach && d <= warthog.reach+1 {
			foot[i] = 0
		}
	}
	s.apply(Attacker, Order{Kind: Move, Squad: warthog.ID, Cell: grunts.Cell}) // on its way in
	if len(warthog.path) == 0 {
		t.Fatal("no path toward the Grunts to stop")
	}
	ai := NewAI(WeightsOf(nil))
	p := &plan{goal: goal{kind: defend, cell: warthog.Cell}}
	orders := ai.engage(View{s, Attacker}, warthog, p, grunts)
	if len(orders) != 1 || orders[0].Kind != Hold {
		t.Errorf("orders %+v; want it to stop and fire where it is, with no room to back off", orders)
	}
}
