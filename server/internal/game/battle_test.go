package game

import (
	"encoding/json"
	"path/filepath"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func battleContent() *cs.Content {
	unit := func(class, weapon string, sh, ar, hp int, dmg string, init int, tiers map[string]cs.CombatTiersValue) cs.Unit {
		return cs.Unit{Combat: cs.Combat{
			UnitClass: cs.ID(class), WeaponType: cs.ID(weapon), Shield: sh, Armor: ar, Hp: hp,
			Damage: dmg, Initiative: init, Tiers: tiers,
		}}
	}
	vsInfantry := map[string]cs.CombatTiersValue{"base:infantry": Advantage, "base:vehicle": Disadvantage, "base:structure": Disadvantage}
	none := map[string]cs.CombatTiersValue{"base:infantry": None, "base:vehicle": None, "base:structure": None}
	return &cs.Content{
		Rulesets: map[string]cs.Ruleset{RulesetID: {ToHit: 3, InitiativeDie: 20, RoundCap: 40}},
		WeaponTypes: map[string]cs.WeaponType{
			"base:kinetic":    {Shield: 0.75, Armor: 1, Hp: 1.25},
			"base:plasma":     {Shield: 1.5, Armor: 0.75, Hp: 1},
			"base:explosive":  {Shield: 0.75, Armor: 1.5, Hp: 0.75},
			"base:shieldonly": {Shield: 1, Armor: 0, Hp: 1},
		},
		Units: map[string]cs.Unit{
			"base:marine":  unit("base:infantry", "base:kinetic", 0, 0, 12, "1d4", 10, vsInfantry),
			"base:grunt":   unit("base:infantry", "base:plasma", 20, 0, 70, "1d4", 12, vsInfantry),
			"base:warthog": unit("base:vehicle", "base:kinetic", 0, 12, 25, "2d4", 14, nil), // all normal
			"base:wall":    unit("base:structure", "base:kinetic", 0, 0, 1000, "1d4", 10, none),
			"base:tank":    unit("base:vehicle", "base:kinetic", 0, 0, 1000, "1d1", 10, nil),
		},
		Buildings: map[string]cs.Building{
			"base:turret":   {Combat: &cs.Combat{UnitClass: "base:structure", WeaponType: "base:kinetic", Armor: 25, Hp: 38, Damage: "2d4", Initiative: 10, Tiers: vsInfantry}},
			"base:barracks": {},
		},
	}
}

func withRuleset(c *cs.Content, f func(*cs.Ruleset)) cs.Ruleset {
	r := c.Rulesets[RulesetID]
	f(&r)
	return r
}

// withDamage sets a unit's damage dice, e.g. "1d1+13" to always roll 14.
func withDamage(c *cs.Content, unit, dice string) {
	u := c.Units[unit]
	u.Combat.Damage = dice
	c.Units[unit] = u
}

func one(c *cs.Content, side Side, unit string) Combatant {
	return combatants(c, side, Force{Units: []UnitSlot{{Unit: unit, Count: 1}}})[0]
}

func TestDiceNotation(t *testing.T) {
	for in, want := range map[string]Dice{"1d4": {1, 4, 0}, "2d6": {2, 6, 0}, "4d6+1": {4, 6, 1}, "1d1+13": {1, 1, 13}} {
		if got := parseDice(in); got != want {
			t.Errorf("parseDice(%q) = %+v, want %+v", in, got, want)
		}
	}
}

func TestAdvantageKeepsTheHigherRollAndDisadvantageTheLower(t *testing.T) {
	seq := func(xs ...int) func() int {
		return func() int { x := xs[0]; xs = xs[1:]; return x }
	}
	if got := rollWith(Advantage, seq(3, 8)); got != 8 {
		t.Errorf("advantage of 3 and 8 = %d", got)
	}
	if got := rollWith(Disadvantage, seq(3, 8)); got != 3 {
		t.Errorf("disadvantage of 3 and 8 = %d", got)
	}
	if got := rollWith(Normal, seq(3)); got != 3 { // only one roll: a second would run out
		t.Errorf("normal = %d", got)
	}
}

func TestHitCarriesLeftoverDamageIntoTheNextLayerRoundedDown(t *testing.T) {
	c := battleContent()
	marine, grunt := one(c, Attacker, "base:marine"), one(c, Defender, "base:grunt")
	grunt.Shield = 5

	// A roll of 14: Shield takes 5 at ×0.75, using 6.67 of it; the other 7.33
	// hits HP at ×1.25, which is 9.17, rounded down to 9.
	a := hit(c, &marine, &grunt, 14)

	if !a.Hit || a.Roll != 14 || a.ShieldDmg != 5 || a.ArmorDmg != 0 || a.HPDmg != 9 || a.Killed {
		t.Errorf("action = %+v", a)
	}
	if grunt.Shield != 0 || grunt.HP != 61 {
		t.Errorf("grunt = Shield %v HP %v", grunt.Shield, grunt.HP)
	}
}

func TestAHitAlwaysDoesAtLeastOne(t *testing.T) {
	c := battleContent()
	marine, grunt := one(c, Attacker, "base:marine"), one(c, Defender, "base:grunt")

	a := hit(c, &marine, &grunt, 1) // 1 × 0.75 rounds down to 0

	if a.ShieldDmg != 1 || grunt.Shield != 19 {
		t.Errorf("action = %+v, want the minimum 1 on the Shield", a)
	}
}

func TestDamagePastDeathIsWasted(t *testing.T) {
	c := battleContent()
	marine, target := one(c, Attacker, "base:marine"), one(c, Defender, "base:marine")
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

	if a.ArmorDmg != 0 || a.HPDmg != 0 || target.Armor != 50 || target.HP != 100 {
		t.Errorf("action = %+v: Armor at ×0 stops the hit, even the minimum 1", a)
	}
}

func TestAMissIsATurnThatDealsNothing(t *testing.T) {
	c := battleContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ToHit, r.RoundCap = 21, 1 }) // a d20 never reaches 21

	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:warthog", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:wall", Count: 1}}}, 1)

	if a := res.Rounds[0][0]; a.Hit || a.Roll != 0 || a.HPDmg != 0 || a.Target != "d0001" {
		t.Errorf("action = %+v, want a recorded miss", a)
	}
}

