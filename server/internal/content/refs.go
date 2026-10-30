package content

import (
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// resolveRefs namespaces the references in a definition or Patch that are
// written without a prefix. A Patch may leave any field out.
func resolveRefs(kind string, obj map[string]any, ns string) {
	switch kind {
	case "rulesets":
		qualifyKeys(obj, "startingResources", ns)
		qualifyKeys(obj, "stockpileCaps", ns)
		list, _ := obj["exchange"].([]any)
		for _, v := range list {
			if r, ok := v.(map[string]any); ok {
				qualifyField(r, "give", ns)
				qualifyField(r, "get", ns)
			}
		}
		if b, ok := obj["battlefield"].(map[string]any); ok {
			qualifyField(b, "terrainPreset", ns)
			qualifyField(b, "pathClass", ns)
		}
		if b, ok := obj["battle"].(map[string]any); ok {
			qualifyKeys(b, "classDefaults", ns)
			qualifyKeys(b, "neutralFunds", ns)
			if s, ok := b["structure"].(map[string]any); ok {
				qualifyField(s, "unitClass", ns)
			}
		}
	case "factions":
		if kit, ok := obj["startingKit"].(map[string]any); ok {
			qualifyList(kit, "buildings", ns)
			qualifyStacks(kit["stacks"], ns)
		}
	case "units", "buildings":
		qualifyField(obj, "faction", ns)
		qualifyKeys(obj, "cost", ns)
		qualifyKeys(obj, "upkeep", ns)
		qualifyKeys(obj, "yield", ns)
		qualifyKeys(obj, "extracts", ns)
		qualifyKeys(obj, "storage", ns)
		if r, ok := obj["refines"].(map[string]any); ok {
			qualifyKeys(r, "input", ns)
			qualifyKeys(r, "output", ns)
		}
		qualifyList(obj, "trains", ns)
		if c, ok := obj["combat"].(map[string]any); ok {
			qualifyField(c, "unitClass", ns)
			qualifyField(c, "weaponType", ns)
			qualifyKeys(c, "tiers", ns)
		}
	case "techs":
		qualifyField(obj, "faction", ns)
		for _, field := range []string{"requires", "unlocks"} {
			if m, ok := obj[field].(map[string]any); ok {
				qualifyList(m, "techs", ns)
				qualifyList(m, "units", ns)
				qualifyList(m, "buildings", ns)
			}
		}
		effects, _ := obj["effects"].([]any)
		for _, e := range effects {
			if e, ok := e.(map[string]any); ok {
				qualifyField(e, "unitClass", ns)
				qualifyField(e, "unit", ns)
				qualifyField(e, "resource", ns)
			}
		}
	case "planetTypes":
		qualifyKeys(obj, "income", ns)
		qualifyKeys(obj, "richness", ns)
	case "terrains":
		qualifyKeys(obj, "movement", ns)
	case "terrainPresets":
		bands, _ := obj["bands"].([]any)
		for _, b := range bands {
			if b, ok := b.(map[string]any); ok {
				terrains, _ := b["terrains"].([]any)
				for _, t := range terrains {
					if t, ok := t.(map[string]any); ok {
						qualifyField(t, "terrain", ns)
					}
				}
			}
		}
		if c, ok := obj["clear"].(map[string]any); ok {
			qualifyField(c, "terrain", ns)
		}
	case "maps":
		planets, _ := obj["planets"].([]any)
		for _, p := range planets {
			if p, ok := p.(map[string]any); ok {
				qualifyField(p, "type", ns)
				if b, ok := p["battlefield"].(map[string]any); ok {
					qualifyField(b, "terrainPreset", ns)
				}
				if o, ok := p["overrides"].(map[string]any); ok {
					qualifyKeys(o, "income", ns)
					qualifyKeys(o, "richness", ns)
				}
			}
		}
		garrisons, _ := obj["garrisons"].(map[string]any)
		for _, stacks := range garrisons {
			qualifyStacks(stacks, ns)
		}
	}
}

func qualifyField(obj map[string]any, field, ns string) {
	if s, ok := obj[field].(string); ok {
		obj[field] = qualify(s, ns)
	}
}

func qualifyList(obj map[string]any, field, ns string) {
	list, _ := obj[field].([]any)
	for i, v := range list {
		if s, ok := v.(string); ok {
			list[i] = qualify(s, ns)
		}
	}
}

func qualifyKeys(obj map[string]any, field, ns string) {
	m, ok := obj[field].(map[string]any)
	if !ok {
		return
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[qualify(k, ns)] = v
	}
	obj[field] = out
}

func qualifyStacks(v any, ns string) {
	stacks, _ := v.([]any)
	for _, s := range stacks {
		entries, _ := s.([]any)
		for _, e := range entries {
			if e, ok := e.(map[string]any); ok {
				qualifyField(e, "unit", ns)
			}
		}
	}
}

// checker runs the semantic pass: references, and constraints that span
// definitions.
type checker struct {
	*loader
	doc    *contentschema.Content
	defs   map[string]map[string]map[string]any // kind → id → raw definition, to look references up
	broken map[string]bool                      // "kind id" that failed its schema
	dirs   map[string]string                    // Mod name → folder, for assets
	rules  *contentschema.Ruleset               // nil if base:rules is missing or broken
}

func (l *loader) crossCheck(doc *contentschema.Content, defs map[string]map[string]map[string]any, broken map[string]bool, mods []*mod) {
	c := &checker{loader: l, doc: doc, defs: defs, broken: broken, dirs: map[string]string{}}
	for _, m := range mods {
		c.dirs[m.Name] = m.dir
	}
	if r, ok := doc.Rulesets["base:rules"]; ok {
		c.rules = &r
	}
	if (c.rules == nil && !broken["rulesets base:rules"]) || len(doc.Rulesets) > 1 {
		c.fail("there must be exactly one Ruleset, base:rules; found %v", slices.Sorted(maps.Keys(doc.Rulesets)))
	}

	for _, id := range slices.Sorted(maps.Keys(doc.Rulesets)) {
		r := doc.Rulesets[id]
		where := "rulesets " + id
		c.resourceKeys(where+": startingResources", r.StartingResources)
		c.resourceKeys(where+": stockpileCaps", r.StockpileCaps)
		for _, res := range slices.Sorted(maps.Keys(doc.Resources)) {
			cap, ok := r.StockpileCaps[res]
			switch {
			case !ok:
				c.fail("%s: stockpileCaps has no cap for Resource %s", where, res)
			case r.StartingResources[res] > cap:
				c.fail("%s: startingResources %s is %d, over its Stockpile cap of %d", where, res, r.StartingResources[res], cap)
			}
		}
		difficulties := map[contentschema.LocalID]bool{}
		for _, d := range r.BotDifficulties {
			if difficulties[d.ID] {
				c.fail("%s: botDifficulties lists %s twice", where, d.ID)
			}
			difficulties[d.ID] = true
		}
		if !slices.IsSorted(r.ThreatBands) {
			c.fail("%s: threatBands %v must go up in order", where, r.ThreatBands)
		}
		for i, x := range r.Exchange {
			c.ref(fmt.Sprintf("%s: exchange %d give", where, i+1), "resources", string(x.Give))
			c.ref(fmt.Sprintf("%s: exchange %d get", where, i+1), "resources", string(x.Get))
			if x.Give == x.Get {
				c.fail("%s: exchange %d trades %s for itself", where, i+1, x.Give)
			}
		}
		c.ref(where+": battlefield", "terrainPresets", string(r.Battlefield.TerrainPreset))
		c.ref(where+": battlefield pathClass", "unitClasses", string(r.Battlefield.PathClass))
		c.ref(where+": battle structure", "unitClasses", string(r.Battle.Structure.UnitClass))
		c.resourceKeys(where+": battle neutralFunds", r.Battle.NeutralFunds)
		for _, class := range slices.Sorted(maps.Keys(r.Battle.ClassDefaults)) {
			c.ref(where+": battle classDefaults", "unitClasses", class)
		}
		for _, class := range slices.Sorted(maps.Keys(doc.UnitClasses)) {
			if _, ok := r.Battle.ClassDefaults[class]; !ok {
				c.fail("%s: battle classDefaults has no entry for Unit Class %s", where, class)
			}
		}
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Resources)) {
		c.asset("resources "+id, doc.Resources[id].Icon)
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Factions)) {
		f := doc.Factions[id]
		where := "factions " + id
		c.asset(where, f.Icon)
		for _, b := range f.StartingKit.Buildings {
			c.ref(where+": startingKit", "buildings", string(b))
		}
		c.stacks(where+": startingKit", f.StartingKit.Stacks)
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Units)) {
		u := doc.Units[id]
		where := "units " + id
		c.ref(where, "factions", string(u.Faction))
		c.resourceKeys(where+": cost", u.Cost)
		c.resourceKeys(where+": upkeep", u.Upkeep)
		c.combat(where, &u.Combat)
		c.asset(where, u.Icon)
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Buildings)) {
		b := doc.Buildings[id]
		where := "buildings " + id
		c.ref(where, "factions", string(b.Faction))
		c.resourceKeys(where+": cost", b.Cost)
		c.resourceKeys(where+": upkeep", b.Upkeep)
		c.resourceKeys(where+": yield", b.Yield)
		c.resourceKeys(where+": extracts", b.Extracts)
		c.resourceKeys(where+": storage", b.Storage)
		if b.Refines != nil {
			c.resourceKeys(where+": refines input", b.Refines.Input)
			c.resourceKeys(where+": refines output", b.Refines.Output)
		}
		for _, u := range b.Trains {
			c.ref(where+": trains", "units", string(u))
		}
		if b.Combat != nil {
			c.combat(where, b.Combat)
		} else if b.PadTurret != nil && *b.PadTurret {
			c.fail("%s: a padTurret needs a combat block", where)
		}
		c.asset(where, b.Icon)
	}
	for _, id := range slices.Sorted(maps.Keys(doc.PlanetTypes)) {
		p := doc.PlanetTypes[id]
		c.resourceKeys("planetTypes "+id+": income", p.Income)
		for _, r := range slices.Sorted(maps.Keys(p.Richness)) {
			c.ref("planetTypes "+id+": richness", "resources", r)
		}
		c.asset("planetTypes "+id, p.Sprite)
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Maps)) {
		c.galaxyMap("maps "+id, doc.Maps[id])
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Terrains)) {
		for _, class := range slices.Sorted(maps.Keys(doc.Terrains[id].Movement)) {
			c.ref("terrains "+id+": movement", "unitClasses", class)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(doc.TerrainPresets)) {
		c.terrainPreset("terrainPresets "+id, doc.TerrainPresets[id])
	}
	for _, id := range slices.Sorted(maps.Keys(doc.Techs)) {
		c.tech("techs "+id, doc.Techs[id])
	}
	c.techCycles(doc.Techs)
}

