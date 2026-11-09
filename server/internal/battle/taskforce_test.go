package battle

import (
	"slices"
	"testing"
)

// moves lists the cells and paces the orders send each squad.
func moves(orders []Order) map[int]Order {
	out := map[int]Order{}
	for _, o := range orders {
		if o.Kind == Move {
			out[o.Squad] = o
		}
	}
	return out
}

func TestATaskForceGathersThenGoesInBehindItsVehiclesAtTheSlowestPace(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	cpPhase(s) // no scout sent off to look for the Command Post
	marines, warthog := s.Squads[0], s.Squads[1]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}

	sent := moves(ai.Orders(v))
	tf := ai.forceOf[marines.ID]
	if tf == nil || ai.forceOf[warthog.ID] != tf {
		t.Fatalf("Task Forces %v; want the Marines and the Warthog in one", ai.forceOf)
	}
	if tf.going {
		t.Fatalf("its goal %v is %.0f cells off, yet it went straight in", tf.goal.cell, dist(marines.Cell, tf.goal.cell))
	}
	if d := dist(tf.stage, tf.goal.cell); d < stageDist-2 || d > stageDist+4 {
		t.Errorf("it gathers %.1f cells from its goal; want about %d", d, stageDist)
	}
	for _, sq := range []*Squad{marines, warthog} {
		if o := sent[sq.ID]; o.Cell != tf.stage {
			t.Errorf("%s sent to %v; want the stage %v", sq.Unit, o.Cell, tf.stage)
		}
	}

	s.relocate(marines, tf.stage)
	freeAt(t, s, warthog, tf.stage, 1)
	s.Tick = s.TPS() // the Commander's next pass
	sent = moves(ai.Orders(v))
	if !tf.going {
		t.Fatal("gathered, yet it didn't go in")
	}
	if o, ok := sent[warthog.ID]; !ok || o.Pace != marines.speed {
		t.Errorf("the Warthog: order %+v; want it leading at the Marines' pace %v", o, marines.speed)
	}
	if o, ok := sent[marines.ID]; ok {
		t.Errorf("the Marines: order %+v; want them waiting till the Warthog is ahead", o)
	}

	// The Warthog gets ahead: the Marines follow, at their own pace.
	ahead := func() float64 { return dist(marines.Cell, tf.goal.cell) - dist(warthog.Cell, tf.goal.cell) }
	freeAt(t, s, warthog, tf.goal.cell, int(dist(marines.Cell, tf.goal.cell))-followDist-2)
	s.Tick++
	sent = moves(ai.Orders(v))
	if o, ok := sent[marines.ID]; !ok || o.Pace != marines.speed {
		t.Errorf("the Warthog %.0f cells nearer the goal: the Marines' order %+v; want them following at pace %v",
			ahead(), o, marines.speed)
	}
}

func TestAPacedMoveGoesNoFasterThanItsPace(t *testing.T) {
	travelled := func(pace float64) float64 {
		s := aiSim(t, Force{Formations: [][]Slot{{{"base:warthog", 1, 0}}}}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
		w := s.Squads[0]
		from := w.Cell
		s.apply(Attacker, Order{Kind: Move, Squad: w.ID, Cell: s.Points[0].Cell, Pace: pace})
		for range 3 * s.TPS() {
			s.move()
		}
		return dist(from, w.Cell)
	}
	if fast, slow := travelled(0), travelled(1); slow >= fast || slow > 3*1.5 {
		t.Errorf("the Warthog went %.1f cells at its own speed and %.1f at pace 1 in 3 s; want the paced move shorter, under 4.5", fast, slow)
	}
}

func TestAGoalThatNeedsMoreThanACapGetsTaskForcesOnDifferentBearings(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(6)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	g := goal{kind: capture, cell: s.Points[0].Cell}
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})

	var forces []*taskForce
	for _, tf := range ai.forces {
		forces = append(forces, tf)
	}
	slices.SortFunc(forces, func(a, b *taskForce) int { return a.n - b.n })
	if len(forces) != 2 || len(forces[0].members) != 3 || len(forces[1].members) != 3 {
		t.Fatalf("%d Task Forces; want 2, of 3 squads each: dealt round, so each gets some of the best", len(forces))
	}
	if forces[0].going || forces[1].going {
		t.Fatal("went straight in; want them to gather first")
	}
	if dist(forces[0].stage, forces[1].stage) < 4 {
		t.Errorf("they gather at %v and %v; want them apart, to come in from two sides", forces[0].stage, forces[1].stage)
	}
}

