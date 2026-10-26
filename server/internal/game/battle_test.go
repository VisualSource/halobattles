package game

import (
	"encoding/json"
	"math"
	"path/filepath"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func battleContent() *cs.Content {
	unit := func(class, weapon string, sh, ar, hp int, dmg float64, init int, tiers map[string]string) cs.Unit {
		return cs.Unit{Combat: cs.Combat{
			UnitClass: cs.ID(class), WeaponType: cs.ID(weapon), Shield: sh, Armor: ar, Hp: hp,
			Damage: dmg, Initiative: init, Tiers: tiers,
		}}
	}
	strongInf := map[string]string{"base:infantry": "strong", "base:vehicle": "weak", "base:structure": "weak"}
	none := map[string]string{"base:infantry": "none", "base:vehicle": "none", "base:structure": "none"}
	return &cs.Content{
		Rulesets: map[string]cs.Ruleset{RulesetID: {
			Tiers:         map[string]float64{"none": 0, "weak": 0.6, "average": 1, "strong": 1.4},
			InitiativeDie: 20, RoundCap: 40,
		}},
		WeaponTypes: map[string]cs.WeaponType{
			"base:kinetic":    {Shield: 0.75, Armor: 1, Hp: 1.25},
			"base:plasma":     {Shield: 1.5, Armor: 0.75, Hp: 1},
			"base:explosive":  {Shield: 0.75, Armor: 1.5, Hp: 0.75},
			"base:shieldonly": {Shield: 1, Armor: 0, Hp: 1},
		},
		Units: map[string]cs.Unit{
			"base:marine":  unit("base:infantry", "base:kinetic", 0, 0, 100, 10, 10, strongInf),
			"base:grunt":   unit("base:infantry", "base:plasma", 20, 0, 70, 9, 12, strongInf),
			"base:warthog": unit("base:vehicle", "base:kinetic", 0, 100, 200, 20, 14, nil), // all average
			"base:wall":    unit("base:structure", "base:kinetic", 0, 0, 1000, 1, 10, none),
			"base:tank":    unit("base:vehicle", "base:kinetic", 0, 0, 1000, 1, 10, nil),
		},
		Buildings: map[string]cs.Building{
			"base:turret":   {Combat: &cs.Combat{UnitClass: "base:structure", WeaponType: "base:kinetic", Armor: 200, Hp: 300, Damage: 20, Initiative: 10, Tiers: strongInf}},
			"base:barracks": {},
		},
	}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestHitCarriesLeftoverDamageIntoTheNextLayer(t *testing.T) {
	c := battleContent()
	marine := combatants(c, Attacker, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}})[0]
	grunt := combatants(c, Defender, Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 1}}})[0]
	grunt.Shield = 5

	// 10 × 1.4 = 14 base. Shield takes 5 at ×0.75, using 6.67 of it; the
	// other 7.33 hit HP at ×1.25.
	a := hit(c, &marine, &grunt, 14)

	if !near(a.ShieldDmg, 5) || a.ArmorDmg != 0 || !near(a.HPDmg, (14-5/0.75)*1.25) || a.Killed {
		t.Errorf("action = %+v", a)
	}
	if !near(grunt.Shield, 0) || !near(grunt.HP, 70-(14-5/0.75)*1.25) {
		t.Errorf("grunt = Shield %v HP %v", grunt.Shield, grunt.HP)
	}
}

func TestDamagePastDeathIsWasted(t *testing.T) {
	c := battleContent()
	marine := combatants(c, Attacker, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}})[0]
	target := combatants(c, Defender, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}})[0]
	target.HP = 3

	a := hit(c, &marine, &target, 14)

	if a.HPDmg != 3 || !a.Killed {
		t.Errorf("action = %+v, want 3 HP dealt and a kill", a)
	}
}

func TestALayerWithNoMultiplierStopsTheHit(t *testing.T) {
	c := battleContent()
	actor := Combatant{ID: "a0001", combat: &cs.Combat{WeaponType: "base:shieldonly"}}
	target := Combatant{ID: "d0001", Armor: 50, HP: 100}

	a := hit(c, &actor, &target, 20)

	if a.ArmorDmg != 0 || a.HPDmg != 0 || target.HP != 100 {
		t.Errorf("action = %+v: Armor with ×0 should stop the hit", a)
	}
}

func TestAMissingUnitClassTierCountsAsAverage(t *testing.T) {
	c := battleContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.RoundCap = 1 })
	// The Warthog has no tiers at all: 20 × 1.0 against a Marine, ×1.25 on HP.
	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:warthog", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:wall", Count: 1}}}, 1)

	if a := res.Rounds[0][0]; a.Actor != "a0001" || !near(a.HPDmg, 25) {
		t.Errorf("first action = %+v, want 25 HP from an average-tier hit", a)
	}
}

func withRuleset(c *cs.Content, f func(*cs.Ruleset)) cs.Ruleset {
	r := c.Rulesets[RulesetID]
	f(&r)
	return r
}

func TestDefendersAreUnitsAndArmedBuildingsOnly(t *testing.T) {
	c := battleContent()
	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 2}}},
		Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 3}}, Buildings: []string{"base:turret", "base:barracks", ""}}, 1)

	var defenders []string
	for _, cb := range res.Roster {
		if cb.Side == Defender {
			defenders = append(defenders, cb.Unit)
		}
	}
	if want := []string{"base:grunt", "base:grunt", "base:grunt", "base:turret"}; !slices.Equal(defenders, want) {
		t.Errorf("defenders = %v, want %v", defenders, want)
	}
	if t0 := res.Roster[len(res.Roster)-1]; t0.Armor != 200 || t0.HP != 300 {
		t.Errorf("the Turret starts at %+v, want full layers", t0)
	}
}

