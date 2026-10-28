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

// matchupSim has Marines (advantage against infantry, disadvantage against
// vehicles) facing Grunts a little further off than a Warthog, all in view.
func matchupSim(t *testing.T) (s *Sim, marines, grunts, warthog *Squad) {
	t.Helper()
	s = aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:warthog", 1, 1}}}})
	marines, grunts, warthog = s.Squads[0], s.Squads[1], s.Squads[2]
	freeAt(t, s, marines, s.Points[0].Cell, 0)
	freeAt(t, s, warthog, marines.Cell, 3)
	freeAt(t, s, grunts, marines.Cell, 4)
	s.see()
	return
}

func TestFireGoesForTheBestMatchupInRange(t *testing.T) {
	s, marines, grunts, _ := matchupSim(t)
	if got := s.targetOf(marines); got != grunts {
		t.Errorf("the Marines fire at %v; want the Grunts they have Advantage against, over the nearer Warthog", got.Unit)
	}
}

func TestTheCommanderSendsSquadsAfterWhatTheyreGoodAgainst(t *testing.T) {
	s, marines, grunts, _ := matchupSim(t)
	for i := range s.Points {
		s.Points[i].Owner = Attacker // nothing to capture: it's down to whom to fight
	}
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.command(v, v.Own(), v.Enemies())
	if g := ai.plans[marines.ID].goal; g.kind != kill || g.target != grunts.ID {
		t.Errorf("the Marines' goal is %+v; want to kill the Grunts", g)
	}
}

func TestAGuardOnItsLeashTakesTheBestMatchup(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	marines, warthog, grunts := s.Squads[0], s.Squads[1], s.Squads[2]
	point := s.Points[0].Cell
	freeAt(t, s, grunts, point, 0)
	freeAt(t, s, warthog, point, 3)
	freeAt(t, s, marines, point, 5)
	s.see()
	ai := NewAI(WeightsOf(nil))
	p := &plan{goal: goal{kind: defend, cell: point}}
	if got := ai.intruder(View{s, Defender}, grunts, p, View{s, Defender}.Enemies()); got != marines {
		t.Errorf("the guard goes after %v; want the Marines it has Advantage against", got)
	}
}

func TestTheDefenderSendsItsFastestSquadToScout(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 2, 1}, {"base:grunt", 5, 2}}}})
	ghost := s.Squads[2]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.command(v, v.Own(), nil)

	p := ai.plans[ghost.ID]
	if p == nil || p.goal.kind != scout {
		t.Fatalf("the Ghosts' plan is %+v; want them out scouting, as the fastest", p)
	}
	scouts := 0
	for _, q := range ai.plans {
		if q.goal.kind == scout {
			scouts++
		}
	}
	if scouts != 1 {
		t.Errorf("%d scouts out of 3 squads; want 1, the rest on the points", scouts)
	}
	near := slices.ContainsFunc(s.Points, func(pt Point) bool { return dist(pt.Cell, p.goal.cell) < block })
	if near {
		t.Errorf("waypoint %v is by one of the side's own points", p.goal.cell)
	}
	attackerSide := s.depth(s.Edge, p.goal.cell) < max(s.Field.W, s.Field.H)/2
	if !attackerSide {
		t.Errorf("waypoint %v is on the defender's half; want it toward the attacker's edge %d", p.goal.cell, s.Edge)
	}

	// Once that block has been looked at, the next one is somewhere else.
	first := p.goal.cell
	ghost.Cell = first
	ai.look(v, v.Own())
	v.sim.Tick += 5 * TicksPerSecond
	ai.command(v, v.Own(), nil)
	if next := ai.plans[ghost.ID].goal; next.kind != scout || next.cell == first {
		t.Errorf("after reaching %v the scout's goal is %+v; want a new waypoint", first, next)
	}
}

func TestAScoutInContactIsReleased(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 2, 1}, {"base:grunt", 5, 2}}}})
	marines, ghost := s.Squads[0], s.Squads[2]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.sighted[marines.ID] = sighting{ghost.Cell.add(Cell{2, 0}), 5, 0}
	ai.look(v, v.Own())
	ai.command(v, v.Own(), nil)
	if p := ai.plans[ghost.ID]; p != nil && p.goal.kind == scout {
		t.Errorf("the Ghosts went scouting with the enemy beside them: %+v", p.goal)
	}
}