// tech checks a Tech's references, that a Faction's Tech names only its
// own Faction's units and buildings, and that each effect is well-formed.
func (c *checker) tech(where string, t contentschema.Tech) {
	faction := ""
	if t.Faction != nil {
		faction = string(*t.Faction)
		c.ref(where, "factions", faction)
	}
	ownFaction := func(where, kind string, id contentschema.ID) {
		c.ref(where, kind, string(id))
		var of contentschema.ID
		if kind == "units" {
			of = c.doc.Units[string(id)].Faction
		} else {
			of = c.doc.Buildings[string(id)].Faction
		}
		if faction != "" && of != "" && string(of) != faction {
			c.fail("%s: %s is %s's, not %s's", where, id, of, faction)
		}
	}
	if r := t.Requires; r != nil {
		for _, id := range r.Techs {
			c.ref(where+": requires", "techs", string(id))
		}
		for _, id := range r.Buildings {
			ownFaction(where+": requires", "buildings", id)
		}
	}
	if u := t.Unlocks; u != nil {
		for _, id := range u.Units {
			ownFaction(where+": unlocks", "units", id)
		}
		for _, id := range u.Buildings {
			ownFaction(where+": unlocks", "buildings", id)
		}
	}
	for i, e := range t.Effects {
		ew := fmt.Sprintf("%s: effect %d", where, i+1)
		if (e.Percent == nil) == (e.Amount == nil) {
			c.fail("%s: needs exactly one of percent or amount", ew)
		}
		combat := slices.Contains([]contentschema.EffectStat{"shield", "armor", "hp", "damage"}, e.Stat)
		if (e.UnitClass != nil || e.Unit != nil) && !combat && e.Stat != "buildTime" {
			c.fail("%s: unitClass and unit only narrow a combat stat or buildTime, not %s", ew, e.Stat)
		}
		if e.Resource != nil && !slices.Contains([]contentschema.EffectStat{"extractorYield", "upkeep", "stockpileCap"}, e.Stat) {
			c.fail("%s: resource only narrows extractorYield, upkeep or stockpileCap, not %s", ew, e.Stat)
		}
		if e.UnitClass != nil {
			c.ref(ew, "unitClasses", string(*e.UnitClass))
		}
		if e.Unit != nil {
			ownFaction(ew, "units", *e.Unit)
		}
		if e.Resource != nil {
			c.ref(ew, "resources", string(*e.Resource))
		}
	}
	c.asset(where, t.Icon)
}

