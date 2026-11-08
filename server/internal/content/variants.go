package content

import (
	"maps"
	"slices"
)

// resolveVariants merges each Unit Variant over its parent, parent first, as
// a Patch would: it inherits everything but its own keys. One with a missing
// parent or in a cycle is dropped.
func (l *loader) resolveVariants(units map[string]map[string]any) {
	done, failed := map[string]bool{}, map[string]bool{}
	var resolve func(id string, seen []string) bool
	resolve = func(id string, seen []string) bool {
		parent, isVariant := units[id]["variantOf"].(string)
		switch {
		case failed[id]:
			return false
		case !isVariant || done[id]:
			return true
		case slices.Contains(seen, id):
			l.fail("units %s: variantOf makes a cycle", id)
		case units[parent] == nil:
			l.fail("units %s: variantOf %s, which doesn't exist", id, parent)
		case resolve(parent, append(seen, id)):
			units[id] = mergePatch(units[parent], units[id]).(map[string]any)
			done[id] = true
			return true
		}
		failed[id] = true
		return false
	}
	for _, id := range slices.Sorted(maps.Keys(units)) {
		resolve(id, nil)
	}
	for id := range failed {
		delete(units, id)
	}
}

// trainVariants adds each trainable Unit Variant to every building that
// trains its parent, right after it, and refuses a building listing a unit
// that isn't trainable.
func (l *loader) trainVariants(doc map[string]map[string]map[string]any) {
	units := doc["units"]
	kids := map[string][]string{}
	for _, id := range slices.Sorted(maps.Keys(units)) {
		if p, ok := units[id]["variantOf"].(string); ok {
			kids[p] = append(kids[p], id)
		}
	}
	trainable := func(id string) bool {
		t, set := units[id]["trainable"].(bool)
		return !set || t
	}
	for _, bid := range slices.Sorted(maps.Keys(doc["buildings"])) {
		b := doc["buildings"][bid]
		list, _ := b["trains"].([]any)
		if list == nil {
			continue
		}
		out, seen := []any{}, map[string]bool{}
		var add func(id string)
		add = func(id string) {
			if seen[id] {
				return
			}
			seen[id] = true
			out = append(out, id)
			for _, k := range kids[id] {
				if trainable(k) {
					add(k)
				}
			}
		}
		for _, v := range list {
			id, _ := v.(string)
			if units[id] != nil && !trainable(id) {
				l.fail("buildings %s: trains %s, which isn't trainable", bid, id)
				continue
			}
			add(id)
		}
		b["trains"] = out
	}
}

// classTiers lays each unit's and building's own tiers over its Unit Class's
// default ones, so a unit lists only the tiers where it differs from its
// class, and everything after the loader sees them merged.
func classTiers(doc map[string]map[string]map[string]any) {
	for _, kind := range []string{"units", "buildings"} {
		for _, def := range doc[kind] {
			cb, _ := def["combat"].(map[string]any)
			class, _ := cb["unitClass"].(string)
			base, _ := doc["unitClasses"][class]["tiers"].(map[string]any)
			if base == nil {
				continue
			}
			own, _ := cb["tiers"].(map[string]any)
			tiers := maps.Clone(base)
			maps.Copy(tiers, own)
			cb["tiers"] = tiers
		}
	}
}