func TestTheAttackerDoesntHoldBackScouts(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 2, 1}, {"base:grunt", 5, 2}}}},
		Force{Formations: [][]Slot{{{"base:marine", 1, 0}}}})
	ai := NewAI(WeightsOf(nil))
	ai.assignRoles(View{s, Attacker}, View{s, Attacker}.Own(), nil)
	if len(ai.roles) != 0 {
		t.Errorf("the attacker gave out roles %v; with 3 squads for 3 points, every one should press the attack", ai.roles)
	}
}

func TestTaggedScoutsAreChosenOverFasterSquads(t *testing.T) {
	// The Hornet (aircraft) is faster, but the Ghosts are tagged to scout.
	s := aiSim(t, Force{Formations: marines(1)},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:hornet", 1, 1}, {"base:ghost", 2, 2}, {"base:grunt", 5, 3}}}})
	hornet, ghost := s.Squads[2], s.Squads[3]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.assignRoles(v, v.Own(), nil)
	if ai.roles[ghost.ID] != scouting || ai.roles[hornet.ID] == scouting {
		t.Errorf("roles %v; want the tagged Ghosts scouting, not the faster Hornet", ai.roles)
	}
}

func TestAScoutFallsBackFromTheEnemyThenRests(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 2, 1}, {"base:grunt", 5, 2}}}})
	marines, ghost := s.Squads[0], s.Squads[2]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.assignRoles(v, v.Own(), nil)
	if ai.roles[ghost.ID] != scouting {
		t.Fatalf("roles %v; want the Ghosts scouting", ai.roles)
	}

	freeAt(t, s, ghost, s.Points[0].Cell, 12)
	ai.sighted[marines.ID] = sighting{ghost.Cell.add(Cell{2, 0}), 5, 0}
	ai.assignRoles(v, v.Own(), nil)
	p := ai.plans[ghost.ID]
	if ai.roles[ghost.ID] != fallingBack || p.goal.kind != fallback || !slices.ContainsFunc(s.Points, func(pt Point) bool { return pt.Cell == p.goal.cell }) {
		t.Fatalf("role %v, goal %+v; want it falling back to a held point", ai.roles[ghost.ID], p.goal)
	}

	delete(ai.sighted, marines.ID)
	freeAt(t, s, ghost, p.goal.cell, 1) // it made it back
	ai.assignRoles(v, v.Own(), nil)
	if ai.roles[ghost.ID] != noRole {
		t.Errorf("role %v once safe; want it back to the usual goals", ai.roles[ghost.ID])
	}
	if ai.assignRoles(v, v.Own(), nil); ai.roles[ghost.ID] == scouting {
		t.Error("it went straight back out; want it to rest first")
	}
}

func TestSpareSquadsSkirmishBetweenThePoints(t *testing.T) {
	var f []Slot
	for cell := range 7 {
		f = append(f, Slot{"base:grunt", 5, cell})
	}
	f = append(f, Slot{"base:banshee", 1, 7})
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{f}})
	banshee := s.Squads[len(s.Squads)-1]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.assignRoles(v, v.Own(), nil)
	// 8 mobile, 3 points: 3 guards, 2 scouts, and round(8 × 0.1) = 1 skirmisher.
	n := 0
	for _, r := range ai.roles {
		if r == skirmish {
			n++
		}
	}
	if n != 1 || ai.roles[banshee.ID] != skirmish {
		t.Fatalf("roles %v; want 1 skirmisher, the tagged Banshee", ai.roles)
	}
	stops := ai.stops(v)
	if g := ai.plans[banshee.ID].goal; g.kind != patrol || !slices.Contains(stops, g.cell) {
		t.Errorf("the Banshee's goal is %+v; want a patrol stop of %v", g, stops)
	}
}

func TestASkirmisherHuntsWhatItCanTakeAndFallsBackFromTheRest(t *testing.T) {
	for _, tc := range []struct {
		marines int
		hunts   bool
	}{{2, true}, {5, false}} { // 2 Ghosts take on 2 Marines, not 5
		// Six squads: one per point, a scout, and two to spare.
		s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", tc.marines, 0}}}},
			Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 2, 1}, {"base:grunt", 5, 2},
				{"base:grunt", 5, 3}, {"base:grunt", 5, 4}, {"base:grunt", 5, 5}}}})
		marines, ghost := s.Squads[0], s.Squads[2]
		freeAt(t, s, ghost, s.Points[0].Cell, 10)
		freeAt(t, s, marines, ghost.Cell, 4)
		s.see()
		ai := NewAI(WeightsOf(nil))
		v := View{s, Defender}
		ai.roles[ghost.ID] = skirmish
		ai.remember(v, v.Own(), v.Enemies())
		ai.assignRoles(v, v.Own(), v.Enemies())
		g := ai.plans[ghost.ID].goal
		if tc.hunts && (g.kind != kill || g.target != marines.ID) {
			t.Errorf("against %d Marines: goal %+v; want it hunting them", tc.marines, g)
		}
		if !tc.hunts && g.kind != fallback {
			t.Errorf("against %d Marines: goal %+v; want it falling back", tc.marines, g)
		}
	}
}

