package bot

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

func credits(n int) map[string]int { return map[string]int{"base:credits": n} }

// rules edits the test Ruleset.
func rules(c *cs.Content, edit func(*cs.Ruleset)) {
	r := c.Rulesets[game.RulesetID]
	edit(&r)
	c.Rulesets[game.RulesetID] = r
}

// both has Seat 0 on a and b: b is a Lane nearer c and d, the front.
func both(v game.View) game.View {
	v.Planets[1].Owner = 0
	return v
}

func TestTheBudgetKeepsTheReserveTheNextPaydayAndSprawl(t *testing.T) {
	b := hard(t)
	b.Difficulty.ReservePercent = 20
	v := view(nil, 0)
	v.Economy.Projected = credits(-100)
	tt := b.newTurn(v) // 1000, less 600 reserve, less the Payday's 100 shortfall
	if !tt.affords(credits(300), nil, 1) || tt.affords(credits(301), nil, 1) {
		t.Errorf("budget %v, want 300", tt.budget)
	}
	if tt.affords(credits(250), credits(51), 1) {
		t.Error("51 Upkeep deepens the Payday's shortfall past the 50 left")
	}

	rules(b.c, func(r *cs.Ruleset) { r.Sprawl = cs.Sprawl{FreePlanets: 1, Percent: 50} })
	tt = b.newTurn(both(v)) // 2 Planets, 1 free: everything costs 150%
	if !tt.affords(credits(200), nil, 1) || tt.affords(credits(201), nil, 1) {
		t.Errorf("sprawl %d%%: want 200 to cost the whole 300", tt.sprawl)
	}
}

func TestTheExchangeTradesFromNearTheCapIntoAShortResource(t *testing.T) {
	b := hard(t)
	rules(b.c, func(r *cs.Ruleset) {
		r.Exchange = []cs.ExchangeRate{{Give: "base:credits", GiveAmount: 3, Get: "base:materials", GetAmount: 1}}
	})
	v := view(nil, 0)
	v.Economy.Resources = map[string]int{"base:credits": 2900, "base:materials": 0}
	v.Economy.Caps = map[string]int{"base:credits": 3000, "base:materials": 1500}
	c := b.exchange(b.newTurn(v))
	if c == nil {
		t.Fatal("no trade with Credits near the cap and no Materials")
	}
	if x := decode(*c).(*wire.ExchangeT); x.Give != "base:credits" || x.Amount != 648 {
		t.Errorf("trade %+v; want 648 Credits, down to 3/4 of the cap in lots of 3", x)
	}
	v.Economy.Resources["base:credits"] = 2000
	if b.exchange(b.newTurn(v)) != nil {
		t.Error("traded with Credits nowhere near the cap")
	}
}

func TestPlacement(t *testing.T) {
	b := hard(t)
	rules(b.c, func(r *cs.Ruleset) { r.Tech.LabsPerPlanet = 3 })
	v := both(view([]string{"base:lab", "", ""}, 0))
	v.Planets[0].Richness = map[string]string{"base:credits": "rich"}
	v.Planets[1].Richness = map[string]string{"base:credits": "poor"}
	tt := b.newTurn(v)
	if x := b.economyToBuild(tt); x.id != "base:mine" || x.planet.ID != "a" {
		t.Errorf("extractor %s on %s; want the Mine on the rich a", x.id, x.planet.ID)
	}
	if x := b.trainerToBuild(tt); x.planet.ID != "b" {
		t.Errorf("production on %s; want b, nearer the front", x.planet.ID)
	}
	if x := b.labToBuild(tt); x.planet.ID != "b" {
		t.Errorf("Lab on %s; want b, which has none", x.planet.ID)
	}
}

