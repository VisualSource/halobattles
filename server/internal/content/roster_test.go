package content

import (
	"path/filepath"
	"strings"
	"testing"
)

// rosterFiles is a small valid Mod using every kind. References are written
// without a prefix, so they resolve to base.
func rosterFiles() map[string]string {
	return with(baseFiles(), map[string]string{
		"base/data/unitClasses/infantry.jsonc": `{"id": "infantry", "name": "Infantry"}`,
		"base/data/weaponTypes/kinetic.jsonc":  `{"id": "kinetic", "name": "Kinetic", "shield": 0.75, "armor": 1, "hp": 1.25}`,
		"base/data/factions/unsc.jsonc": `{"id": "unsc", "name": "UNSC",
			"startingKit": {"buildings": ["barracks"], "stacks": [[{"unit": "marine", "count": 10}]]}}`,
		"base/data/units/marine.jsonc": `{"id": "marine", "name": "Marine", "faction": "unsc",
			"cost": {"credits": 50}, "buildTime": 15, "commandPoints": 1,
			"combat": {"unitClass": "infantry", "weaponType": "kinetic", "shield": 0, "armor": 0, "hp": 100,
				"damage": "1d4", "tiers": {"infantry": "advantage"}}}`,
		"base/data/buildings/barracks.jsonc": `{"id": "barracks", "name": "Barracks", "faction": "unsc",
			"cost": {"credits": 150}, "buildTime": 30, "upkeep": {"credits": 10}, "yield": {},
			"commandPointBonus": 0, "trains": ["marine"]}`,
		"base/data/planetTypes/standard.jsonc": `{"id": "standard", "name": "Standard",
			"income": {"credits": 200}, "buildingSlots": 3, "commandPointBonus": 10}`,
		"base/data/maps/duel.jsonc": `{"id": "duel", "name": "Duel",
			"planets": [
				{"id": "a", "name": "A", "type": "standard", "position": {"x": 0, "y": 0}},
				{"id": "b", "name": "B", "type": "standard", "position": {"x": 10, "y": 0}},
			],
			"lanes": [{"from": "a", "to": "b", "type": "fast", "length": 30}],
			"garrisons": {"b": [[{"unit": "marine", "count": 6}]]},
			"starts": ["a", "b"], "minPlayers": 2,
			"win": {"planetShare": 0.6, "holdSeconds": 90}}`,
	})
}

func TestRosterReferencesResolveToTheirMod(t *testing.T) {
	c := mustLoad(t, writeMods(t, rosterFiles(), "base"))

	marine := c.Doc.Units["base:marine"]
	if marine.Faction != "base:unsc" || marine.Combat.UnitClass != "base:infantry" || marine.Combat.WeaponType != "base:kinetic" {
		t.Errorf("marine refs = %q %q %q", marine.Faction, marine.Combat.UnitClass, marine.Combat.WeaponType)
	}
	if marine.Combat.Tiers["base:infantry"] != "advantage" || marine.Cost["base:credits"] != 50 {
		t.Errorf("marine tiers/cost keys not namespaced: %v %v", marine.Combat.Tiers, marine.Cost)
	}
	kit := c.Doc.Factions["base:unsc"].StartingKit
	if kit.Buildings[0] != "base:barracks" || kit.Stacks[0][0].Unit != "base:marine" {
		t.Errorf("starting kit refs = %+v", kit)
	}
	if got := c.Doc.Buildings["base:barracks"].Trains; got[0] != "base:marine" {
		t.Errorf("trains = %v", got)
	}
	m := c.Doc.Maps["base:duel"]
	if m.Planets[0].Type != "base:standard" || m.Planets[0].ID != "a" || m.Garrisons["b"][0][0].Unit != "base:marine" {
		t.Errorf("map refs: planet type %q, local id %q, garrison %v", m.Planets[0].Type, m.Planets[0].ID, m.Garrisons)
	}
}

