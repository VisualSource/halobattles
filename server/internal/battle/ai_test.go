package battle

import (
	"maps"
	"math"
	"slices"
	"testing"
)

// aiSim is a Battle with no Controllers, so a test drives the AI by hand.
func aiSim(t *testing.T, attack, defend Force) *Sim {
	t.Helper()
	c := baseContent(t)
	r := ruleset(c)
	return New(c, r, openField(64, 48), attack, defend, 7)
}

func marines(n int) [][]Slot {
	var f []Slot
	for cell := range n {
		f = append(f, Slot{"base:marine", 5, cell})
	}
	return [][]Slot{f}
}

// A force bigger than one Task Force splits: past forceCap squads on the
// Command Post, a second force comes in on its own bearing, or squads go on
// to other goals.
func TestTheCommanderSplitsABigForce(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(6)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.command(v, v.Own(), nil)

	goals := map[goal]bool{}
	for _, p := range ai.plans {
		goals[p.goal] = true
	}
	if len(ai.forces) < 2 && len(goals) < 2 {
		t.Errorf("6 squads in %d Task Force(s) on %d goal(s); want them split", len(ai.forces), len(goals))
	}
	if !goals[goal{kind: assault, cell: s.commandPost().Cell, target: s.commandPost().ID}] {
		t.Errorf("goals %v; want the Command Post assaulted", goals)
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

// Squads the base can spare go after an enemy they see.
func TestDefendersGoAfterAnEnemyTheySee(t *testing.T) {
	var guards []Slot
	for cell := range 6 {
		guards = append(guards, Slot{"base:grunt", 5, cell})
	}
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{guards}})
	a := s.Squads[0]
	// In a guard's Sight, out of the Command Post's threat radius.
	g := s.Squads[1]
	placed := false
	for y := g.Cell.Y - 7; y <= g.Cell.Y+7 && !placed; y++ {
		for x := g.Cell.X - 7; x <= g.Cell.X+7 && !placed; x++ {
			if c := (Cell{x, y}); dist(c, g.Cell) <= 7 && dist(c, s.Field.CommandPost) > threatRadius+2 && s.standable(a, c) {
				s.relocate(a, c)
				placed = true
			}
		}
	}
	s.see()
	if !placed || !s.visible[Defender][a.ID] {
		t.Skip("no spot in a guard's Sight away from the Command Post on this Battlefield")
	}
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
	ai := NewAI(Weights{Aggression: 0, Caution: 1, Cover: 1, Raid: 1, Scout: 1, Mass: 1})
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
	ai := NewAI(Weights{Aggression: 1, Caution: 1.5, Cover: 1, Raid: 1, Scout: 1, Mass: 1})
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

func TestAGuardTakesTheBestGroundOnItsPoint(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	d := s.Squads[1]
	for _, p := range s.Points {
		post, ok := s.guardPost(d, p.Cell, 1)
		if !ok {
			continue
		}
		if dist(post, p.Cell) > s.rules.CaptureRadius {
			t.Errorf("post %v is off point %v: it wouldn't hold it", post, p.Cell)
		}
		// In cover if there's any there; and nothing it could pick is higher,
		// or as high with more cover.
		_, covered := s.coverNear(d, p.Cell, s.rules.CaptureRadius)
		if covered && s.coverAt(post) >= 0 {
			t.Errorf("point %v: post %v is in the open with cover at hand", p.Cell, post)
		}
		r := int(s.rules.CaptureRadius)
		for y := -r; y <= r; y++ {
			for x := -r; x <= r; x++ {
				c := p.Cell.add(Cell{x, y})
				if dist(c, p.Cell) > s.rules.CaptureRadius || !s.standable(d, c) || covered && s.coverAt(c) >= 0 {
					continue
				}
				if s.height(c) > s.height(post) || s.height(c) == s.height(post) && s.coverAt(c) < s.coverAt(post) {
					t.Errorf("point %v: post %v (height %d, cover %d), but %v has height %d, cover %d",
						p.Cell, post, s.height(post), s.coverAt(post), c, s.height(c), s.coverAt(c))
				}
			}
		}
	}

	// Settled on its point on worse ground, it moves to the post.
	p := s.Points[0].Cell
	post, _ := s.guardPost(d, p, 1)
	ai := NewAI(WeightsOf(nil))
	pl := &plan{goal: goal{kind: defend, cell: p}, steps: []action{}}
	worst, worstScore := Cell{}, math.Inf(1)
	r := int(s.rules.CaptureRadius)
	for y := -r; y <= r; y++ {
		for x := -r; x <= r; x++ {
			c := p.add(Cell{x, y})
			if dist(c, p) <= s.rules.CaptureRadius && s.standable(d, c) {
				if sc := s.postScore(d, p, c, 1); sc < worstScore {
					worst, worstScore = c, sc
				}
			}
		}
	}
	if s.postScore(d, p, post, 1)-worstScore <= 0.5 {
		t.Skip("point 0's ground is all alike")
	}
	s.relocate(d, worst)
	s.Tick = s.TPS() - d.ID%s.TPS() // its slot
	if o, ok := ai.takePost(View{s, Defender}, d, pl); !ok || o.Cell != post {
		t.Errorf("order %+v, %v; want a move to the post %v", o, ok, post)
	}
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

// focusSim has Marines with two squads of Grunts in range, one nearer.
func focusSim(t *testing.T) (s *Sim, marines, near, far *Squad) {
	t.Helper()
	s = aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	marines, near, far = s.Squads[0], s.Squads[1], s.Squads[2]
	freeAt(t, s, marines, s.Points[0].Cell, 0)
	freeAt(t, s, near, marines.Cell, 3)
	freeAt(t, s, far, marines.Cell, 4)
	s.see()
	return
}

func TestFireGoesForTheTargetAFriendIsAlreadyHitting(t *testing.T) {
	s, marines, near, far := focusSim(t)
	s.Tick = 10
	far.hitBy, far.hitAt = 99, s.Tick-1 // another of the attacker's squads fired on it
	if got := s.targetOf(marines); got != far {
		t.Errorf("the Marines fire at squad %d; want %d, which a friend is already hitting, over the nearer %d", got.ID, far.ID, near.ID)
	}
	s.Tick += 2 * underFireSeconds * s.TPS() // long ago now
	if got := s.targetOf(marines); got != near {
		t.Errorf("the Marines fire at squad %d; want the nearer %d once the friend's fire is old", got.ID, near.ID)
	}
}

func TestFireGoesForTheTargetWithFewestLeft(t *testing.T) {
	s, marines, _, far := focusSim(t)
	far.Members = far.Members[:2]
	if got := s.targetOf(marines); got != far {
		t.Errorf("the Marines fire at squad %d; want %d, with 2 left, over the nearer full squad", got.ID, far.ID)
	}
}

func TestTheCommanderSendsSquadsAfterWhatTheyreGoodAgainst(t *testing.T) {
	s, marines, grunts, _ := matchupSim(t)
	for i := range s.Points {
		s.Points[i].Owner = Attacker // nothing to capture: it's down to whom to fight
	}
	s.commandPost().Members = nil // nor to assault
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
	v.sim.Tick += 5 * s.TPS()
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
	if ai.roles[ghost.ID] != fallingBack || p.goal.kind != fallback || !slices.Contains(home(v), p.goal.cell) {
		t.Fatalf("role %v, goal %+v; want it falling back to its base or a held point", ai.roles[ghost.ID], p.goal)
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

// Seed 246130: a Warthog scouted the whole Battle while its base fell.
func TestAScoutComesHomeOnceTheEnemyIsFoundElsewhere(t *testing.T) {
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
	ai.sighted[marines.ID] = sighting{s.Field.CommandPost, 5, s.Tick} // at the base, nowhere near the scout
	if ai.inContact(v, ghost) {
		t.Skip("the scout starts in contact")
	}
	ai.assignRoles(v, v.Own(), nil)
	if r := ai.roles[ghost.ID]; r != noRole {
		t.Errorf("role %v with the enemy found; want it back to the usual goals", r)
	}
}

func TestSpareSquadsSkirmishBetweenThePoints(t *testing.T) {
	var f []Slot
	for cell := range 7 {
		f = append(f, Slot{"base:grunt", 5, cell})
	}
	f = append(f, Slot{"base:banshee", 1, 7})
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{f}})
	banshee := s.Squads[slices.IndexFunc(s.Squads, func(sq *Squad) bool { return sq.Unit == "base:banshee" })]
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
	s.Tick += 2 * restSeconds * s.TPS()
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
	s.Tick = beatEvery*s.TPS() - d.ID%s.TPS() + s.TPS() // past the wait, on its slot

	o, ok := ai.walkBeat(v, d, p)
	if !ok || o.Kind != Move || dist(o.Cell, point) > beatReach {
		t.Fatalf("order %+v, %v; want a walk to a stop within %d of the point", o, ok, beatReach)
	}
	if _, again := ai.walkBeat(v, d, p); again {
		t.Error("set out again straight away")
	}

	p.beatAt = -beatEvery * s.TPS()
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

// The trace hears each squad's first goal, then only changes: a whole
// Battle's decisions fit a log, and every one names a squad on its side.
func TestTheAITracesItsDecisions(t *testing.T) {
	c := baseContent(t)
	unsc, covenant := kits()
	s := newSim(c, unsc, covenant, 7)
	var got []Decision
	s.Controllers[Defender].(*AI).Trace = func(d Decision) { got = append(got, d) }
	run(s)
	if len(got) == 0 {
		t.Fatal("no decisions traced")
	}
	last := map[int]Decision{}
	for _, d := range got {
		if sq := s.squad(d.Squad); sq == nil || sq.Side != Defender {
			t.Errorf("traced %+v, not a defender's squad", d)
		}
		if old, ok := last[d.Squad]; ok && old.Goal == d.Goal && old.Target == d.Target && old.Role == d.Role && (d.Target != 0 || old.Cell == d.Cell) {
			t.Errorf("traced %+v again, unchanged", d)
		}
		last[d.Squad] = d
	}
	if len(got) > 20*s.Tick/s.TPS() {
		t.Errorf("%d decisions in %d s: more than a change a squad a second", len(got), s.Tick/s.TPS())
	}
}

// #109: a crowd round a pad stops a move within closeEnough, 3 cells, but
// the pad is taken only within the capture radius, 2: the squad goes on.
func TestASquadStoppedShortOfAPadGoesOnToTakeIt(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Setup, s.Builders[Defender] = 1000, true
	s.Pads = s.Pads[:1]
	pad := s.Pads[0].Cell
	g := s.Squads[1]
	s.relocate(g, pad.add(Cell{3, 0}))
	ai := NewAI(WeightsOf(nil))
	ai.plans[g.ID] = &plan{goal: goal{kind: takePad, cell: pad}, steps: []action{goTo}, sent: true, moveTo: pad}
	s.Controllers = [2]Controller{nil, ai}
	for range 60 {
		s.Step()
	}
	if s.Pads[0].Owner != Defender {
		t.Errorf("pad %+v, Grunts at %v; want it taken", s.Pads[0], g.Cell)
	}
}
