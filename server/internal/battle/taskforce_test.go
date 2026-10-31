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

func TestATaskForceGathersThenGoesInTogetherAtTheSlowestPace(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
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
	s.Tick = TicksPerSecond // the Commander's next pass
	sent = moves(ai.Orders(v))
	if !tf.going {
		t.Fatal("gathered, yet it didn't go in")
	}
	for _, sq := range []*Squad{marines, warthog} {
		if o, ok := sent[sq.ID]; !ok || o.Pace != marines.speed {
			t.Errorf("%s: order %+v; want a move at the Marines' pace %v", sq.Unit, o, marines.speed)
		}
	}
}

func TestAPacedMoveGoesNoFasterThanItsPace(t *testing.T) {
	travelled := func(pace float64) float64 {
		s := aiSim(t, Force{Formations: [][]Slot{{{"base:warthog", 1, 0}}}}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
		w := s.Squads[0]
		from := w.Cell
		s.apply(Attacker, Order{Kind: Move, Squad: w.ID, Cell: s.Points[0].Cell, Pace: pace})
		for range 3 * TicksPerSecond {
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
	if len(forces) != 2 || len(forces[0].members) != forceCap || len(forces[1].members) != 6-forceCap {
		t.Fatalf("%d Task Forces; want 2, of %d and %d squads", len(forces), forceCap, 6-forceCap)
	}
	if forces[0].going || forces[1].going {
		t.Fatal("went straight in; want them to gather first")
	}
	if dist(forces[0].stage, forces[1].stage) < 4 {
		t.Errorf("they gather at %v and %v; want them apart, to come in from two sides", forces[0].stage, forces[1].stage)
	}
}

func TestADefenderRetakingWhileTheHoldTimerRunsGoesStraightIn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	far := s.Points[0].Cell
	own := v.Own()
	freeAt(t, s, own[0], far, 20)
	freeAt(t, s, own[1], own[0].Cell, 1)
	g := goal{kind: capture, cell: far}

	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	if tf := ai.forceOf[v.Own()[0].ID]; tf == nil || tf.going {
		t.Fatalf("Task Force %+v; want it gathering first while there's time", tf)
	}
	ai = NewAI(WeightsOf(nil))
	s.Hold = 1
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	if tf := ai.forceOf[v.Own()[0].ID]; tf == nil || !tf.going {
		t.Errorf("Task Force %+v; want it straight in while the attacker's hold timer runs", tf)
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
