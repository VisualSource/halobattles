package content

import (
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// variantFiles: a Faction with a Warthog, a depot that trains it, and the
// rest a unit needs.
func variantFiles(more map[string]string) map[string]string {
	return with(with(baseFiles(), map[string]string{
		"base/data/factions/unsc.jsonc":       `{"id": "unsc", "name": "UNSC", "startingKit": {"buildings": [], "stacks": []}}`,
		"base/data/weaponTypes/kinetic.jsonc": `{"id": "kinetic", "name": "Kinetic", "shield": 1, "armor": 1, "hp": 1}`,
		"base/data/units/warthog.jsonc": `{"id": "warthog", "name": "Warthog", "faction": "unsc",
			"cost": {"credits": 150}, "upkeep": {"credits": 15}, "buildTime": 30, "commandPoints": 3, "roles": ["scout"],
			"combat": {"unitClass": "infantry", "weaponType": "kinetic", "shield": 0, "armor": 12, "hp": 25, "damage": "2d4",
				"tiers": {"infantry": "advantage"}}}`,
		"base/data/units/marine.jsonc": `{"id": "marine", "name": "Marine", "faction": "unsc", "cost": {"credits": 50}, "buildTime": 15, "commandPoints": 1,
			"combat": {"unitClass": "infantry", "weaponType": "kinetic", "shield": 0, "armor": 0, "hp": 12, "damage": "1d4"}}`,
		"base/data/buildings/depot.jsonc": `{"id": "depot", "name": "Depot", "faction": "unsc", "cost": {"credits": 300}, "buildTime": 45, "upkeep": {}, "yield": {}, "commandPointBonus": 0,
			"trains": ["warthog", "marine"]}`,
	}), more)
}

func TestAUnitVariantInheritsFromItsParent(t *testing.T) {
	dirs := writeMods(t, variantFiles(map[string]string{
		"base/data/units/rocket.jsonc": `{"id": "rocket", "name": "Rocket Warthog", "variantOf": "warthog",
			"upkeep": null, "combat": {"damage": "1d8", "tiers": {"infantry": "normal"}}}`,
		"base/data/units/frost.jsonc": `{"id": "frost", "name": "Frost Warthog", "variantOf": "rocket", "roles": []}`,
		"tweak/mod.jsonc":             `{"name": "tweak", "version": "1.0.0", "title": "Tweak", "dependencies": ["base"]}`,
		// A Patch to the parent reaches its variants.
		"tweak/data/units/warthog.jsonc": `{"patch": "base:warthog", "buildTime": 40}`,
	}), "base", "tweak")
	c := mustLoad(t, dirs).Doc

	r := c.Units["base:rocket"]
	if r.Name != "Rocket Warthog" || r.Faction != "base:unsc" || r.Cost["base:credits"] != 150 || r.BuildTime != 40 || r.CommandPoints != 3 {
		t.Errorf("rocket = %+v, want the warthog's faction, cost, patched build time and CP under its own name", r)
	}
	if r.Upkeep != nil {
		t.Errorf("rocket upkeep = %v, want null to drop it", r.Upkeep)
	}
	if r.Combat.Damage != "1d8" || r.Combat.Armor != 12 || r.Combat.Tiers["base:infantry"] != "normal" {
		t.Errorf("rocket combat = %+v, want its damage over the warthog's, tiers merged", r.Combat)
	}
	if r.VariantOf == nil || *r.VariantOf != "base:warthog" {
		t.Errorf("rocket variantOf = %v, want base:warthog kept", r.VariantOf)
	}
	f := c.Units["base:frost"]
	if f.Combat.Damage != "1d8" || f.Cost["base:credits"] != 150 || len(f.Roles) != 0 {
		t.Errorf("frost = %+v, want the rocket's damage, the warthog's cost, and its own empty roles", f)
	}
	// Each variant is trained where its parent is, right after it.
	if got := c.Buildings["base:depot"].Trains; !slices.Equal(got, []cs.ID{"base:warthog", "base:rocket", "base:frost", "base:marine"}) {
		t.Errorf("depot trains %v, want each variant after its parent", got)
	}
}

func TestATrainableFalseUnitIsTrainedNowhere(t *testing.T) {
	dirs := writeMods(t, variantFiles(map[string]string{
		"base/data/units/oni.jsonc":       `{"id": "oni", "name": "ONI Warthog", "variantOf": "warthog", "trainable": false}`,
		"base/data/units/oni-gauss.jsonc": `{"id": "oni-gauss", "name": "ONI Gauss", "variantOf": "oni"}`,
	}), "base")
	if got := mustLoad(t, dirs).Doc.Buildings["base:depot"].Trains; !slices.Equal(got, []cs.ID{"base:warthog", "base:marine"}) {
		t.Errorf("depot trains %v, want neither the trainable-false variant nor its own variant", got)
	}

	dirs = writeMods(t, variantFiles(map[string]string{
		"base/data/units/oni.jsonc": `{"id": "oni", "name": "ONI Warthog", "variantOf": "warthog", "trainable": false}`,
		"base/data/buildings/station.jsonc": `{"id": "station", "name": "Station", "faction": "unsc", "cost": {"credits": 300}, "buildTime": 45, "upkeep": {}, "yield": {}, "commandPointBonus": 0,
			"trains": ["oni"]}`,
	}), "base")
	wantErr(t, dirs, "buildings base:station: trains base:oni, which isn't trainable")
}

func TestABuildingMayListAVariantItself(t *testing.T) {
	dirs := writeMods(t, variantFiles(map[string]string{
		"base/data/units/rocket.jsonc": `{"id": "rocket", "name": "Rocket Warthog", "variantOf": "warthog"}`,
		"base/data/buildings/pad.jsonc": `{"id": "pad", "name": "Pad", "faction": "unsc", "cost": {"credits": 300}, "buildTime": 45, "upkeep": {}, "yield": {}, "commandPointBonus": 0,
			"trains": ["rocket"]}`,
		// Listing it beside its parent adds it once.
		"base/data/buildings/depot.jsonc": `{"id": "depot", "name": "Depot", "faction": "unsc", "cost": {"credits": 300}, "buildTime": 45, "upkeep": {}, "yield": {}, "commandPointBonus": 0,
			"trains": ["rocket", "warthog"]}`,
	}), "base")
	c := mustLoad(t, dirs).Doc
	if got := c.Buildings["base:pad"].Trains; !slices.Equal(got, []cs.ID{"base:rocket"}) {
		t.Errorf("pad trains %v, want just the variant it lists", got)
	}
	if got := c.Buildings["base:depot"].Trains; !slices.Equal(got, []cs.ID{"base:rocket", "base:warthog"}) {
		t.Errorf("depot trains %v, want the variant once, as listed", got)
	}
}

func TestAVariantNeedsAParentAndNoCycle(t *testing.T) {
	wantErr(t, writeMods(t, variantFiles(map[string]string{
		"base/data/units/ghost.jsonc": `{"id": "ghost", "name": "Ghost Hog", "variantOf": "nope"}`,
		"base/data/units/a.jsonc":     `{"id": "a", "name": "A", "variantOf": "b"}`,
		"base/data/units/b.jsonc":     `{"id": "b", "name": "B", "variantOf": "a"}`,
	}), "base"),
		"units base:ghost: variantOf base:nope, which doesn't exist",
		"units base:a: variantOf makes a cycle")
}
