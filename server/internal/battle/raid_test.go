package battle

import (
	"slices"
	"testing"
)

func raidSim(t *testing.T, attack Force, seed uint64) *Sim {
	t.Helper()
	c := baseContent(t)
	_, cov := kits()
	s := newSim(c, attack, cov, seed)
	s.Raid = true
	return s
}

func TestARaidIsWonByDestroyingEveryBuildingNotTheCommandPost(t *testing.T) {
	unsc, _ := kits()
	s := raidSim(t, unsc, 1)
	s.Tick = s.Setup
	s.commandPost().Members = nil
	if s.end(); s.Over {
		t.Fatalf("over by %s with the Command Post down; in a Raid it decides nothing", s.Reason)
	}
	for _, sq := range s.Squads {
		if sq.planetBuilding() {
			sq.Members = nil
		}
	}
	if s.end(); !s.Over || s.Winner != Attacker || s.Reason != Raided {
		t.Errorf("over %v, winner %v by %q with every building down; want the raiders' win", s.Over, s.Winner, s.Reason)
	}
}

func TestARaidRunsOutAtItsOwnTime(t *testing.T) {
	unsc, _ := kits()
	s := raidSim(t, unsc, 1)
	s.Controllers = [2]Controller{}
	s.Tick = s.Setup + s.rules.RaidTime*TicksPerSecond
	if s.end(); !s.Over || s.Winner != Defender || s.Reason != TimeUp {
		t.Errorf("over %v, winner %v by %q at raidTime; want the defender's, on time", s.Over, s.Winner, s.Reason)
	}
	s.Over, s.Raid = false, false
	if s.end(); s.Over {
		t.Errorf("an Attack ended at %d s; want it to run to the time cap", s.rules.RaidTime)
	}
}

func TestARaidedDefenderCantRetreat(t *testing.T) {
	unsc, _ := kits()
	s := raidSim(t, unsc, 1)
	s.Command(Defender, Order{Kind: Retreat})
	s.Command(Attacker, Order{Kind: Retreat})
	if s.RetreatAt[Defender] != 0 || s.RetreatAt[Attacker] == 0 {
		t.Errorf("Retreats at %v; want the raiders' only", s.RetreatAt)
	}
}

// Raiders go for the buildings: no assault on the Command Post, no Landing
// Zones, and they look for the base until they find them.
func TestRaidersGoAfterTheBuildings(t *testing.T) {
	ai := NewAI(WeightsOf(nil))
	unsc, _ := kits()
	s := raidSim(t, unsc, 1)
	s.Controllers[Attacker] = ai
	s.Tick = s.Setup
	v := View{s, Attacker}
	th := ai.Think() // asked for before it thinks, as the Lab does
	ai.Orders(v)
	for _, g := range th.Goals {
		if g.Goal == "assault" || g.Goal == "capture" {
			t.Errorf("a raider listed %s %v; it wants the buildings", g.Goal, g.Cell)
		}
	}
	if !slices.ContainsFunc(th.Choices, func(c Choice) bool { g := th.Goals[c.Goal]; return g.Goal == "scout" && g.Cell == s.Field.CommandPost }) {
		t.Errorf("choices %+v; want a squad looking for the buildings round the Command Post", th.Choices)
	}

	run(s)
	if s.Reason != Raided && !slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.planetBuilding() && sq.hitBy != 0 }) {
		t.Errorf("over by %s with no building touched; want the raiders to have hit one", s.Reason)
	}
}