func TestADefenderWhoseCommandPostIsUnderFireGoesStraightIn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	far := s.Points[0].Cell
	own := slices.DeleteFunc(v.Own(), func(sq *Squad) bool { return sq.Building }) // the Grunts, not the Command Post
	freeAt(t, s, own[0], far, 20)
	freeAt(t, s, own[1], own[0].Cell, 1)
	g := goal{kind: capture, cell: far}

	ai.form(v, []goal{g}, [][]*Squad{own})
	if tf := ai.forceOf[own[0].ID]; tf == nil || tf.going {
		t.Fatalf("Task Force %+v; want it gathering first while there's time", tf)
	}
	ai = NewAI(WeightsOf(nil))
	s.commandPost().Members[0].Armor-- // hit: its Armor goes before its HP
	ai.form(v, []goal{g}, [][]*Squad{own})
	if tf := ai.forceOf[own[0].ID]; tf == nil || !tf.going {
		t.Errorf("Task Force %+v; want it straight in while the Command Post is under fire", tf)
	}
}

func TestAMemberStoppedByAFightOnTheWayIsSentOnToTheStage(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	marines := s.Squads[0]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	for _, o := range ai.Orders(v) {
		s.apply(Attacker, o)
	}
	tf := ai.forceOf[marines.ID]
	if tf == nil || tf.going || marines.goal != tf.stage {
		t.Fatalf("Task Force %+v; want the Marines on their way to gather", tf)
	}

	// A fight on the way: the guard's engage holds it, then the enemy's gone.
	s.apply(Attacker, Order{Kind: Hold, Squad: marines.ID})
	ai.plans[marines.ID].engaged = 99
	s.Tick = 1 // between the Commander's passes
	if o, ok := moves(ai.Orders(v))[marines.ID]; !ok || o.Cell != tf.stage {
		t.Errorf("after the fight: order %+v; want the Marines sent on to the stage %v", o, tf.stage)
	}
	if tf.gathered() {
		t.Error("counted as gathered while still far from the stage")
	}
}

func TestASquadStaysInItsTaskForceWhenAnotherJoinsTheGoal(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(6)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	g := goal{kind: capture, cell: s.Points[0].Cell}
	own := v.Own()
	ai.form(v, []goal{g}, [][]*Squad{own[1:]})
	first := ai.forceOf[own[4].ID]
	first.going = true

	ai.form(v, []goal{g}, [][]*Squad{own}) // squad 0 joins the goal
	if ai.forceOf[own[4].ID] != first || !first.going {
		t.Errorf("squad %d moved Task Force; want it kept in the one going in", own[4].ID)
	}
	if tf := ai.forceOf[own[0].ID]; tf == first || tf.going {
		t.Errorf("the newcomer joined %+v; want the one still gathering", tf)
	}
}

func TestTheCommanderMassesSquadsOnOneGoal(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(2)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	cpPhase(s) // no scout sent off to look for the Command Post
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.command(v, v.Own(), nil)
	a, b := ai.plans[s.Squads[0].ID], ai.plans[s.Squads[1].ID]
	if a == nil || b == nil || !a.goal.same(b.goal) {
		t.Errorf("goals %+v and %+v; want both squads on one goal, at least %d to a Task Force", a, b, minForce)
	}
}