func TestAMissingUnitClassTierCountsAsNormal(t *testing.T) {
	c := battleContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ToHit, r.RoundCap = 1, 1 })
	withDamage(c, "base:warthog", "1d1+19") // always 20
	// The Warthog has no tiers at all: one roll of 20, ×1.25 on HP.
	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:warthog", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:wall", Count: 1}}}, 1)

	if a := res.Rounds[0][0]; a.Actor != "a0001" || !a.Hit || a.Roll != 20 || a.HPDmg != 25 {
		t.Errorf("first action = %+v, want 25 HP from a normal roll of 20", a)
	}
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
	if t0 := res.Roster[len(res.Roster)-1]; t0.Armor != 25 || t0.HP != 38 {
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
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ToHit, r.InitiativeDie, r.RoundCap = 1, 1, 1 })
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
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ToHit, r.RoundCap = 1, 2 })
	withDamage(c, "base:marine", "1d1+13") // always 14: 10 to a Shield at ×0.75
	res := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 1}}},
		Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 1}}}, 3)

	// The Grunt's 20 Shield takes 10 per Marine hit: the second hit breaks it.
	var shield float64
	for _, round := range res.Rounds {
		for _, a := range round {
			if a.Actor == "a0001" {
				shield += a.ShieldDmg
			}
		}
	}
	if shield != 20 {
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
// about 8–15 Rounds. The two Starting Kits should also be roughly even:
// either attacking the other wins somewhere between 30% and 70% of the time.
func TestBaseRosterPacingAndBalance(t *testing.T) {
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
			const seeds = 300
			rounds, wins := 0, 0
			for seed := range uint64(seeds) {
				res := ResolveBattle(c, tc.attack, tc.defend, seed)
				rounds += len(res.Rounds)
				if res.Winner == Attacker {
					wins++
				}
			}
			mean, rate := float64(rounds)/seeds, float64(wins)/seeds
			t.Logf("%.1f Rounds on average; the attacker wins %.0f%%, over %d seeds", mean, rate*100, seeds)
			if mean < 8 || mean > 15 {
				t.Errorf("Starting Kits fight for %.1f Rounds on average, want 8–15", mean)
			}
			if rate < 0.3 || rate > 0.7 {
				t.Errorf("the attacker wins %.0f%%, want 30–70%%: the Starting Kits are out of balance", rate*100)
			}
		})
	}
}
