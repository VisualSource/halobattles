package battle

import (
	"maps"
	"slices"
	"testing"
)

// aiSim is a Battle with no Controllers, so a test drives the AI by hand.
func aiSim(t *testing.T, attack, defend Force) *Sim {
	t.Helper()
	c := baseContent(t)
	r := ruleset(c)
	return New(c, r, Generate(c, r.Battlefield, nil, 7), attack, defend, 7)
}

func marines(n int) [][]Slot {
	var f []Slot
	for cell := range n {
		f = append(f, Slot{"base:marine", 5, cell})
	}
	return [][]Slot{f}
}

func TestTheCommanderSpreadsSquadsOverThePoints(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(6)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.command(v, v.Own(), nil)

	points := map[Cell]bool{}
	for _, p := range ai.plans {
		if p.goal.kind == capture {
			points[p.goal.cell] = true
		}
	}
	if len(points) < 2 {
		t.Errorf("6 squads went for %d point(s); want them spread", len(points))
	}
}

// stageNear moves the attacker's first squad a few cells from point 0,
// where the defenders on it can see it.
func stageNear(t *testing.T, s *Sim) *Squad {
	t.Helper()
	a := s.Squads[0]
	p := s.Points[0].Cell
	for r := 4; r <= 7; r++ {
		for _, d := range steps {
			if c := p.add(d.scale(r)); s.standable(a, c) {
				s.relocate(a, c)
				s.see()
				return a
			}
		}
	}
	t.Fatal("nowhere to stand near point 0")
	return nil
}

func TestDefendersGoAfterAnEnemyTheySee(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}, {"base:grunt", 5, 2}}}})
	a := stageNear(t, s)
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.command(v, v.Own(), v.Enemies())

	if !slices.ContainsFunc(slices.Collect(maps.Values(ai.plans)), func(p *plan) bool { return p.goal.kind == kill && p.goal.target == a.ID }) {
		t.Error("no defender went after the Marines in plain view")
	}
}

func TestNoAggressionLeavesEnemiesAlone(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	stageNear(t, s)
	ai := NewAI(Weights{Aggression: 0, Caution: 1, Cover: 1, Raid: 1, Scout: 1})
	v := View{s, Defender}
	ai.command(v, v.Own(), v.Enemies())

	for id, p := range ai.plans {
		if p.goal.kind == kill {
			t.Errorf("squad %d hunts with aggression 0", id)
		}
	}
}

func TestAHurtCautiousSquadRegroupsBeforeItFights(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	sq, target := s.Squads[0], s.Squads[1]
	ai := NewAI(Weights{Aggression: 1, Caution: 1.5, Cover: 1, Raid: 1, Scout: 1})
	v := View{s, Attacker}

	sq.Members = sq.Members[:1] // 1 of 5 left
	p := &plan{goal: goal{kind: kill, cell: target.Cell, target: target.ID}}
	// A friend to regroup with, well past nearRadius.
	far := Cell{(sq.Cell.X + s.Field.W/2) % s.Field.W, sq.Cell.Y}
	s.Squads = append(s.Squads, &Squad{ID: len(s.Squads) + 1, Side: Attacker, Members: []Layers{{HP: 1}}, Cell: far})
	ai.replan(v, sq, p)
	if len(p.steps) == 0 || p.steps[0] != regroup {
		t.Errorf("plan %v, want it to regroup first", p.steps)
	}

	sq.Members = append(sq.Members, sq.Members[0], sq.Members[0], sq.Members[0]) // back to 4 of 5
	ai.replan(v, sq, p)
	if slices.Contains(p.steps, regroup) {
		t.Errorf("plan %v: a healthy squad shouldn't regroup", p.steps)
	}
}