func TestTiesGoToTheDefenderThenTheLowestID(t *testing.T) {
	c := battleContent()
	// A 1-sided die: every Marine rolls 11, so only the tie-breaks order them.
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.InitiativeDie, r.RoundCap = 1, 1 })
	marines := func(n int) Force { return Force{Units: []UnitSlot{{Unit: "base:marine", Count: n}}} }

	res := ResolveBattle(c, marines(20), marines(20), 1)

	var actors []string
	for _, a := range res.Rounds[0] {
		actors = append(actors, a.Actor)
	}
	if len(actors) < 21 || actors[0] != "d0001" || actors[1] != "d0002" || actors[19] != "d0020" || actors[20] != "a0001" {
		t.Errorf("Round 1 order starts %v, want d0001…d0020 then a0001", actors[:min(len(actors), 22)])
	}
}

func TestAUnitKilledBeforeItsTurnDoesntAct(t *testing.T) {
	c := battleContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.InitiativeDie, r.RoundCap = 1, 1 })
	c.Units["base:glass"] = func(u cs.Unit) cs.Unit { u.Combat.Hp = 1; return u }(c.Units["base:marine"])

	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:glass", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}}, 1)

	if len(res.Rounds[0]) != 1 || res.Rounds[0][0].Actor != "d0001" || res.Winner != Defender {
		t.Errorf("Round 1 = %+v, winner %v; the dead attacker shouldn't act", res.Rounds[0], res.Winner)
	}
}

func TestBattleEndings(t *testing.T) {
	c := battleContent()
	force := func(unit string, n int) Force { return Force{Units: []UnitSlot{{Unit: unit, Count: n}}} }

	t.Run("attacker wins when no defenders remain", func(t *testing.T) {
		res := ResolveBattle(c, force("base:marine", 30), force("base:marine", 1), 1)
		if res.Winner != Attacker || len(res.Rounds) != 1 {
			t.Errorf("winner %v after %d Rounds", res.Winner, len(res.Rounds))
		}
	})
	t.Run("defender wins when no attackers remain", func(t *testing.T) {
		res := ResolveBattle(c, force("base:marine", 1), force("base:marine", 30), 1)
		if res.Winner != Defender || slices.ContainsFunc(res.Survivors, func(id string) bool { return id[0] == 'a' }) {
			t.Errorf("winner %v, survivors %v", res.Winner, res.Survivors)
		}
	})
	t.Run("defender wins at the Round cap", func(t *testing.T) {
		c := battleContent()
		c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.RoundCap = 3 })
		res := ResolveBattle(c, force("base:tank", 1), force("base:tank", 1), 1)
		if res.Winner != Defender || len(res.Rounds) != 3 || len(res.Survivors) != 2 {
			t.Errorf("winner %v after %d Rounds, survivors %v", res.Winner, len(res.Rounds), res.Survivors)
		}
	})
	t.Run("defender wins at once when nobody can hit anybody", func(t *testing.T) {
		res := ResolveBattle(c, force("base:wall", 2), force("base:wall", 2), 1)
		if res.Winner != Defender || len(res.Rounds) != 0 {
			t.Errorf("winner %v after %d Rounds", res.Winner, len(res.Rounds))
		}
	})
}

func TestShieldsDontRegenerateBetweenRounds(t *testing.T) {
	c := battleContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.RoundCap = 2 })
	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 1}}}, 3)

	// The Grunt's 20 Shield takes 10.5 per Marine hit: the second hit breaks it.
	var shield float64
	for _, round := range res.Rounds {
		for _, a := range round {
			if a.Actor == "a0001" {
				shield += a.ShieldDmg
			}
		}
	}
	if !near(shield, 20) {
		t.Errorf("Shield damage over 2 Rounds = %v, want all 20 of it, with no regeneration", shield)
	}
}

func TestBattlesArePureFunctionsOfForcesAndSeed(t *testing.T) {
	c := battleContent()
	attack := Force{Units: []UnitSlot{{Unit: "base:marine", Count: 12}, {Unit: "base:warthog", Count: 2}}}
	defend := Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 14}}, Buildings: []string{"base:turret"}}
	run := func(seed uint64) string {
		b, err := json.Marshal(ResolveBattle(c, attack, defend, seed))
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}

	if run(42) != run(42) {
		t.Error("the same forces and seed gave different Battles")
	}
	if run(42) == run(43) {
		t.Error("different seeds gave the same Battle")
	}
}

// The roster's pacing target: two forces of similar size should fight for
// about 8–15 Rounds.
func TestBaseRosterPacing(t *testing.T) {
	loaded, err := content.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		t.Fatal(err)
	}
	c := &loaded.Doc
	unsc := Force{Units: []UnitSlot{{Unit: "base:marine", Count: 10}, {Unit: "base:warthog", Count: 2}}}
	covenant := Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 10}, {Unit: "base:ghost", Count: 2}}}

	for _, tc := range []struct {
		name           string
		attack, defend Force
	}{
		{"UNSC attacks Covenant", unsc, covenant},
		{"Covenant attacks UNSC", covenant, unsc},
	} {
		t.Run(tc.name, func(t *testing.T) {
			const seeds = 100
			total := 0
			for seed := range uint64(seeds) {
				total += len(ResolveBattle(c, tc.attack, tc.defend, seed).Rounds)
			}
			mean := float64(total) / seeds
			t.Logf("%.1f Rounds on average over %d seeds", mean, seeds)
			if mean < 8 || mean > 15 {
				t.Errorf("Starting Kits fight for %.1f Rounds on average, want 8–15", mean)
			}
		})
	}
}
