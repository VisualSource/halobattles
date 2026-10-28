package game

import (
	"path/filepath"
	"sync"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// baseMod is the real base Mod, loaded once, for its terrain and Battle rules.
var baseMod = sync.OnceValue(func() *cs.Content {
	c, err := content.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		panic(err)
	}
	return &c.Doc
})

// withBattles gives test content the base Mod's Terrains, Terrain Presets,
// Unit Classes and Battle rules, so its Battles run on real Battlefields.
func withBattles(c *cs.Content) *cs.Content {
	base := baseMod()
	c.Terrains, c.TerrainPresets, c.UnitClasses = base.Terrains, base.TerrainPresets, base.UnitClasses
	r := c.Rulesets[RulesetID]
	rules := base.Rulesets[RulesetID]
	r.Battlefield, r.Battle = rules.Battlefield, rules.Battle
	c.Rulesets[RulesetID] = r
	return c
}

// battleContent is the combat stats the test units fight with.
func battleContent() *cs.Content {
	unit := func(class, weapon string, sh, ar, hp int, dmg string, tiers map[string]cs.CombatTiersValue) cs.Unit {
		return cs.Unit{Combat: cs.Combat{
			UnitClass: cs.ID(class), WeaponType: cs.ID(weapon), Shield: sh, Armor: ar, Hp: hp, Damage: dmg, Tiers: tiers,
		}}
	}
	vsInfantry := map[string]cs.CombatTiersValue{"base:infantry": "advantage", "base:vehicle": "disadvantage", "base:structure": "disadvantage"}
	return &cs.Content{
		WeaponTypes: map[string]cs.WeaponType{
			"base:kinetic": {Shield: 0.75, Armor: 1, Hp: 1.25},
			"base:plasma":  {Shield: 1.5, Armor: 0.75, Hp: 1},
		},
		Units: map[string]cs.Unit{
			"base:marine":  unit("base:infantry", "base:kinetic", 0, 0, 12, "1d4", vsInfantry),
			"base:grunt":   unit("base:infantry", "base:plasma", 20, 0, 70, "1d4", vsInfantry),
			"base:warthog": unit("base:vehicle", "base:kinetic", 0, 12, 25, "2d4", nil), // all normal
		},
	}
}

func withRuleset(c *cs.Content, f func(*cs.Ruleset)) cs.Ruleset {
	r := c.Rulesets[RulesetID]
	f(&r)
	return r
}

// fight runs the only Battle to its end, a tick at a time, and returns the
// events of the tick it ended on.
func fight(t *testing.T, s *State, c *cs.Content) Events {
	t.Helper()
	b := onlyBattle(t, s)
	for range (c.Rulesets[RulesetID].Battle.StartDelay+c.Rulesets[RulesetID].Battle.TimeCap)*5 + 5 {
		if ev := s.Advance(c, s.Time+tickMs); len(ev.Ended) > 0 {
			return ev
		}
	}
	t.Fatalf("Battle %d never ended", b.ID)
	return Events{}
}
