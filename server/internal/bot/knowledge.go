package bot

import (
	"fmt"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// What a Bot knows: what its Views have shown, how strong forces are, and
// how far Planets are. See docs/specs/bot-spec.md#what-a-bot-knows.

// sighting is a Planet as the Bot last saw it, and when.
type sighting struct {
	planet game.PlanetView
	at     int64 // Match Time
}

// staleAfter is how long a sighting takes to count half: a Planet seen two
// minutes ago may well have changed.
const staleAfter = 120_000

// remember records every Planet in v as seen now.
func (b *Bot) remember(v game.View) {
	if b.seen == nil {
		b.seen = map[string]sighting{}
	}
	for _, p := range v.Planets {
		b.seen[p.ID] = sighting{p, v.Time}
	}
}

// freshness is how much a sighting counts at Match Time now: 1 when it's in
// view, half after staleAfter, and less from there.
func freshness(s sighting, now int64) float64 {
	return 1 / (1 + float64(now-s.at)/staleAfter)
}

// avgDice is a Damage roll's average: "2d6+1" is 8.
func avgDice(d string) float64 {
	var n, m, k int
	if _, err := fmt.Sscanf(d, "%dd%d+%d", &n, &m, &k); err != nil {
		k = 0
		if _, err := fmt.Sscanf(d, "%dd%d", &n, &m); err != nil {
			return 0
		}
	}
	return float64(n*(m+1))/2 + float64(k)
}

// strengthOf is one combatant's score, the threat score Planets show:
// (Shield + Armor + HP) × its Damage roll's average.
func strengthOf(cb *cs.Combat) float64 {
	if cb == nil {
		return 0
	}
	return float64(cb.Shield+cb.Armor+cb.Hp) * avgDice(cb.Damage)
}

// unitsStrength is the score of these units.
func unitsStrength(c *cs.Content, units []game.UnitSlot) float64 {
	sum := 0.0
	for _, u := range units {
		cb := c.Units[u.Unit].Combat
		sum += strengthOf(&cb) * float64(u.Count)
	}
	return sum
}

// stacksStrength is the score of a Planet's Stacks: what can leave it.
func stacksStrength(c *cs.Content, p game.PlanetView) float64 {
	sum := 0.0
	for _, st := range p.Stacks {
		sum += unitsStrength(c, st)
	}
	return sum
}

// planetStrength is a Planet's defence: its Stacks and armed buildings.
func planetStrength(c *cs.Content, p game.PlanetView) float64 {
	sum := stacksStrength(c, p)
	for _, id := range p.Buildings {
		sum += strengthOf(c.Buildings[id].Combat)
	}
	return sum
}

// estimate is a Planet's strength as the Bot believes it: live in view,
// as last seen otherwise, or, never seen, the map's neutral garrison for it.
func (b *Bot) estimate(v game.View, id string) float64 {
	if s, ok := b.seen[id]; ok {
		return planetStrength(b.c, s.planet)
	}
	sum := 0.0
	for _, st := range b.c.Maps[v.Map].Garrisons[id] {
		for _, e := range st {
			cb := b.c.Units[string(e.Unit)].Combat
			sum += strengthOf(&cb) * float64(e.Count)
		}
	}
	return sum
}

// hops is each Planet's Lane jumps from the nearest Planet the Bot owns.
func (b *Bot) hops(v game.View) map[string]int {
	var own []string
	for _, p := range v.Planets {
		if p.Owner == v.You {
			own = append(own, p.ID)
		}
	}
	return b.distances(v.Map, own)
}

// distances is each Planet's Lane jumps from the nearest of from.
func (b *Bot) distances(mapID string, from []string) map[string]int {
	next := map[string][]string{}
	for _, l := range b.c.Maps[mapID].Lanes {
		next[string(l.From)] = append(next[string(l.From)], string(l.To))
		next[string(l.To)] = append(next[string(l.To)], string(l.From))
	}
	dist := map[string]int{}
	queue := slices.Clone(from)
	for _, id := range from {
		dist[id] = 0
	}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, n := range next[id] {
			if _, ok := dist[n]; !ok {
				dist[n] = dist[id] + 1
				queue = append(queue, n)
			}
		}
	}
	return dist
}

// held is the Techs the Bot holds: those in its own Labs.
func held(v game.View) map[string]bool {
	h := map[string]bool{}
	for _, p := range v.Planets {
		if p.Owner != v.You {
			continue
		}
		for _, techs := range p.Labs {
			for _, t := range techs {
				h[t] = true
			}
		}
	}
	return h
}

// unlocked mirrors the server's rule: anything a Tech unlocks needs one of
// those Techs held; anything no Tech unlocks is free.
func unlocked(c *cs.Content, h map[string]bool, id string, unit bool) bool {
	locked := false
	for tid, t := range c.Techs {
		u := t.Unlocks
		if u == nil {
			continue
		}
		list := u.Buildings
		if unit {
			list = u.Units
		}
		if slices.Contains(list, cs.ID(id)) {
			if h[tid] {
				return true
			}
			locked = true
		}
	}
	return !locked
}