func TestUnitChoice(t *testing.T) {
	c := lineContent()
	c.Units["base:hog"] = cs.Unit{Cost: credits(150), Combat: cs.Combat{Hp: 30, Damage: "1d4", UnitClass: "base:vehicle",
		Tiers: map[string]cs.CombatTiersValue{"base:infantry": "disadvantage"}}}
	m := c.Units["base:marine"]
	m.Combat.Tiers = map[string]cs.CombatTiersValue{"base:vehicle": "disadvantage"}
	c.Units["base:marine"] = m
	bk := c.Buildings["base:barracks"]
	bk.Trains = []cs.ID{"base:marine", "base:hog"}
	c.Buildings["base:barracks"] = bk
	rules(c, func(r *cs.Ruleset) {
		r.BotDifficulties = append(r.BotDifficulties, cs.BotDifficulty{ID: "easy", PlanDepth: 3, UnitChoice: "fixed"})
	})
	unit := func(b *Bot, v game.View) string {
		cmd := b.train(b.newTurn(v), goal{})
		if cmd == nil {
			return ""
		}
		return decode(*cmd).(*wire.QueueUnitT).Unit
	}

	v := view([]string{"base:barracks", "", ""}, 0)
	for foe, want := range map[string]string{"base:marine": "base:marine", "base:hog": "base:hog"} {
		b := New(c, 0, "base:unsc", "hard", 1, 0)
		b.seen = map[string]sighting{"c": {game.PlanetView{ID: "c", Owner: game.Neutral,
			Stacks: [game.StacksPerPlanet]game.Stack{{{Unit: foe, Count: 10}}}}, 0}}
		if got := unit(b, v); got != want {
			t.Errorf("against %s trained %s, want %s", foe, got, want)
		}
	}
	easy := New(c, 0, "base:unsc", "easy", 1, 0)
	if a, b := unit(easy, v), unit(easy, v); a != "base:hog" || b != "base:marine" {
		t.Errorf("a fixed mix trained %s then %s; want each in turn", a, b)
	}
}

func TestResearchPicks(t *testing.T) {
	c := lineContent()
	pct := 10
	c.Techs = map[string]cs.Tech{
		"base:armor": {Effects: []cs.Effect{{Stat: "armor", Percent: &pct}}},
		"base:drill": {Effects: []cs.Effect{{Stat: "extractorYield", Percent: &pct}}},
		"base:gated": {Requires: &cs.TechRequirements{Techs: []cs.ID{"base:armor"}}},
	}
	b := New(c, 0, "base:unsc", "hard", 1, 0)
	v := view([]string{"base:lab", "", ""}, 0)
	v.Research.Hand = []string{"base:armor", "base:drill"}
	tt := b.newTurn(v)
	tt.top[economy], tt.top[army] = 2, 1
	if got := b.card(tt); got != "base:drill" {
		t.Errorf("picked %s with Economy the top goal; want the economy Tech", got)
	}

	v.Research.Hand = []string{"base:drill"}
	v.Research.Saved = []game.Saved{{Tech: "base:gated"}, {Tech: "base:armor"}}
	tt = b.newTurn(v)
	tt.top[economy], tt.top[army] = 1.2, 1
	if got := b.cards(tt); len(got) != 2 {
		t.Errorf("cards %v; want gated left out, its requirement not held", got)
	}
	if got := b.card(tt); got != "base:armor" {
		t.Errorf("picked %s; want the saved armor, worth a half more", got)
	}

	b.Difficulty.Research = cs.BotDifficultyResearchFirst
	if got := b.card(tt); got != "base:drill" {
		t.Errorf("Easy picked %s; want the first card", got)
	}
}

func TestItSavesForATopGoalTheNextPaydayAffords(t *testing.T) {
	b := hard(t)
	rules(b.c, func(r *cs.Ruleset) { r.Tech.LabsPerPlanet = 3 })
	b.Weights.Research = 100
	v := view([]string{"base:barracks", "", ""}, 0)
	v.Research.Hand = []string{"base:drill"}
	v.Economy.Resources = credits(100) // a Lab costs 250
	v.Economy.Projected = credits(500)
	if cmds := b.Think(v); len(cmds) != 0 {
		t.Errorf("%d commands; want none, saving for the Lab", len(cmds))
	}
	v.Economy.Projected = credits(50) // not enough for a Lab, or a 200 Mine, by the next Payday: spend on the rest
	if cmds := b.Think(v); len(cmds) == 0 {
		t.Error("nothing funded, saving for a Lab the next Payday can't afford")
	}

	// Saving still sends reinforcements: they cost nothing.
	v = both(v)
	v.Economy.Projected = credits(500)
	v.Planets[1].Stacks[0] = game.Stack{{Unit: "base:marine", Count: 4}}
	v.Armies = []game.ArmyView{{ID: 1, Owner: 1, To: "a", Units: []game.UnitSlot{{Unit: "base:marine", Count: 20}}}}
	cmds := b.Think(v)
	if len(cmds) != 1 || cmds[0].Op != wire.OpOrderArmy || decode(cmds[0]).(*wire.OrderArmyT).ToPlanet != "a" {
		t.Errorf("commands %v; want only b's Marines sent to defend a while saving", cmds)
	}

	// Nor does it save for what costs more than its cap less the reserve.
	lab := b.c.Buildings["base:lab"]
	lab.Cost = credits(3001)
	b.c.Buildings["base:lab"] = lab
	v.Economy.Projected = credits(5000)
	if f := b.facts(b.newTurn(v).paid(), goal{kind: research}); f&canBuildLab != 0 {
		t.Error("a 3001 Lab counted affordable after Payday, over the 3000 cap")
	}
}
