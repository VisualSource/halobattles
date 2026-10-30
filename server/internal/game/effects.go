package game

import (
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// mod is the sum of matching Tech effects on one stat: percentages add,
// then apply once, then flat amounts are added.
type mod struct{ percent, amount int }

// of is v with the mod, rounded to the nearest whole number.
func (m mod) of(v int) int { return (v*(100+m.percent)+50)/100 + m.amount }

// effects reads the effects of the Techs one player holds.
type effects struct {
	c    *cs.Content
	held []string // sorted, so sums are made in a fixed order
}

func (s *State) effects(c *cs.Content, seat int) effects {
	if seat == Neutral {
		return effects{c: c}
	}
	return effects{c: c, held: slices.Sorted(maps.Keys(s.heldTechs(c, seat)))}
}

// on sums the held Techs' effects on stat that match.
func (e effects) on(stat cs.EffectStat, match func(cs.Effect) bool) mod {
	var m mod
	for _, t := range e.held {
		for _, ef := range e.c.Techs[t].Effects {
			if ef.Stat != stat || !match(ef) {
				continue
			}
			if ef.Percent != nil {
				m.percent += *ef.Percent
			}
			if ef.Amount != nil {
				m.amount += *ef.Amount
			}
		}
	}
	return m
}

// all is the sum of every effect on stat: for stats nothing narrows.
func (e effects) all(stat cs.EffectStat) mod { return e.on(stat, func(cs.Effect) bool { return true }) }

// resource is the sum on stat for Resource r, or for every Resource.
func (e effects) resource(stat cs.EffectStat, r string) mod {
	return e.on(stat, func(ef cs.Effect) bool { return ef.Resource == nil || string(*ef.Resource) == r })
}

// unit is the sum on stat for one unit, by its id and Unit Class.
func (e effects) unit(stat cs.EffectStat, id, class string) mod {
	return e.on(stat, func(ef cs.Effect) bool {
		return (ef.Unit == nil || string(*ef.Unit) == id) && (ef.UnitClass == nil || string(*ef.UnitClass) == class)
	})
}

// building is the sum on stat for a building: only effects narrowed to no
// unit or Unit Class reach buildings.
func (e effects) building(stat cs.EffectStat) mod {
	return e.on(stat, func(ef cs.Effect) bool { return ef.Unit == nil && ef.UnitClass == nil })
}

// buildMs is a unit's or building's build time in ms with buildTime effects;
// a flat amount is in seconds.
func buildMs(seconds cs.Seconds, m mod) int64 {
	return max(0, int64(seconds)*int64(1000*(100+m.percent))/100+int64(m.amount)*1000)
}

// boosts are seat's combat effects for a Battle, on every unit and armed
// building: fixed when it starts.
func (s *State) boosts(c *cs.Content, seat int) map[string]battle.Boost {
	e := s.effects(c, seat)
	if len(e.held) == 0 {
		return nil
	}
	boost := func(id string, cb *cs.Combat) battle.Boost {
		get := func(stat cs.EffectStat) battle.Mod {
			m := e.unit(stat, id, string(cb.UnitClass))
			return battle.Mod{Percent: m.percent, Amount: m.amount}
		}
		return battle.Boost{Shield: get("shield"), Armor: get("armor"), HP: get("hp"), Damage: get("damage")}
	}
	out := map[string]battle.Boost{}
	for id, u := range c.Units {
		out[id] = boost(id, &u.Combat)
	}
	for id, b := range c.Buildings {
		if b.Combat != nil {
			out[id] = boost(id, b.Combat)
		}
	}
	return out
}