func TestAGuardLeavesAQuietPointForOneUnderThreat(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	quiet, hot := s.Points[0].Cell, s.Points[1].Cell
	a, b := s.Squads[1], s.Squads[2]
	freeAt(t, s, a, quiet, 0)
	freeAt(t, s, b, hot, 0)
	s.commandPost().Members = nil // gone, so it's down to the points
	s.Points[0].Owner, s.Points[1].Owner = Defender, Defender
	ai := NewAI(Weights{Aggression: 1, Caution: 1, Cover: 1, Raid: 1, Scout: 0, Mass: 1}) // no scouting: both guard
	v := View{s, Defender}
	ai.command(v, v.Own(), nil)
	if p := ai.plans[a.ID]; p == nil || p.goal.cell != quiet {
		t.Fatalf("with nothing seen: plan %+v; want the guard on its own point %v", p, quiet)
	}
	ai.sighted[99] = sighting{hot, 15, s.Tick} // a big attack seen at the other point
	ai.command(v, v.Own(), nil)
	if p := ai.plans[a.ID]; p == nil || p.goal.kind != defend || p.goal.cell != hot {
		t.Errorf("plan %+v; want the guard sent to hold the threatened point %v", p, hot)
	}
}

// targetSim has a Task Force of two Marine squads with two Grunt squads in
// range: one nearer and smaller, one further off.
func targetSim(t *testing.T) (s *Sim, ai *AI, tf *taskForce, near, far *Squad) {
	t.Helper()
	s = aiSim(t, Force{Formations: marines(2)}, Force{Formations: [][]Slot{{{"base:grunt", 3, 0}, {"base:grunt", 5, 1}}}})
	a, b := s.Squads[0], s.Squads[1]
	near, far = s.Squads[2], s.Squads[3]
	freeAt(t, s, a, s.Points[0].Cell, 0)
	freeAt(t, s, b, a.Cell, 1)
	freeAt(t, s, near, a.Cell, 3)
	freeAt(t, s, far, a.Cell, 5)
	s.see()
	ai = NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.form(v, []goal{{kind: capture, cell: s.Points[1].Cell}}, [][]*Squad{{a, b}})
	tf = ai.forceOf[a.ID]
	tf.going = true
	for _, sq := range tf.members {
		ai.plans[sq.ID] = &plan{goal: tf.goal}
	}
	return
}

func TestATaskForcesSquadsAllFireOnOneTarget(t *testing.T) {
	s, ai, tf, near, _ := targetSim(t)
	v := View{s, Attacker}
	ai.pickTarget(v, tf, v.Enemies())
	if tf.target != near.ID {
		t.Fatalf("target %d; want the nearer, smaller squad %d", tf.target, near.ID)
	}
	s.Tick = 1 // between the Commander's passes
	attacks := map[int]int{}
	for _, o := range ai.Orders(v) {
		if o.Kind == Attack {
			attacks[o.Squad] = o.Target
		}
	}
	for _, sq := range tf.members {
		if attacks[sq.ID] != near.ID {
			t.Errorf("squad %d attacks %d; want the force's target %d", sq.ID, attacks[sq.ID], near.ID)
		}
	}
}

func TestATaskForceTurnsOnWhateverShootsOneOfItsSquads(t *testing.T) {
	s, ai, tf, _, far := targetSim(t)
	v := View{s, Attacker}
	s.Tick = 10
	tf.members[1].hitBy, tf.members[1].hitAt = far.ID, s.Tick-1
	ai.pickTarget(v, tf, v.Enemies())
	if tf.target != far.ID {
		t.Errorf("target %d; want %d, which just fired on one of its squads", tf.target, far.ID)
	}
}