func TestDefendersTakeCoverByTheirPoint(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	d := s.Squads[1]
	ai := NewAI(Weights{Aggression: 1, Caution: 1, Cover: 1.5, Raid: 1, Scout: 1})
	v := View{s, Defender}
	for _, p := range s.Points {
		if _, ok := s.coverNear(d, p.Cell, s.rules.CaptureRadius); ok {
			g := goal{kind: defend, cell: p.Cell}
			if ai.want(v, d, g)&inCover == 0 {
				t.Error("a defender holding a point with cover by it should want the cover")
			}
			return
		}
	}
	t.Skip("no cover by any point on this Battlefield")
}

// flipWatch counts how often each squad's goal changes.
type flipWatch struct {
	ai    *AI
	last  map[int]goal
	flips map[int]int
}

func (f *flipWatch) Orders(v View) []Order {
	out := f.ai.Orders(v)
	for id, p := range f.ai.plans {
		if old, ok := f.last[id]; ok && !old.same(p.goal) {
			f.flips[id]++
		}
		f.last[id] = p.goal
	}
	return out
}

// Regression: a squad sighting the enemy near its point turned away from the
// threat, lost sight of it, forgot it, and turned back, over and over: 128
// goal changes in one Battle against the Vault garrison.
func TestSquadsDontFlipFlopBetweenGoals(t *testing.T) {
	c := baseContent(t)
	r := ruleset(c)
	vault := Force{Formations: [][]Slot{{{"base:grunt", 10, 0}, {"base:wraith", 1, 1}}}}
	cov := Force{Formations: [][]Slot{{{"base:grunt", 10, 0}, {"base:ghost", 2, 1}, {"base:grunt", 6, 2}}}}
	worst := 0
	for seed := range uint64(20) {
		s := New(c, r, Generate(c, r.Battlefield, nil, seed), cov, vault, seed)
		w := &flipWatch{NewAI(WeightsOf(c.Factions["base:covenant"].Ai)), map[int]goal{}, map[int]int{}}
		s.Controllers = [2]Controller{w, NewAI(WeightsOf(nil))}
		for !s.Over {
			s.Step()
		}
		for _, n := range w.flips {
			worst = max(worst, n)
		}
	}
	if worst > 12 {
		t.Errorf("a squad changed goals %d times in one Battle; want at most 12", worst)
	}
}

// freeAt puts sq on a cell it can stand on about r cells from around.
func freeAt(t *testing.T, s *Sim, sq *Squad, around Cell, r int) {
	t.Helper()
	for k := r; k <= r+3; k++ {
		for _, d := range steps {
			if c := around.add(d.scale(k)); s.standable(sq, c) && dist(c, around) >= float64(r) {
				s.relocate(sq, c)
				return
			}
		}
	}
	t.Fatalf("nowhere about %d cells from %v", r, around)
}

func TestGuardsChaseOnALeashThenGoBack(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	a, d := s.Squads[0], s.Squads[1]
	point := s.Points[0].Cell
	ai := NewAI(WeightsOf(nil))
	p := &plan{goal: goal{kind: defend, cell: point}}
	ai.plans[d.ID] = p
	s.Tick = 1 // between the Commander's runs, so the goal stays as set

	freeAt(t, s, d, point, 0)
	freeAt(t, s, a, point, 6) // on the leash (6), out of a Grunt's range (5)
	s.see()
	if !s.visible[Defender][a.ID] {
		t.Skip("the Marines aren't in sight from here on this Battlefield")
	}
	orders := ai.Orders(View{s, Defender})
	if p.engaged != a.ID || !slices.ContainsFunc(orders, func(o Order) bool { return o.Squad == d.ID && o.Kind == Move }) {
		t.Fatalf("orders %+v, engaged %d; want the guard to go after the Marines", orders, p.engaged)
	}

	freeAt(t, s, d, point, 4)  // as if it gave chase
	freeAt(t, s, a, point, 14) // and the Marines fell back, off the leash
	s.see()
	s.Tick = 2
	orders = ai.Orders(View{s, Defender})
	if p.engaged != 0 || !slices.ContainsFunc(orders, func(o Order) bool { return o.Squad == d.ID && o.Kind == Move && o.Cell == point }) {
		t.Errorf("orders %+v, engaged %d; want the guard back to its point", orders, p.engaged)
	}
}