func TestDanglingReferencesAreReported(t *testing.T) {
	files := rosterFiles()
	files["base/data/units/marine.jsonc"] = `{"id": "marine", "name": "Marine", "faction": "innie",
		"cost": {"gold": 1}, "buildTime": 15, "commandPoints": 1,
		"combat": {"unitClass": "robot", "weaponType": "laser", "shield": 0, "armor": 0, "hp": 100,
			"damage": "1d4", "tiers": {"ghost": "advantage"}},
		"icon": "__base__/marine.png"}`
	files["base/data/buildings/barracks.jsonc"] = `{"id": "barracks", "name": "Barracks", "faction": "unsc",
		"cost": {}, "buildTime": 30, "upkeep": {}, "yield": {}, "commandPointBonus": 0, "trains": ["spartan"]}`
	files["base/data/factions/unsc.jsonc"] = `{"id": "unsc", "name": "UNSC",
		"startingKit": {"buildings": ["bunker"], "stacks": [[{"unit": "odst", "count": 1}]]}}`
	files["base/data/maps/duel.jsonc"] = `{"id": "duel", "name": "Duel",
		"planets": [
			{"id": "a", "name": "A", "type": "gas-giant", "position": {"x": 0, "y": 0}},
			{"id": "a", "name": "A again", "type": "standard", "position": {"x": 5, "y": 0}},
		],
		"lanes": [{"from": "a", "to": "nowhere", "type": "warp"}],
		"garrisons": {"void": [[{"unit": "flood", "count": 6}]]},
		"starts": ["a", "z"], "minPlayers": 3,
		"win": {"planetShare": 0.6, "holdSeconds": 90}}`

	wantErr(t, writeMods(t, files, "base"),
		"units base:marine: unknown Faction base:innie",
		"units base:marine: cost: unknown Resource base:gold",
		"units base:marine: combat: unknown Unit Class base:robot",
		"units base:marine: combat: unknown Weapon Type base:laser",
		"units base:marine: combat tiers: unknown Unit Class base:ghost",
		"units base:marine: asset __base__/marine.png not found",
		"buildings base:barracks: trains: unknown Unit base:spartan",
		"factions base:unsc: startingKit: unknown Building base:bunker",
		"factions base:unsc: startingKit: unknown Unit base:odst",
		"maps base:duel: planet a: unknown Planet Type base:gas-giant",
		"maps base:duel: Planet id a is used twice",
		"maps base:duel: lane a-nowhere: unknown Planet nowhere",
		`maps base:duel: lane a-nowhere: unknown Lane type "warp"`,
		"maps base:duel: garrisons: unknown Planet void",
		"maps base:duel: garrisons: unknown Unit base:flood",
		"maps base:duel: starts: unknown Planet z",
		"maps base:duel: minPlayers 3 is more than its 2 starts")
}

func TestBrokenRulesetStillListsOtherProblems(t *testing.T) {
	files := rosterFiles()
	files["base/data/rulesets/rules.jsonc"] = strings.Replace(baseRules, `"toHit": 3`, `"toHit": "lots"`, 1)
	files["base/data/factions/unsc.jsonc"] = `{"id": "unsc", "name": "UNSC", "startingKit": {"buildings": ["bunker"], "stacks": []}}`

	// Tier and Lane type checks need the Ruleset; without it they're skipped.
	wantErr(t, writeMods(t, files, "base"),
		"rulesets base:rules (from base/data/rulesets/rules.jsonc): at /toHit",
		"factions base:unsc: startingKit: unknown Building base:bunker")
}