// techCycles reports Techs that require themselves, directly or through
// others: none of them could ever be offered.
func (c *checker) techCycles(techs map[string]contentschema.Tech) {
	const (
		visiting = 1
		done     = 2
	)
	state := map[string]int{}
	var visit func(id string, path []string)
	visit = func(id string, path []string) {
		switch state[id] {
		case visiting:
			start := slices.Index(path, id)
			c.fail("techs %s: requires itself through %s", id, strings.Join(slices.Concat(path[start:], []string{id}), " → "))
			return
		case done:
			return
		}
		state[id] = visiting
		if r := techs[id].Requires; r != nil {
			for _, next := range r.Techs {
				if _, ok := techs[string(next)]; ok {
					visit(string(next), append(path, id))
				}
			}
		}
		state[id] = done
	}
	for _, id := range slices.Sorted(maps.Keys(techs)) {
		visit(id, nil)
	}
}

// terrainPreset checks Terrains exist and that bands, and the moisture
// splits inside each, rise to 1 so every cell gets a Terrain.
func (c *checker) terrainPreset(where string, p contentschema.TerrainPreset) {
	c.ref(where+": clear", "terrains", string(p.Clear.Terrain))
	rising := func(where string, upTos []float64) {
		for i, u := range upTos {
			if i > 0 && u <= upTos[i-1] {
				c.fail("%s: upTo %v doesn't rise above %v", where, u, upTos[i-1])
			}
		}
		if upTos[len(upTos)-1] != 1 {
			c.fail("%s: the last upTo is %v; it must be 1", where, upTos[len(upTos)-1])
		}
	}
	var bands []float64
	for i, b := range p.Bands {
		bw := fmt.Sprintf("%s: band %d", where, i+1)
		bands = append(bands, b.UpTo)
		var splits []float64
		for _, t := range b.Terrains {
			c.ref(bw, "terrains", string(t.Terrain))
			splits = append(splits, t.UpTo)
		}
		rising(bw+" terrains", splits)
	}
	rising(where+": bands", bands)
}

