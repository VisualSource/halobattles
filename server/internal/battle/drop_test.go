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
	stepUntil(s, 60*TicksPerSecond, func() bool { return d.State == Done })
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
	stepUntil(s, 120*TicksPerSecond, func() bool { return false })
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