func TestInvalidFixturesFailReadably(t *testing.T) {
	cases := map[string]struct {
		file, body, want string
	}{
		"win share of 0.5": {"base/data/maps/duel.jsonc",
			strings.Replace(rosterFiles()["base/data/maps/duel.jsonc"], `"planetShare": 0.6`, `"planetShare": 0.5`, 1),
			"maps base:duel: win.planetShare is 0.5; it must be over 0.5"},
		"non-ASCII id": {"base/data/unitClasses/infantry.jsonc", `{"id": "infanterí", "name": "Infantry"}`,
			"unitClasses base:infanterí (from base/data/unitClasses/infantry.jsonc): at /id: 'base:infanterí' does not match pattern"},
		"unmarked redefinition": {"base/data/units/marine2.jsonc",
			`{"id": "marine", "name": "Marine II", "faction": "unsc", "cost": {}, "buildTime": 1, "commandPoints": 1,
				"combat": {"unitClass": "infantry", "weaponType": "kinetic", "shield": 0, "armor": 0, "hp": 1, "damage": "1d1"}}`,
			`base/data/units/marine2.jsonc: redefines base:marine; add "replace": true or write a Patch`},
		"unknown tier": {"base/data/units/marine.jsonc",
			strings.Replace(rosterFiles()["base/data/units/marine.jsonc"], `"advantage"`, `"mighty"`, 1),
			"units base:marine (from base/data/units/marine.jsonc): at /combat/tiers/base:infantry: value must be one of"},
		"bad dice": {"base/data/units/marine.jsonc",
			strings.Replace(rosterFiles()["base/data/units/marine.jsonc"], `"1d4"`, `"d4"`, 1),
			"units base:marine (from base/data/units/marine.jsonc): at /combat/damage"},
		"pad turret that can't fight": {"base/data/buildings/barracks.jsonc",
			strings.Replace(rosterFiles()["base/data/buildings/barracks.jsonc"], `"trains": ["marine"]`, `"trains": ["marine"], "padTurret": true`, 1),
			"buildings base:barracks: a padTurret needs a combat block"},
		"class without Battle stats": {"base/data/unitClasses/vehicle.jsonc", `{"id": "vehicle", "name": "Vehicle"}`,
			"rulesets base:rules: battle classDefaults has no entry for Unit Class base:vehicle"},
		"starting resources over a cap": {"base/data/rulesets/rules.jsonc",
			strings.Replace(baseRules, `"stockpileCaps": {"credits": 3000}`, `"stockpileCaps": {"credits": 500}`, 1),
			"rulesets base:rules: startingResources base:credits is 1000, over its Stockpile cap of 500"},
		"a Resource with no cap": {"base/data/rulesets/rules.jsonc",
			strings.Replace(baseRules, `"stockpileCaps": {"credits": 3000}`, `"stockpileCaps": {}`, 1),
			"rulesets base:rules: stockpileCaps has no cap for Resource base:credits"},
		"an exchange rate for itself": {"base/data/rulesets/rules.jsonc",
			strings.Replace(baseRules, `"exchange": []`, `"exchange": [{"give": "credits", "giveAmount": 2, "get": "credits", "getAmount": 1}]`, 1),
			"rulesets base:rules: exchange 1 trades base:credits for itself"},
		"an exchange rate for an unknown Resource": {"base/data/rulesets/rules.jsonc",
			strings.Replace(baseRules, `"exchange": []`, `"exchange": [{"give": "gold", "giveAmount": 1, "get": "credits", "getAmount": 1}]`, 1),
			"rulesets base:rules: exchange 1 give: unknown Resource base:gold"},
		"dangling reference": {"base/data/buildings/barracks.jsonc",
			strings.Replace(rosterFiles()["base/data/buildings/barracks.jsonc"], `["marine"]`, `["spartan"]`, 1),
			"buildings base:barracks: trains: unknown Unit base:spartan"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			wantErr(t, writeMods(t, with(rosterFiles(), map[string]string{tc.file: tc.body}), "base"), tc.want)
		})
	}
}

