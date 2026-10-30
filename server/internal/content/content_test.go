package content

import (
	"maps"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const baseRules = `{
	// comments and trailing commas are fine: this is JSONC
	"id": "rules",
	"name": "Rules",
	"paydaySeconds": 90,
	"cancelRefundPercent": 50,
	"sellRefundPercent": 50,
	"unitSlotsPerStack": 10,
	"toHit": 3,
	"laneTypes": {"fast": 1, "slow": 2},
	"startingResources": {"credits": 1000},
	"stockpileCaps": {"credits": 3000},
	"sprawl": {"freePlanets": 4, "percent": 5},
	"exchange": [],
	"threatBands": [300, 1000, 2500],
	"gracePeriodSeconds": 180,
	"armyVisionSeconds": 15,
	"resultsSeconds": 60,
	"tech": {"projectLimit": 3, "capitalResearch": 2, "costScalingPercent": 10, "recoveryPercent": 50, "labsPerPlanet": 3, "handSize": 3,
		"rarities": {"common": {"from": 0, "weight": 10}, "uncommon": {"from": 4, "weight": 6}, "rare": {"from": 8, "weight": 3}, "legendary": {"from": 14, "weight": 1}}},
	"battlefield": {"width": 32, "height": 24, "terrainPreset": "plain", "pathClass": "infantry",
		"controlPoints": 3, "controlPointSpacing": 6, "deployDepth": 3, "buildPads": 2},
	"battle": {"startDelay": 30, "timeCap": 180, "padBuildSeconds": 10, "neutralFunds": {"credits": 400}, "captureRadius": 2, "captureSeconds": 5, "holdPoints": 2, "holdSeconds": 30,
		"highGroundToHit": 2, "heightSight": 1, "retreatCountdown": 10, "structure": {"unitClass": "infantry", "shield": 0, "armor": 20, "hp": 30},
		"classDefaults": {"infantry": {"speed": 1.5, "range": 5, "fireInterval": 1.5, "sight": 8}}},
}`

// writeMods lays out files under a temp dir, keyed "mod/relative/path", and
// returns the mod dirs for the given names.
func writeMods(t *testing.T, files map[string]string, names ...string) []string {
	t.Helper()
	root := t.TempDir()
	for path, body := range files {
		full := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	dirs := make([]string, len(names))
	for i, n := range names {
		dirs[i] = filepath.Join(root, n)
	}
	return dirs
}

func baseFiles() map[string]string {
	return map[string]string{
		"base/mod.jsonc":                       `{"name": "base", "version": "1.0.0", "title": "Halo Battles"}`,
		"base/data/resources/credits.jsonc":    `{"id": "credits", "name": "Credits"}`,
		"base/data/rulesets/rules.jsonc":       baseRules,
		"base/data/unitClasses/infantry.jsonc": `{"id": "infantry", "name": "Infantry"}`,
		"base/data/terrains/open.jsonc":        `{"id": "open", "name": "Open", "colour": "#00ff00", "cover": 0, "movement": {"infantry": 1}}`,
		"base/data/terrainPresets/plain.jsonc": `{"id": "plain", "name": "Plain",
			"noise": {"frequency": 2, "octaves": 1, "persistence": 0.5},
			"bands": [{"upTo": 1, "height": 0, "terrains": [{"upTo": 1, "terrain": "open"}]}],
			"clear": {"terrain": "open", "height": 0}}`,
	}
}

func mustLoad(t *testing.T, dirs []string) *Content {
	t.Helper()
	c, err := Load(dirs)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return c
}

func wantErr(t *testing.T, dirs []string, wants ...string) {
	t.Helper()
	_, err := Load(dirs)
	if err == nil {
		t.Fatalf("Load succeeded, want errors containing %q", wants)
	}
	for _, w := range wants {
		if !strings.Contains(err.Error(), w) {
			t.Errorf("error does not mention %q:\n%v", w, err)
		}
	}
}

func with(files map[string]string, more map[string]string) map[string]string {
	maps.Copy(files, more)
	return files
}

func TestPatchMergesFieldsAndNullDeletes(t *testing.T) {
	dirs := writeMods(t, with(baseFiles(), map[string]string{
		"base/data/resources/materials.jsonc": `{"id": "materials", "name": "Materials"}`,
		"base/data/rulesets/rules.jsonc": strings.NewReplacer(
			`"startingResources": {"credits": 1000}`, `"startingResources": {"credits": 1000, "materials": 300}`,
			`"stockpileCaps": {"credits": 3000}`, `"stockpileCaps": {"credits": 9000, "materials": 1500}`,
		).Replace(baseRules),
		"tweak/mod.jsonc": `{"name": "tweak", "version": "1.0.0", "title": "Tweak", "dependencies": ["base >= 1.0"]}`,
		"tweak/data/rulesets/rules.jsonc": `{
			"patch": "base:rules",
			"paydaySeconds": 60,
			"startingResources": {"base:credits": 5000, "base:materials": null},
		}`,
	}), "base", "tweak")

	rules := mustLoad(t, dirs).Doc.Rulesets["base:rules"]

	if rules.PaydaySeconds != 60 || rules.ToHit != 3 {
		t.Errorf("patched field should change and others stay: payday=%d toHit=%d", rules.PaydaySeconds, rules.ToHit)
	}
	want := map[string]int{"base:credits": 5000}
	if len(rules.StartingResources) != 1 || rules.StartingResources["base:credits"] != 5000 {
		t.Errorf("startingResources = %v, want %v", rules.StartingResources, want)
	}
}

func TestReplaceMustBeExplicit(t *testing.T) {
	files := with(baseFiles(), map[string]string{
		"gold/mod.jsonc":                    `{"name": "gold", "version": "1.0.0", "title": "Gold", "dependencies": ["base"]}`,
		"gold/data/resources/credits.jsonc": `{"id": "base:credits", "name": "Gold"}`,
	})
	wantErr(t, writeMods(t, files, "base", "gold"), "gold/data/resources/credits.jsonc: redefines base:credits")

	files["gold/data/resources/credits.jsonc"] = `{"id": "base:credits", "name": "Gold", "replace": true}`
	c := mustLoad(t, writeMods(t, files, "base", "gold"))
	if got := c.Doc.Resources["base:credits"]; got.Name != "Gold" || got.Replace != nil {
		t.Errorf("base:credits = %+v, want replaced Gold with no replace flag", got)
	}
}

func TestPatchCannotCarryReplace(t *testing.T) {
	files := with(baseFiles(), map[string]string{
		"base/data/rulesets/tweak.jsonc": `{"patch": "rules", "replace": true, "toHit": 1}`,
	})
	wantErr(t, writeMods(t, files, "base"), `base/data/rulesets/tweak.jsonc: a Patch can't "replace"`)
}

func TestModsLoadByDependencyDepthThenName(t *testing.T) {
	// Each mod renames the Ruleset; the last one applied wins.
	files := baseFiles()
	for name, deps := range map[string]string{"a": `"base"`, "z": `"base"`, "b": `"a"`} {
		files[name+"/mod.jsonc"] = `{"name": "` + name + `", "version": "1.0.0", "title": "x", "dependencies": [` + deps + `]}`
		files[name+"/data/rulesets/rules.jsonc"] = `{"patch": "base:rules", "name": "` + name + `"}`
	}

	// depth: a=1, z=1, b=2, so the order is base, a, z, b.
	if got := mustLoad(t, writeMods(t, files, "b", "z", "a", "base")).Doc.Rulesets["base:rules"].Name; got != "b" {
		t.Errorf("last applied = %q, want b (deepest)", got)
	}
	delete(files, "b/mod.jsonc")
	if got := mustLoad(t, writeMods(t, files, "z", "a", "base")).Doc.Rulesets["base:rules"].Name; got != "z" {
		t.Errorf("last applied = %q, want z (same depth as a, later name)", got)
	}
}

func manifest(name, version string, deps ...string) string {
	quoted := make([]string, len(deps))
	for i, d := range deps {
		quoted[i] = `"` + d + `"`
	}
	return `{"name": "` + name + `", "version": "` + version + `", "title": "x", "dependencies": [` + strings.Join(quoted, ",") + `]}`
}

func TestDependenciesAreEnforced(t *testing.T) {
	cases := []struct {
		name  string
		mods  map[string]string // mod name → manifest
		wants []string
	}{
		{"missing required", map[string]string{"a": manifest("a", "1.0.0", "base", "lib")},
			[]string{"a requires lib, which is not enabled"}},
		{"version too low", map[string]string{"a": manifest("a", "1.0.0", "base >= 2.0")},
			[]string{"a requires base >= 2.0, but base is 1.0.0"}},
		{"incompatible present", map[string]string{"a": manifest("a", "1.0.0", "base", "! b"), "b": manifest("b", "1.0.0", "base")},
			[]string{"a is incompatible with b"}},
		{"optional present but wrong version", map[string]string{"a": manifest("a", "1.0.0", "base", "? b > 1.0"), "b": manifest("b", "1.0.0", "base")},
			[]string{"a requires b > 1.0, but b is 1.0.0"}},
		{"version on incompatible", map[string]string{"a": manifest("a", "1.0.0", "base", "! b >= 1.0")},
			[]string{"a/mod.jsonc: at /dependencies/1"}},
		{"cycle", map[string]string{"a": manifest("a", "1.0.0", "b"), "b": manifest("b", "1.0.0", "a")},
			[]string{"dependency cycle"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			files := baseFiles()
			names := []string{"base"}
			for name, m := range tc.mods {
				files[name+"/mod.jsonc"] = m
				names = append(names, name)
			}
			wantErr(t, writeMods(t, files, names...), tc.wants...)
		})
	}

	t.Run("optional absent is fine", func(t *testing.T) {
		files := with(baseFiles(), map[string]string{"a/mod.jsonc": manifest("a", "1.0.0", "base", "? missing")})
		mustLoad(t, writeMods(t, files, "base", "a"))
	})
	t.Run("base is required", func(t *testing.T) {
		files := map[string]string{"a/mod.jsonc": manifest("a", "1.0.0")}
		wantErr(t, writeMods(t, files, "a"), "the base Mod must be enabled")
	})
}

func TestEveryContentProblemIsListedAtOnce(t *testing.T) {
	files := with(baseFiles(), map[string]string{
		"base/data/resources/bad-id.jsonc":   `{"id": "Not Valid", "name": "x"}`,
		"base/data/resources/extra.jsonc":    `{"id": "extra", "name": "x", "colour": "red"}`,
		"base/data/resources/dupe.jsonc":     `{"id": "credits", "name": "Dupe"}`,
		"base/data/rulesets/bad-patch.jsonc": `{"patch": "nope", "toHit": 1}`,
	})
	files["base/data/rulesets/rules.jsonc"] = strings.Replace(baseRules, `{"credits": 1000}`, `{"gold": 5}`, 1)

	// Merge, schema and cross-reference problems all come back together.
	wantErr(t, writeMods(t, files, "base"),
		"base/data/resources/dupe.jsonc: redefines base:credits",
		"patches base:nope, which doesn't exist",
		"resources base:Not Valid (from base/data/resources/bad-id.jsonc): at /id",
		"resources base:extra (from base/data/resources/extra.jsonc): at /: additional properties 'colour' not allowed",
		"rulesets base:rules: startingResources: unknown Resource base:gold")
}

func TestCrossReferencesAreChecked(t *testing.T) {
	files := baseFiles()
	files["base/data/rulesets/rules.jsonc"] = strings.Replace(baseRules, `{"credits": 1000}`, `{"gold": 5}`, 1)
	files["base/data/resources/credits.jsonc"] = `{"id": "credits", "name": "Credits", "icon": "__base__/icons/credits.png"}`
	files["base/data/rulesets/second.jsonc"] = strings.Replace(baseRules, `"id": "rules"`, `"id": "other"`, 1)

	wantErr(t, writeMods(t, files, "base"),
		"exactly one Ruleset, base:rules; found [base:other base:rules]",
		"rulesets base:rules: startingResources: unknown Resource base:gold",
		"resources base:credits: asset __base__/icons/credits.png not found")

	files = with(baseFiles(), map[string]string{
		"base/data/resources/credits.jsonc": `{"id": "credits", "name": "Credits", "icon": "__base__/icons/credits.png"}`,
		"base/assets/icons/credits.png":     "png",
	})
	mustLoad(t, writeMods(t, files, "base"))
}

func TestLoadsBaseModWithNamespacedIDs(t *testing.T) {
	dirs := writeMods(t, baseFiles(), "base")

	c := mustLoad(t, dirs)

	if got := c.Doc.Resources["base:credits"].Name; got != "Credits" {
		t.Errorf("base:credits name = %q", got)
	}
	rules := c.Doc.Rulesets["base:rules"]
	if rules.ID != "base:rules" || rules.PaydaySeconds != 90 {
		t.Errorf("base:rules = %+v", rules)
	}
	if got := rules.StartingResources["base:credits"]; got != 1000 {
		t.Errorf("unprefixed resource key should resolve to base:credits, got %v", rules.StartingResources)
	}
	if c.Hash == "" || c.Hash != mustLoad(t, dirs).Hash {
		t.Errorf("hash should be non-empty and stable, got %q", c.Hash)
	}
}
