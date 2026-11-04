package game

import (
	"maps"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

func TestAnArmyWithADropshipJoinsABattleAndItsShipComesBack(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Units["base:pelican"] = baseMod().Units["base:pelican"]
	a := s.Planets["a"]
	a.Stacks[1] = Stack{{Unit: "base:pelican", Count: 1}, {Unit: "base:marine", Count: 4}}
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	_ = s.OrderArmy(0, "a", []ArmyUnits{{1, "base:pelican", 1}, {1, "base:marine", 4}}, "b", 0)

	s.Advance(c, 30_000) // both arrive: the first starts the Battle, the second joins it

	b := onlyBattle(t, s)
	if len(b.Sim.Drops) != 1 || b.Sim.Drops[0].TroopCount() != 4 || b.Sim.Drops[0].Owner != 0 {
		t.Fatalf("drops %+v; want the Pelican's 4 Marines in orbit", b.Sim.Drops)
	}
	if len(s.Armies) != 0 {
		t.Errorf("%d Armies left; the second went into the Battle whole", len(s.Armies))
	}

	fight(t, s, c)

	has := func(st Stack) bool {
		return slices.ContainsFunc(st, func(u UnitSlot) bool { return u.Unit == "base:pelican" })
	}
	back := slices.ContainsFunc(s.Planets["b"].Stacks[:], has) || has(a.Stacks[1])
	for _, ar := range s.Armies {
		back = back || ar.Owner == 0 && has(ar.Units)
	}
	if !back {
		t.Error("the Pelican was lost: it should rejoin its owner when the Battle ends")
	}
}

func TestACommanderSendsTheirDropshipToALandingZoneTheyHold(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Units["base:pelican"] = baseMod().Units["base:pelican"]
	s.Planets["a"].Stacks[1] = Stack{{Unit: "base:pelican", Count: 1}, {Unit: "base:marine", Count: 4}}
	s.SetBattleControl(0, true)
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	_ = s.OrderArmy(0, "a", []ArmyUnits{{1, "base:pelican", 1}, {1, "base:marine", 4}}, "b", 0)
	s.Advance(c, 30_000)
	b := onlyBattle(t, s)
	held := slices.IndexFunc(b.Sim.Points, func(p battle.Point) bool { return p.Owner == battle.Attacker })
	if held < 0 {
		t.Skip("the attacker holds no Landing Zone on this field")
	}
	if err := s.BattleLand(0, "b", 0, held); err == nil {
		t.Error("a Dropship sent in setup")
	}
	b.Sim.Tick = b.Sim.Setup
	if err := s.BattleLand(0, "b", 1, held); err == nil {
		t.Error("a second Dropship that doesn't exist was sent")
	}
	if err := s.BattleLand(0, "b", 0, held); err != nil || b.Sim.Drops[0].State != battle.Flying {
		t.Errorf("err %v, drop %+v; want it on its way", err, b.Sim.Drops[0])
	}
}

// Only a Teammate's landed troops survive the win: the attacker still takes
// the Planet, and the Teammate's go home.
func TestATeammatesTroopsWinThePlanetForTheAttacker(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	c.Units["base:pelican"] = baseMod().Units["base:pelican"]
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	b := onlyBattle(t, s)
	held := slices.IndexFunc(b.Sim.Points, func(p battle.Point) bool { return p.Owner == battle.Attacker })
	if held < 0 {
		t.Skip("the attacker holds no Landing Zone on this field")
	}
	b.Sim.Tick = b.Sim.Setup
	b.Sim.Command(battle.Attacker, battle.Order{Kind: battle.Arrive, Building: "base:pelican", Cargo: []battle.Slot{{Unit: "base:marine", Count: 3}}, Owner: 2})
	b.Sim.Command(battle.Attacker, battle.Order{Kind: battle.Land, Target: 0, Point: held})
	for i := 0; i < 1000 && !b.Sim.Drops[0].Landed; i++ {
		b.Sim.Step()
	}
	if !b.Sim.Drops[0].Landed {
		t.Fatal("the Teammate's Pelican never landed")
	}
	for _, sq := range b.Sim.Squads {
		if sq.Side == battle.Attacker && sq.Drop == 0 {
			sq.Members = nil // Seat 0's own are all gone
		}
	}
	b.Sim.Over, b.Sim.Winner = true, battle.Attacker
	var ev Events
	s.endBattle(c, b, &ev)

	if s.Planets["b"].Owner != 0 {
		t.Errorf("b's owner is %d; the attacker won, so it's Seat 0's", s.Planets["b"].Owner)
	}
	if !slices.ContainsFunc(slices.Collect(maps.Values(s.Armies)), func(a *Army) bool { return a.Owner == 2 && a.Retreating }) {
		t.Error("the Teammate's survivors didn't head home")
	}
}

func TestAnArmyWithoutADropshipWaitsOutTheBattle(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.OrderArmy(0, "a", marines(6), "b", 1)
	_ = s.OrderArmy(0, "a", marines(4), "b", 0)
	s.Advance(c, 30_000)
	if b := onlyBattle(t, s); len(b.Sim.Drops) != 0 || len(s.Armies) != 1 || !onlyArmy(t, s).Waiting {
		t.Errorf("drops %d, Armies %d; want the second Army waiting in orbit", len(b.Sim.Drops), len(s.Armies))
	}
}
