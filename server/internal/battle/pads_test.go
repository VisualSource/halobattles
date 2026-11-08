package battle

import (
	"maps"
	"slices"
	"testing"
)

// padSim is a Battle with one build pad of the defender's, a few cells from
// point 0, and no Controllers.
func padSim(t *testing.T, attack, defend Force) (*Sim, *Pad) {
	t.Helper()
	s := aiSim(t, attack, defend)
	probe := &Squad{class: "base:infantry"}
	for r := 4; r < 12; r++ {
		for _, d := range steps {
			if c := s.Points[0].Cell.add(d.scale(r)); s.standable(probe, c) {
				s.Pads = []Pad{{Cell: c, Owner: Defender, Taker: Defender}}
				return s, &s.Pads[0]
			}
		}
	}
	t.Fatal("nowhere for a pad")
	return nil, nil
}

func TestPadsStartUnowned(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	if len(s.Pads) == 0 {
		t.Fatal("no pads")
	}
	for _, p := range s.Pads {
		if p.Owner != NoSide {
			t.Errorf("pad %v starts with %v; want no owner, for the defender to take in setup", p.Cell, p.Owner)
		}
	}
}

func TestATurretIsBuiltOnAHeldPadAfterItsBuildTime(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	if err := s.CanBuild(Attacker, 0, "base:turret"); err == nil {
		t.Error("the attacker built on the defender's pad")
	}
	if err := s.CanBuild(Defender, 0, "base:barracks"); err == nil {
		t.Error("a Barracks went up on a pad")
	}
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:plasma-turret"})
	if pad.Building != "base:plasma-turret" || s.CanBuild(Defender, 0, "base:turret") == nil {
		t.Fatalf("pad %+v; want it building, and taken", *pad)
	}
	for s.Tick < pad.ReadyAt {
		s.Step()
	}
	s.Step()
	tur := s.squad(pad.Turret)
	if tur == nil || tur.Unit != "base:plasma-turret" || tur.Cell != pad.Cell || tur.OnPad != 1 || tur.Side != Defender {
		t.Fatalf("turret %+v on pad %+v", tur, *pad)
	}
	if !slices.ContainsFunc(s.Snapshot(Defender).Squads, func(v SquadView) bool { return v.ID == tur.ID }) {
		t.Error("the defender can't see its own new turret")
	}
}

func TestATurretKeepsItsPadUntilItsDestroyed(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:plasma-turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	a := s.Squads[0]
	freeAt(t, s, a, pad.Cell, 1)
	for _, sq := range s.Squads {
		if sq.Side == Defender && sq.OnPad == 0 {
			sq.Members = nil // no grunts to contest it: only the turret stands in the way
		}
	}
	for range 3 * s.ticks(s.rules.CaptureSeconds) {
		s.capture()
	}
	if pad.Owner != Defender {
		t.Fatal("the pad changed hands with its turret standing")
	}
	s.squad(pad.Turret).Members = nil
	for range s.ticks(s.rules.CaptureSeconds) + 1 {
		s.capture()
	}
	if pad.Owner != Attacker || pad.Turret != 0 {
		t.Errorf("pad %+v after its turret fell; want the attacker's", *pad)
	}
}

func TestTakingAPadLosesTheBuildOnIt(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:plasma-turret"})
	freeAt(t, s, s.Squads[0], pad.Cell, 1)
	s.Squads[1].Members = nil
	for range s.ticks(s.rules.CaptureSeconds) {
		s.capture()
	}
	if pad.Owner != Attacker || pad.Building != "" {
		t.Errorf("pad %+v; want it the attacker's, the build lost", *pad)
	}
}