func TestATaskForcesAircraftHuntWhatTheRestFightBadly(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:hornet", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}, {"base:ghost", 1, 1}}}})
	marines, hornet, grunts, ghost := s.Squads[0], s.Squads[1], s.Squads[2], s.Squads[3]
	freeAt(t, s, marines, s.Points[0].Cell, 0)
	freeAt(t, s, hornet, marines.Cell, 1)
	freeAt(t, s, grunts, marines.Cell, 3)
	freeAt(t, s, ghost, marines.Cell, 4)
	s.see()
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.form(v, []goal{{kind: capture, cell: s.Points[1].Cell}}, [][]*Squad{{marines, hornet}})
	tf := ai.forceOf[marines.ID]
	ai.pickTarget(v, tf, v.Enemies())
	if tf.target != grunts.ID || tf.huntTarget != ghost.ID {
		t.Errorf("target %d, hunt %d; want the Grunts %d for the force and the Ghost %d, which Marines fight at Disadvantage, for the Hornet",
			tf.target, tf.huntTarget, grunts.ID, ghost.ID)
	}
	if o := ai.aim(v, hornet, tf); len(o) != 1 || o[0].Target != ghost.ID {
		t.Errorf("the Hornet's orders %+v; want an attack on the Ghost", o)
	}
}

func TestAGuardShotFromJustOffItsLeashAnswers(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:warthog", 1, 0}}}}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	a, d := s.Squads[0], s.Squads[1]
	point := s.Points[0].Cell
	ai := NewAI(WeightsOf(nil))
	p := &plan{goal: goal{kind: defend, cell: point}}
	ai.plans[d.ID] = p
	freeAt(t, s, d, point, 0)
	freeAt(t, s, a, point, leash+1) // off the leash, in a Warthog's range (7) of the guard
	s.see()
	if !s.visible[Defender][a.ID] {
		t.Skip("the Warthog isn't in sight from here on this Battlefield")
	}
	v := View{s, Defender}
	s.Tick = 1 // between the Commander's runs
	ai.Orders(v)
	if p.engaged != 0 {
		t.Fatalf("engaged %d with no shot fired; want the guard on its point", p.engaged)
	}
	s.Tick = 2
	d.hitBy, d.hitAt = a.ID, s.Tick-1
	ai.Orders(v)
	if p.engaged != a.ID {
		t.Errorf("engaged %d; want the guard answering the Warthog that shot it from off its leash", p.engaged)
	}
}

func TestASquadThatLeavesItsTaskForceDropsTheForcesTarget(t *testing.T) {
	s, ai, tf, near, _ := targetSim(t)
	v := View{s, Attacker}
	ai.pickTarget(v, tf, v.Enemies())
	sq := tf.members[0]
	for _, o := range ai.aim(v, sq, tf) {
		s.apply(Attacker, o)
	}
	if sq.target != near.ID {
		t.Fatalf("target %d; want the force's %d", sq.target, near.ID)
	}
	for _, o := range ai.aim(v, sq, nil) { // it's left the force, say to guard a point
		s.apply(Attacker, o)
	}
	if sq.target != 0 {
		t.Errorf("target %d after leaving its Task Force; want it back to the sim's own pick", sq.target)
	}
}

func TestFollowersComeOnOnceTheirLeadersStall(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	marines, warthog := s.Squads[0], s.Squads[1]
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	ai.form(v, []goal{{kind: capture, cell: s.Points[0].Cell}}, [][]*Squad{{marines, warthog}})
	tf := ai.forceOf[marines.ID]
	tf.going = true
	freeAt(t, s, warthog, s.Points[0].Cell, 12)
	freeAt(t, s, marines, warthog.Cell, 1) // level with it: it should wait
	if dist(marines.Cell, tf.goal.cell) >= dist(warthog.Cell, tf.goal.cell)+followDist {
		t.Skip("the Marines landed well behind the Warthog on this Battlefield")
	}
	p := &plan{goal: tf.goal}
	if _, waits := ai.follow(v, marines, p, tf); !waits {
		t.Fatal("the Warthog just set off: want the Marines waiting behind it")
	}
	s.Tick += stallSeconds*s.TPS() + 1 // the Warthog gets no nearer: stuck, or fighting
	if _, waits := ai.follow(v, marines, p, tf); waits {
		t.Error("the Warthog has stalled: want the Marines coming on")
	}
}