func TestScoutsAndSkirmishersAreAHandfulInABigForce(t *testing.T) {
	var f [][]Slot
	for range 3 {
		var st []Slot
		for cell := range 15 {
			st = append(st, Slot{"base:grunt", 3, cell})
		}
		f = append(f, st)
	}
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: f})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.assignRoles(v, v.Own(), nil)
	n := 0
	for _, r := range ai.roles {
		if r == skirmish {
			n++
		}
	}
	if n != maxSkirmishers {
		t.Errorf("%d skirmishers out of 45 squads; want %d at most", n, maxSkirmishers)
	}
	scouts := 0
	for _, r := range ai.roles {
		if r == scouting {
			scouts++
		}
	}
	if scouts != maxScouts {
		t.Errorf("%d scouts out of 45 squads; want %d at most", scouts, maxScouts)
	}

	// The force shrinks to 6 squads: 3 for the points, scouts, and at most 2
	// to spare.
	for _, sq := range s.Squads[7:] {
		sq.Members = nil
	}
	ai.assignRoles(v, v.Own(), nil)
	n = 0
	for id, r := range ai.roles {
		if r == skirmish && s.squad(id).alive() {
			n++
		}
	}
	if n > 2 {
		t.Errorf("%d skirmishers with 2 squads to spare", n)
	}
}

func TestATwoSquadGarrisonScoutsOnce(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)},
		Force{Formations: [][]Slot{{{"base:grunt", 10, 0}, {"base:wraith", 1, 1}}}}) // the Vault's garrison
	wraith := s.Squads[2]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	ai.look(v, v.Own())
	ai.assignRoles(v, v.Own(), nil)
	if ai.roles[wraith.ID] != scouting {
		t.Fatalf("roles %v; want the faster Wraith out scouting", ai.roles)
	}

	// It met the enemy, fell back, and rested long since.
	delete(ai.roles, wraith.ID)
	ai.rested[wraith.ID] = s.Tick
	s.Tick += 2 * restTicks
	ai.assignRoles(v, v.Own(), nil)
	for id, r := range ai.roles {
		if r == scouting {
			t.Errorf("squad %d went scouting again; a two-squad garrison scouts once", id)
		}
	}
}

func TestAnIdleGuardWalksABeatUntilTheEnemyShows(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	marines, d := s.Squads[0], s.Squads[1]
	point := s.Points[0].Cell
	freeAt(t, s, d, point, 0)
	ai := NewAI(WeightsOf(nil))
	p := &plan{goal: goal{kind: defend, cell: point}, steps: []action{}}
	ai.plans[d.ID] = p
	v := View{s, Defender}
	s.Tick = beatEvery*TicksPerSecond - d.ID%TicksPerSecond + TicksPerSecond // past the wait, on its slot

	o, ok := ai.walkBeat(v, d, p)
	if !ok || o.Kind != Move || dist(o.Cell, point) > beatReach {
		t.Fatalf("order %+v, %v; want a walk to a stop within %d of the point", o, ok, beatReach)
	}
	if _, again := ai.walkBeat(v, d, p); again {
		t.Error("set out again straight away")
	}

	p.beatAt = -beatEvery * TicksPerSecond
	ai.sighted[marines.ID] = sighting{marines.Cell, 5, s.Tick}
	if _, ok := ai.walkBeat(v, d, p); ok {
		t.Error("walked its beat with the enemy seen")
	}
}

func TestRolesGrowWithTheForce(t *testing.T) {
	for _, tc := range []struct{ squads, scouts, skirmishers int }{
		{3, 1, 0},
		{10, 2, 1},
	} {
		var f []Slot
		for cell := range tc.squads {
			f = append(f, Slot{"base:grunt", 3, cell})
		}
		s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{f}})
		ai := NewAI(WeightsOf(nil))
		v := View{s, Defender}
		ai.look(v, v.Own())
		ai.assignRoles(v, v.Own(), nil)
		got := map[role]int{}
		for _, r := range ai.roles {
			got[r]++
		}
		if got[scouting] != tc.scouts || got[skirmish] != tc.skirmishers {
			t.Errorf("%d squads: %d scouts and %d skirmishers, want %d and %d", tc.squads, got[scouting], got[skirmish], tc.scouts, tc.skirmishers)
		}
	}
}