// The real base Mod, against the numbers in the game-design spec.
func TestBaseModMatchesTheSpec(t *testing.T) {
	c := mustLoad(t, []string{filepath.Join("..", "..", "..", "mods", "base")})
	d := c.Doc

	counts := map[string][2]int{
		"factions": {len(d.Factions), 2}, "units": {len(d.Units), 10}, "buildings": {len(d.Buildings), 16},
		"unitClasses": {len(d.UnitClasses), 4}, "weaponTypes": {len(d.WeaponTypes), 3},
		"planetTypes": {len(d.PlanetTypes), 4}, "maps": {len(d.Maps), 2}, "resources": {len(d.Resources), 3},
		"terrains": {len(d.Terrains), 8}, "terrainPresets": {len(d.TerrainPresets), 3},
	}
	for kind, n := range counts {
		if n[0] != n[1] {
			t.Errorf("%s: got %d, want %d", kind, n[0], n[1])
		}
	}
	for id, b := range d.Buildings {
		if b.CommandPointBonus != 0 {
			t.Errorf("%s: commandPointBonus %d, want 0", id, b.CommandPointBonus)
		}
	}
	perFaction := map[string]int{}
	for _, u := range d.Units {
		perFaction[string(u.Faction)]++
	}
	if perFaction["base:unsc"] != 5 || perFaction["base:covenant"] != 5 {
		t.Errorf("units per Faction = %v, want 5 each", perFaction)
	}

	// Spot checks against the spec tables.
	if s := d.Units["base:scorpion"]; s.Combat.Armor != 38 || s.Combat.Hp != 38 || s.Combat.Damage != "4d6+1" ||
		s.Combat.Tiers["base:aircraft"] != "none" || s.Cost["base:materials"] != 100 || s.CommandPoints != 4 {
		t.Errorf("scorpion = %+v", s)
	}
	if b := d.Units["base:banshee"]; b.Combat.Shield != 13 || b.Combat.Hp != 20 || b.BuildTime != 50 {
		t.Errorf("banshee = %+v", b)
	}
	if g := d.Units["base:ghost"]; g.Cost["base:alloys"] != 15 || g.Upkeep["base:credits"] != 15 || g.Upkeep["base:alloys"] != 1 {
		t.Errorf("ghost cost %v, upkeep %v", g.Cost, g.Upkeep)
	}
	if b := d.Buildings["base:plasma-turret"]; b.Cost["base:alloys"] != 20 {
		t.Errorf("plasma-turret cost %v", b.Cost)
	}
	if w := d.WeaponTypes["base:plasma"]; w.Shield != 1.5 || w.Armor != 0.75 || w.Hp != 1 {
		t.Errorf("plasma = %+v", w)
	}
	if p := d.PlanetTypes["base:fortress"]; p.BuildingSlots != 4 || p.CommandPointBonus != 15 || p.Income["base:credits"] != 40 ||
		p.Richness["base:materials"] != "rich" {
		t.Errorf("fortress = %+v", p)
	}
	if y := d.Buildings["base:mine"].Extracts["base:materials"]; y != 60 {
		t.Errorf("mine extracts %d, want 60 Materials", y)
	}

	m := d.Maps["base:quadrant"]
	if len(m.Planets) != 13 || len(m.Lanes) != 16 || len(m.Starts) != 4 || m.MinPlayers != 2 ||
		m.Win.PlanetShare != 0.6 || m.Win.HoldSeconds != 90 {
		t.Errorf("map: %d planets, %d lanes, %d starts, minPlayers %d, win %+v", len(m.Planets), len(m.Lanes), len(m.Starts), m.MinPlayers, m.Win)
	}
	for _, s := range m.Starts {
		if _, ok := m.Garrisons[string(s)]; !ok {
			t.Errorf("start %s has no unused-start garrison", s)
		}
	}
}

func TestTerrainReferencesAndBandsAreChecked(t *testing.T) {
	files := rosterFiles()
	files["base/data/terrains/open.jsonc"] = `{"id": "open", "name": "Open", "colour": "#00ff00", "cover": 0, "movement": {"hover": 1}}`
	files["base/data/terrainPresets/plain.jsonc"] = `{"id": "plain", "name": "Plain",
		"noise": {"frequency": 2, "octaves": 1, "persistence": 0.5},
		"bands": [
			{"upTo": 0.5, "height": 0, "terrains": [{"upTo": 0.9, "terrain": "lava"}]},
			{"upTo": 0.4, "height": 1, "terrains": [{"upTo": 1, "terrain": "open"}]},
		],
		"clear": {"terrain": "open", "height": 0}}`
	files["base/data/maps/duel.jsonc"] = strings.Replace(files["base/data/maps/duel.jsonc"],
		`"position": {"x": 0, "y": 0}}`, `"position": {"x": 0, "y": 0}, "battlefield": {"terrainPreset": "swamp"}}`, 1)

	wantErr(t, writeMods(t, files, "base"),
		"terrains base:open: movement: unknown Unit Class base:hover",
		"terrainPresets base:plain: band 1: unknown Terrain base:lava",
		"terrainPresets base:plain: band 1 terrains: the last upTo is 0.9; it must be 1",
		"terrainPresets base:plain: bands: upTo 0.4 doesn't rise above 0.5",
		"terrainPresets base:plain: bands: the last upTo is 0.4; it must be 1",
		"maps base:duel: planet a: battlefield: unknown Terrain Preset base:swamp")
}