func TestAnAttackerWithOnlyTurretsLeftHasLost(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	pad.Owner = Attacker
	s.Command(Attacker, Order{Kind: Build, Target: 0, Building: "base:turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	s.Squads[0].Members = nil // the Marines are gone
	s.end()
	if !s.Over || s.Winner != Defender {
		t.Errorf("over %v, winner %v; want the defender", s.Over, s.Winner)
	}
}

func TestANeutralGarrisonBuildsWithinItsFunds(t *testing.T) {
	s, _ := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Pads = append(s.Pads, Pad{Cell: s.Points[1].Cell, Owner: Defender, Taker: Defender})
	s.Funds[Defender] = maps.Clone(s.content.Buildings["base:turret"].Cost) // one turret's worth
	ai := NewAI(WeightsOf(nil))
	orders := ai.build(View{s, Defender})
	if len(orders) != 1 {
		t.Fatalf("orders %+v; want one turret, all it can afford", orders)
	}
	s.Command(Defender, orders[0])
	if pad := s.Pads[orders[0].Target]; pad.Building == "" || s.Funds[Defender]["base:credits"] != 0 || s.Funds[Defender]["base:materials"] != 0 {
		t.Errorf("pad %+v, funds %v; want it building, paid for", pad, s.Funds[Defender])
	}

	s.Funds[Defender] = nil // a player's side: their money isn't the AI's to spend
	if orders := ai.build(View{s, Defender}); len(orders) != 0 {
		t.Errorf("a player's AI built %+v", orders)
	}
}

func TestAShooterIsSeenByTheSideItFiresOnUntilItsFlashFades(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	tur, a := s.squad(pad.Turret), s.Squads[0]
	s.Squads[1].Members = nil    // just the turret
	freeAt(t, s, a, tur.Cell, 7) // in a turret's range (8), out of a Marine's (5)
	a.sight = 2                  // and it can't see the turret
	s.see()
	if s.visible[Attacker][tur.ID] {
		t.Fatal("the Marines see the turret before it fires")
	}
	var shot []Volley
	for range 3 * s.TPS() {
		if vs := s.VolleysFor(Attacker, s.Step()); len(vs) > 0 {
			shot = vs
			break
		}
	}
	if len(shot) == 0 || shot[0].Actor != tur.ID {
		t.Fatalf("volleys %+v; want the turret's, its shooter known", shot)
	}
	if !s.visible[Attacker][tur.ID] || a.hitBy != tur.ID {
		t.Errorf("visible %v, hit by %d; want the turret seen and known as the shooter", s.visible[Attacker][tur.ID], a.hitBy)
	}
	tur.Armed = false // it stops firing
	for range s.ticks(flashSeconds) + 1 {
		s.Step()
	}
	if s.visible[Attacker][tur.ID] {
		t.Errorf("the turret is still seen after its flash faded: tick %d, flash %d, marine at %v sight %v, turret %v", s.Tick, tur.flashUntil, a.Cell, s.sightOf(a), tur.Cell)
	}
}

func TestASquadShotByATurretItCantSeeGoesAfterIt(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	tur, a := s.squad(pad.Turret), s.Squads[0]
	s.Squads[1].Members = nil
	freeAt(t, s, a, tur.Cell, 7) // in the turret's range, out of its own
	a.sight = 2
	s.Controllers[Attacker] = NewAI(WeightsOf(nil))
	for range 20 * s.TPS() {
		for _, v := range s.Step() {
			if v.Actor == a.ID && v.Target == tur.ID {
				return // it fired back
			}
		}
		if !a.alive() {
			break
		}
	}
	t.Errorf("the Marines never fired on the turret shooting them (alive %v, at %v, turret at %v)", a.alive(), a.Cell, tur.Cell)
}

func TestASquadShotByATurretItCantHurtGetsOutOfRange(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	tur, a := s.squad(pad.Turret), s.Squads[0]
	s.Squads[1].Members = nil
	freeAt(t, s, a, tur.Cell, 7)
	a.tiers = map[string]string{tur.class: None} // it can't hurt a structure
	s.Controllers[Attacker] = NewAI(WeightsOf(nil))
	for range 10 * s.TPS() {
		s.Step()
		if a.hitBy == tur.ID && a.alive() && dist(a.Cell, tur.Cell) > tur.reach {
			return // fired on, and it got clear
		}
	}
	t.Errorf("the Marines stayed in the turret's range: at %v, turret at %v (reach %v), alive %v", a.Cell, tur.Cell, tur.reach, a.alive())
}

func TestAHeldPadSeesRoundItself(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	m, g := s.Squads[0], s.Squads[1]
	freeAt(t, s, g, pad.Cell, 1)
	freeAt(t, s, m, pad.Cell, int(s.sightOf(m))+int(s.rules.PadSight)+4) // the Marines can't see it
	s.see()
	if s.visible[Attacker][g.ID] {
		t.Fatal("the attacker sees the Grunts with nothing near: the test proves nothing")
	}
	pad.Owner = Attacker
	s.see()
	if !s.visible[Attacker][g.ID] {
		t.Error("a pad the attacker holds doesn't see the Grunts beside it")
	}
}

func TestAPadCoolsDownAfterItsTurretIsDestroyed(t *testing.T) {
	s, pad := padSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	s.Command(Defender, Order{Kind: Build, Target: 0, Building: "base:plasma-turret"})
	for pad.Turret == 0 {
		s.Step()
	}
	s.squad(pad.Turret).Members = nil
	s.capture()
	if pad.Turret != 0 || s.CanBuild(Defender, 0, "base:plasma-turret") == nil {
		t.Fatalf("pad %+v; want it clear, but cooling down", *pad)
	}
	s.Tick = pad.CoolsAt
	if err := s.CanBuild(Defender, 0, "base:plasma-turret"); err != nil {
		t.Errorf("after the cooldown: %v", err)
	}
}
