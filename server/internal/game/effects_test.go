package game

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func pct(stat cs.EffectStat, p int) cs.Effect { return cs.Effect{Stat: stat, Percent: new(p)} }
func amt(stat cs.EffectStat, a int) cs.Effect { return cs.Effect{Stat: stat, Amount: new(a)} }

// withEffects makes Seat 0 hold one Tech per effect list, in the Lab in its
// Capital a's slot 2.
func withEffects(t *testing.T, effects ...[]cs.Effect) (*State, *cs.Content) {
	t.Helper()
	s, c := fixedMatch(t), lineContent()
	c.Techs = map[string]cs.Tech{}
	var ids []string
	for i, e := range effects {
		id := "base:t" + string(rune('a'+i))
		c.Techs[id] = cs.Tech{Name: cs.Name(id), Effects: e}
		ids = append(ids, id)
	}
	holdTech(s, "a", 2, ids...)
	return s, c
}

func TestEconomyEffects(t *testing.T) {
	materials := cs.ID("base:materials")
	yield := pct("extractorYield", 15)
	yield.Resource = &materials
	s, c := withEffects(t, []cs.Effect{yield, pct("upkeep", -10), amt("stockpileCap", 100), amt("sprawlFreePlanets", 1)})
	a := s.Planets["a"]
	a.Buildings[3] = "base:mine" // 60 Materials × normal Richness
	c.Buildings["base:mine"] = cs.Building{Extracts: map[string]int{"base:materials": 60}, Upkeep: map[string]int{"base:credits": 20}}

	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.StockpileCaps = map[string]int{"base:credits": 3000} })

	net := s.paydayNet(c, 0)
	// Capital 300C 100M and the Supply Pad's 100C; Barracks 10C and Mine
	// 20C Upkeep, -10%; Mine 60M +15%.
	if net["base:materials"] != 100+69 || net["base:credits"] != 300+100-9-18 {
		t.Errorf("net %v, want 169 Materials and 373 Credits", net)
	}
	if caps := s.caps(c, 0); caps["base:credits"] != 3100 {
		t.Errorf("caps %v, want 3000 + 100 Credits", caps)
	}
	if got := c.Rulesets[RulesetID].Sprawl.FreePlanets; got != 4 {
		t.Fatalf("free planets %d in content", got)
	}
	for _, id := range []string{"b", "c", "d", "e"} {
		s.Planets[id].Owner = 0
	}
	// 5 Planets, one beyond the 4 free, would add 5%; the Tech frees a fifth.
	if got := s.sprawled(c, 0, map[string]int{"base:credits": 100})["base:credits"]; got != 100 {
		t.Errorf("cost with Sprawl %d, want 100", got)
	}
}

func TestBuildTimeEffectsNarrowToUnits(t *testing.T) {
	infantry := cs.ID("base:infantry")
	faster := pct("buildTime", -20)
	faster.UnitClass = &infantry
	s, c := withEffects(t, []cs.Effect{faster})
	s.Players[0].Resources = map[string]int{"base:credits": 1000}

	if err := s.QueueUnit(c, 0, "a", 0, "base:marine", 1); err != nil {
		t.Fatal(err)
	}
	if got := s.Planets["a"].UnitQueues[0][0].Remaining; got != 12_000 {
		t.Errorf("Marine takes %d ms, want 15 s less 20%%", got)
	}
	if err := s.QueueBuilding(c, 0, "a", 3, "base:mine"); err != nil {
		t.Fatal(err)
	}
	if got := s.Planets["a"].Queue[0].Remaining; got != 30_000 {
		t.Errorf("Mine takes %d ms, want 30 s: an Infantry effect doesn't reach buildings", got)
	}
}

func TestCapacityAndResearchEffectsStack(t *testing.T) {
	s, c := withEffects(t,
		[]cs.Effect{amt("commandPoints", 10), amt("projectLimit", 1), amt("techSlots", 1), pct("research", 50)},
		[]cs.Effect{pct("research", 50)},
	)
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.Tech.CapitalResearch = 4 })

	if _, cp := s.commandPoints(c, 0); cp != 30 {
		t.Errorf("Command Points cap %d, want the Capital's 20 + 10", cp)
	}
	if got := s.projectLimit(c, 0); got != 4 {
		t.Errorf("project limit %d, want 3 + 1", got)
	}
	if _, slots, _ := s.labAt(c, 0, "a", 2); slots != 3 {
		t.Errorf("Lab has %d Tech Slots, want 2 + 1", slots)
	}
	if got := s.researchRate(c, 0); got != 8 {
		t.Errorf("Research %d, want 4 + 50%% + 50%%, the percentages added", got)
	}

	if err := s.SellBuilding(c, 0, "a", 2); err != nil {
		t.Fatal(err)
	}
	if got := s.researchRate(c, 0); got != 4 {
		t.Errorf("Research %d after the Lab was sold, want 4", got)
	}
}

func TestCombatEffectsAreFixedWhenABattleStarts(t *testing.T) {
	infantry := cs.ID("base:infantry")
	tougher := pct("hp", 50)
	tougher.UnitClass = &infantry
	s, c := withEffects(t, []cs.Effect{tougher, amt("armor", 2)})
	a := s.Planets["a"]
	s.LastID++
	army := &Army{ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:marine", Count: 1}}, To: "a"}
	s.Armies = map[uint32]*Army{army.ID: army}
	var ev Events
	s.startBattle(c, army, a, &ev)
	b := onlyBattle(t, s)

	marine := c.Units["base:marine"].Combat
	for _, sq := range b.Sim.Squads {
		if sq.Unit != "base:marine" {
			continue
		}
		want := battle.Layers{Shield: float64(marine.Shield), Armor: float64(marine.Armor), HP: float64(marine.Hp)}
		if sq.Side == battle.Defender {
			want.Armor += 2
			want.HP *= 1.5
		}
		if sq.Members[0] != want {
			t.Errorf("side %d Marine %+v, want %+v", sq.Side, sq.Members[0], want)
		}
	}

	if err := s.SellBuilding(c, 0, "a", 2); err == nil {
		t.Error("sold a building on a Locked Planet") // the Lab's Planet is in the Battle
	}
	a.Locked = false
	if err := s.SellBuilding(c, 0, "a", 2); err != nil {
		t.Fatal(err)
	}
	for _, sq := range b.Sim.Squads {
		if sq.Side == battle.Defender && sq.Unit == "base:marine" && sq.Members[0].HP != float64(marine.Hp)*1.5 {
			t.Errorf("a running Battle's Marine lost its Tech's HP: %+v", sq.Members[0])
		}
	}
}