// ref reports a reference to a kind's id that doesn't exist. References to a
// definition that failed its schema were already reported.
func (c *checker) ref(where, kind, id string) {
	if _, ok := c.defs[kind][id]; ok || c.broken[kind+" "+id] {
		return
	}
	c.fail("%s: unknown %s %s", where, kinds[kind].label, id)
}

func (c *checker) resourceKeys(where string, m map[string]int) {
	for _, id := range slices.Sorted(maps.Keys(m)) {
		c.ref(where, "resources", id)
	}
}

func (c *checker) combat(where string, cb *contentschema.Combat) {
	c.ref(where+": combat", "unitClasses", string(cb.UnitClass))
	c.ref(where+": combat", "weaponTypes", string(cb.WeaponType))
	for _, class := range slices.Sorted(maps.Keys(cb.Tiers)) {
		c.ref(where+": combat tiers", "unitClasses", class) // the schema checks the tier names
	}
}

// stacks checks units exist, and that each Stack fits its Unit Slots: one
// slot per unit type.
func (c *checker) stacks(where string, stacks contentschema.Stacks) {
	for i, s := range stacks {
		seen := map[contentschema.ID]bool{}
		for _, e := range s {
			c.ref(where, "units", string(e.Unit))
			if seen[e.Unit] {
				c.fail("%s: Stack %d lists %s twice; a unit type fills one Unit Slot", where, i+1, e.Unit)
			}
			seen[e.Unit] = true
		}
		if c.rules != nil && len(s) > c.rules.UnitSlotsPerStack {
			c.fail("%s: Stack %d needs %d Unit Slots, more than the %d a Stack has", where, i+1, len(s), c.rules.UnitSlotsPerStack)
		}
	}
}

