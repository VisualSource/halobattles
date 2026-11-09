package battle

import "testing"

// The Command Post's shield (#124) blocks every hit until the attacker holds
// half the Landing Zones, rounded up; then its hits get through.
func TestTheCommandPostsShieldBlocksHitsUntilHalfTheZonesAreTaken(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	s.ShowCommandPost = true
	cp, m := s.commandPost(), s.Squads[0]
	freeAt(t, s, m, cp.Cell, 2)
	s.see()
	s.apply(Attacker, Order{Kind: Attack, Squad: m.ID, Target: cp.ID}) // an order still fires on a shielded one
	full := cp.Members[0]
	hits := 0
	for range 50 {
		for _, v := range s.fire() {
			if v.Target == cp.ID {
				hits += v.Hits
			}
		}
		s.Tick++
	}
	if hits == 0 {
		t.Fatal("no hits on the Command Post to block")
	}
	if cp.Members[0] != full {
		t.Errorf("the shielded Command Post took damage: %+v, from %+v", cp.Members[0], full)
	}
	cpPhase(s) // the attacker holds every zone: the shield's down
	for range 50 {
		s.fire()
		s.Tick++
	}
	if cp.Members[0] == full {
		t.Error("the unshielded Command Post took no damage")
	}
}

// A commanded squad left idle goes after an enemy it sees, then comes back to
// where it was put once that enemy's gone; on Hold it stays (#124).
func TestAnIdleCommandedSquadFightsBackAndReturns(t *testing.T) {
	for _, hold := range []bool{false, true} {
		s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 3, 0}}}})
		s.Controllers = [2]Controller{nil, nil} // the attacker commanded, the defender idle
		m, grunts := s.Squads[0], unitsOf(t, s, "base:grunt")
		freeAt(t, s, grunts, m.Cell, int(m.reach)+2) // in Sight, out of range
		put := m.Cell
		if hold {
			s.apply(Attacker, Order{Kind: Hold, Squad: m.ID})
		}
		moved := false
		for range 15 * s.TPS() {
			s.Step()
			moved = moved || m.Cell != put
		}
		switch {
		case hold && moved:
			t.Errorf("on Hold it moved from %v; want it to stay", put)
		case !hold && !moved:
			t.Error("idle beside Grunts in its Sight; want it to go after them")
		case !hold && grunts.alive():
			t.Error("the Grunts it went after are still alive")
		case !hold && dist(m.Cell, put) > 1:
			t.Errorf("at %v after its enemy died; want it back by %v", m.Cell, put)
		}
	}
}

// Once most of the attack it has seen is at one point, the defender's guards
// all go there or to the Command Post, rather than each holding its own (#124).
func TestTheDefenderConvergesOnTheThreatenedPoint(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(2)}, Force{Formations: marines(3)})
	for i := range s.Points {
		s.Points[i].Owner = Defender // guards on every point
	}
	ai, v := NewAI(WeightsOf(nil)), View{s, Defender}
	ai.sighted[s.Squads[0].ID] = sighting{s.Points[0].Cell, 10, s.Tick} // the attack, at point 0
	ai.command(v, v.Own(), nil)
	if !ai.converging {
		t.Fatal("not converging with 10 enemy members at point 0")
	}
	cp := s.commandPost().Cell
	for _, sq := range v.Own() {
		if p := ai.plans[sq.ID]; p != nil && p.goal.kind == defend && p.goal.cell != s.Points[0].Cell && p.goal.cell != cp {
			t.Errorf("squad %d holds %v; want every guard at the threatened point or the Command Post", sq.ID, p.goal.cell)
		}
	}
}
