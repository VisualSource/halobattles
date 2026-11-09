package battle

import "testing"

// Commander tactics (docs/specs/tactical-battle-spec.md#commander-tactics-step-5b).

func TestTaskForcesAreMadeUpFromTheCounterTable(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{
		{"base:warthog", 1, 0}, {"base:warthog", 1, 1}, {"base:wolverine", 1, 2},
		{"base:warthog", 1, 3}, {"base:warthog", 1, 4}, {"base:wolverine", 1, 5},
	}}}, Force{Formations: [][]Slot{{{"base:banshee", 3, 0}}}})
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	g := goal{kind: capture, cell: s.Points[0].Cell}
	ai.sighted[unitsOf(t, s, "base:banshee").ID] = sighting{g.cell, 3, 0} // aircraft at the goal
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	if len(ai.forces) != 2 {
		t.Fatalf("%d Task Forces; want 2", len(ai.forces))
	}
	for _, tf := range ai.forces {
		aa := 0
		for _, sq := range tf.members {
			if sq.Unit == "base:wolverine" {
				aa++
			}
		}
		if aa != 1 {
			t.Errorf("Task Force %d has %d Wolverines; want one anti-air in each, against the Banshees", tf.n, aa)
		}
	}
}

func TestAForceThatLosesHalfItsStrengthRegroups(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(2)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	g := goal{kind: assault, cell: s.commandPost().Cell, target: s.commandPost().ID}
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	var tf *taskForce
	for _, f := range ai.forces {
		tf = f
	}
	tf.going = true
	for i, sq := range v.Own() { // gone in, near the Command Post, far from its Landing Zone
		freeAt(t, s, sq, g.cell, 4+i)
		sq.Members = sq.Members[:2] // 4 of 10 left
	}
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	if tf.going || tf.stage == (Cell{}) || tf.peak != 4 {
		t.Errorf("going %v, stage %v, peak %d; want it gathering again at a stage, counting its 4 left as full strength", tf.going, tf.stage, tf.peak)
	}
	if d := dist(tf.stage, g.cell); d > stageDist+4 {
		t.Errorf("it regroups %.0f cells from its goal; want back at about stageDist, not across the map at its Landing Zone", d)
	}
}

func TestAnOutnumberedDefenderWithNoPointsFallsBackToItsCommandPost(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(4)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:grunt", 5, 1}}}})
	ai, v := NewAI(WeightsOf(nil)), View{s, Defender}
	for i := range s.Points {
		s.Points[i].Owner = Attacker
	}
	for _, sq := range s.Squads {
		if sq.Side == Attacker {
			ai.sighted[sq.ID] = sighting{sq.Cell, len(sq.Members), 0} // 20 Marines against 10 Grunts
		}
	}
	ai.command(v, v.Own(), v.Enemies())
	cp := s.commandPost()
	for _, sq := range v.Own() {
		if p := ai.plans[sq.ID]; sq.speed > 0 && (p == nil || p.goal.kind != defend || p.goal.cell != cp.Cell) {
			t.Errorf("squad %d's goal %v; want every squad back holding the Command Post", sq.ID, p)
		}
	}
	clear(ai.sighted) // huddled at the Command Post, it has lost sight of the army on the points
	if !ai.holdOut(v, v.Own()) {
		t.Error("walks back out once it no longer sees the army; want it to stay till it holds a point")
	}
	s.Points[0].Owner = Defender // holding a point: it holds on there too
	if ai.holdOut(v, v.Own()) {
		t.Error("falls back while it still holds a point")
	}
	s.Points[0].Owner, s.Raid = Attacker, true
	for _, sq := range s.Squads {
		if sq.Side == Attacker {
			ai.sighted[sq.ID] = sighting{sq.Cell, len(sq.Members), 0}
		}
	}
	if ai.holdOut(v, v.Own()) {
		t.Error("Raided, it leaves its buildings for the Command Post the raider isn't after")
	}
}

func TestASquadMovedToAnotherGoalIsntALossToItsForce(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:marine", 5, 0}, {"base:marine", 5, 1}, {"base:warthog", 1, 2}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	g := goal{kind: assault, cell: s.commandPost().Cell, target: s.commandPost().ID}
	own := v.Own()
	ai.form(v, []goal{g}, [][]*Squad{own})
	var tf *taskForce
	for _, f := range ai.forces {
		tf = f
	}
	tf.going = true
	for i, sq := range own { // on the way in, past where it would regroup
		freeAt(t, s, sq, g.cell, 13+i)
	}
	warthog := unitsOf(t, s, "base:warthog")
	ai.form(v, []goal{g}, [][]*Squad{{warthog}}) // the Marines given another goal
	if !tf.going {
		t.Error("the Warthog regroups when the Marines were sent elsewhere, none of them lost")
	}
}