func (c *checker) galaxyMap(where string, m contentschema.GalaxyMap) {
	planets := map[contentschema.LocalID]bool{}
	for _, p := range m.Planets {
		if planets[p.ID] {
			c.fail("%s: Planet id %s is used twice", where, p.ID)
		}
		planets[p.ID] = true
		c.ref(where+": planet "+string(p.ID), "planetTypes", string(p.Type))
		if p.Battlefield != nil && p.Battlefield.TerrainPreset != nil {
			c.ref(where+": planet "+string(p.ID)+": battlefield", "terrainPresets", string(*p.Battlefield.TerrainPreset))
		}
		if p.Overrides != nil {
			c.resourceKeys(where+": planet "+string(p.ID)+": overrides income", p.Overrides.Income)
			for _, r := range slices.Sorted(maps.Keys(p.Overrides.Richness)) {
				c.ref(where+": planet "+string(p.ID)+": overrides richness", "resources", r)
			}
			c.asset(where+": planet "+string(p.ID), p.Overrides.Sprite)
		}
	}
	planet := func(where string, id contentschema.LocalID) {
		if !planets[id] {
			c.fail("%s: unknown Planet %s", where, id)
		}
	}
	for _, l := range m.Lanes {
		lw := where + ": lane " + string(l.From) + "-" + string(l.To)
		planet(lw, l.From)
		planet(lw, l.To)
		if l.From == l.To {
			c.fail("%s: a Lane can't join a Planet to itself", lw)
		}
		if c.rules != nil {
			if _, ok := c.rules.LaneTypes[l.Type]; !ok {
				c.fail("%s: unknown Lane type %q", lw, l.Type)
			}
		}
	}
	for _, id := range slices.Sorted(maps.Keys(m.Garrisons)) {
		planet(where+": garrisons", contentschema.LocalID(id))
		c.stacks(where+": garrisons", m.Garrisons[id])
	}
	seen := map[contentschema.LocalID]bool{}
	for _, s := range m.Starts {
		planet(where+": starts", s)
		if seen[s] {
			c.fail("%s: starts lists %s twice", where, s)
		}
		seen[s] = true
	}
	if m.Win.PlanetShare <= 0.5 {
		c.fail("%s: win.planetShare is %v; it must be over 0.5, so only one player can hold it", where, m.Win.PlanetShare)
	}
	if m.MinPlayers > len(m.Starts) {
		c.fail("%s: minPlayers %d is more than its %d starts", where, m.MinPlayers, len(m.Starts))
	}
}

// asset checks that "__mod__/path" exists as <mod>/assets/path.
func (c *checker) asset(where string, ref *contentschema.Asset) {
	if ref == nil {
		return
	}
	modName, path, _ := strings.Cut(strings.TrimPrefix(string(*ref), "__"), "__/")
	dir, ok := c.dirs[modName]
	if !ok {
		c.fail("%s: asset %s is in Mod %s, which is not enabled", where, *ref, modName)
		return
	}
	if _, err := os.Stat(filepath.Join(dir, "assets", filepath.FromSlash(path))); err != nil {
		c.fail("%s: asset %s not found", where, *ref)
	}
}
