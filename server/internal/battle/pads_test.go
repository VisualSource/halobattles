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

func TestPadsNearThePointsStartAsTheDefenders(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	if len(s.Pads) == 0 {
		t.Fatal("no pads")
	}
	for _, p := range s.Pads {
		near := slices.ContainsFunc(s.Points, func(pt Point) bool { return dist(pt.Cell, p.Cell) <= padStart })
		if want := map[bool]Side{true: Defender, false: NoSide}[near]; p.Owner != want {
			t.Errorf("pad %v (near a point: %v) starts with %v, want %v", p.Cell, near, p.Owner, want)
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
	for range 3 * ticks(s.rules.CaptureSeconds) {
		s.capture()
	}
	if pad.Owner != Defender {
		t.Fatal("the pad changed hands with its turret standing")
	}
	s.squad(pad.Turret).Members = nil
	for range ticks(s.rules.CaptureSeconds) + 1 {
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
	for range ticks(s.rules.CaptureSeconds) {
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
