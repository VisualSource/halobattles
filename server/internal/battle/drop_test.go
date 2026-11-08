package battle

import (
	"slices"
	"testing"
)

// dropSim is a Battle with a Pelican of 4 Marines over it, for the attacker,
// who holds the Landing Zone it landed at.
func dropSim(t *testing.T) *Sim {
	t.Helper()
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	s.Command(Attacker, Order{Kind: Arrive, Building: "base:pelican", Cargo: []Slot{{"base:marine", 4, 0}}, Owner: 2})
	if len(s.Drops) != 1 || s.Drops[0].State != Orbit {
		t.Fatalf("drops %+v; want the Pelican in orbit", s.Drops)
	}
	return s
}

// run steps until done, up to limit ticks.
func stepUntil(s *Sim, limit int, done func() bool) {
	for range limit {
		if done() || s.Over {
			return
		}
		s.Step()
	}
}

func TestTheSimSendsADropshipAfterTheLandingDelay(t *testing.T) {
	s := dropSim(t)
	held := slices.IndexFunc(s.Points, func(p Point) bool { return p.Owner == Attacker })
	if held < 0 {
		t.Skip("the attacker holds no Landing Zone on this field")
	}
	for s.Tick < s.SendsAt(s.Drops[0]) {
		s.Step()
	}
	if s.Drops[0].State != Orbit {
		t.Fatalf("sent at tick %d, before the landing delay", s.Tick)
	}
	s.Step()
	d := &s.Drops[0]
	if d.State != Flying || d.Point != held {
		t.Fatalf("drop %+v; want it on its way to LZ %d, the one held", d, held)
	}
	ship := s.squad(d.Squad)
	if !ship.Dropship || !s.visible[Defender][ship.ID] || slices.Contains(View{s, Attacker}.Own(), ship) {
		t.Error("a Dropship in flight should be seen by both sides and flown by nobody")
	}
	stepUntil(s, 60*s.TPS(), func() bool { return d.State == Done })
	if d.State != Done || !ship.Escaped {
		t.Fatalf("drop %+v, ship escaped %v; want it to land and fly back out", d, ship.Escaped)
	}
	n := 0
	for _, sq := range s.Squads {
		if sq.Drop == 1 && !sq.Dropship {
			n += sq.Start
		}
	}
	if n != 4 {
		t.Errorf("%d troops landed; want the 4 Marines", n)
	}
}

// Troops landing after their side's Retreat began go straight back out,
// and the Retreat still ends the Battle.
func TestTroopsLandedDuringARetreatRetreatToo(t *testing.T) {
	s := dropSim(t)
	held := slices.IndexFunc(s.Points, func(p Point) bool { return p.Owner == Attacker })
	if held < 0 {
		t.Skip("the attacker holds no Landing Zone on this field")
	}
	s.Controllers = [2]Controller{}
	s.Command(Attacker, Order{Kind: Land, Target: 0, Point: held})
	s.Command(Attacker, Order{Kind: Retreat})
	stepUntil(s, 120*s.TPS(), func() bool { return false })
	if !s.Drops[0].Landed {
		t.Fatal("the Pelican never landed")
	}
	if !s.Over || s.Reason != Retreated {
		t.Errorf("over %v by %q; want the Retreat to end it, landed troops and all", s.Over, s.Reason)
	}
}

func TestACommandingPlayerSendsADropshipAtOnceAndOnlyOnce(t *testing.T) {
	s := dropSim(t)
	held := slices.IndexFunc(s.Points, func(p Point) bool { return p.Owner == Attacker })
	free := slices.IndexFunc(s.Points, func(p Point) bool { return p.Owner != Attacker })
	if held < 0 || free < 0 {
		t.Skip("this field doesn't have one Landing Zone held and one not")
	}
	if err := s.CanLand(Attacker, 0, free); err == nil {
		t.Error("a landing at a Landing Zone the side doesn't hold was allowed")
	}
	s.Command(Attacker, Order{Kind: Land, Target: 0, Point: held})
	if s.Drops[0].State != Flying {
		t.Fatalf("drop %+v; want it on its way", s.Drops[0])
	}
	if err := s.CanLand(Attacker, 0, held); err == nil {
		t.Error("a Dropship already used could land again")
	}
}

// flying is a dropSim with its Pelican in the air, over a defending AA Wraith
// and Grunt, the Battle's fighting under way.
func flying(t *testing.T) (s *Sim, ship, aa, grunt *Squad) {
	t.Helper()
	s = dropSim(t)
	s.Setup = 0
	s.Points[0].Owner = Attacker
	s.launch(0, 0)
	ship = s.squad(s.Drops[0].Squad)
	s.addUnit(Defender, 0, Slot{"base:wraith-aa", 1, 0}, ship.Cell)
	aa = s.Squads[len(s.Squads)-1]
	s.addUnit(Defender, 0, Slot{"base:grunt", 1, 0}, ship.Cell)
	grunt = s.Squads[len(s.Squads)-1]
	s.see()
	return s, ship, aa, grunt
}

func TestOnlyAntiAirFiresOnADropship(t *testing.T) {
	s, ship, aa, grunt := flying(t)
	if !s.canHit(aa, ship) {
		t.Error("an aa unit in range can't hit the Dropship")
	}
	if s.canHit(grunt, ship) {
		t.Error("a Grunt can hit the Dropship")
	}
	if !s.antiAir(&Squad{Building: true, Unit: "base:aa-turret"}) {
		t.Error("an AA turret isn't anti-air")
	}
	if s.antiAir(&Squad{Building: true, Unit: "base:turret"}) {
		t.Error("a plain Turret is anti-air")
	}
}

func TestAntiAirPicksADropshipFirst(t *testing.T) {
	s, ship, aa, _ := flying(t)
	s.addUnit(Attacker, 0, Slot{"base:marine", 1, 0}, aa.Cell)
	s.see()
	aa.target = s.Squads[len(s.Squads)-1].ID
	if got := s.targetOf(aa); got != ship {
		t.Errorf("target = %+v, want the Dropship, over its ordered target", got)
	}
}

func TestADamagedDropshipLandsThatShareOfItsTroops(t *testing.T) {
	s, ship, _, _ := flying(t)
	ship.Members[0] = Layers{Armor: 10, HP: 20} // half of a Pelican's 60
	s.unload(0)
	n := 0
	for _, sq := range s.Squads {
		if sq.Drop == 1 && !sq.Dropship {
			n += len(sq.Members)
		}
	}
	if n != 2 || s.Drops[0].TroopCount() != 2 {
		t.Errorf("%d landed, cargo %d; want 2 of its 4 Marines", n, s.Drops[0].TroopCount())
	}
}

func TestADropshipShotDownLosesEverythingAboard(t *testing.T) {
	s, ship, _, _ := flying(t)
	ship.Members = nil
	s.Step()
	if d := s.Drops[0]; d.State != Done || d.TroopCount() != 0 {
		t.Errorf("drop %+v; want it gone with its troops", d)
	}
}
