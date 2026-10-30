package bot

import (
	"cmp"
	"math"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/game"
)

// The Commander scores goals each think; see docs/specs/bot-spec.md#goals.

type goalKind int

const (
	expand goalKind = iota
	attack
	defend
	economy
	army
	research
)

var goalNames = [...]string{"expand", "attack", "defend", "economy", "army", "research"}

// goal is something to work toward: a Planet for expand, attack and defend.
type goal struct {
	kind   goalKind
	target string
	score  float64
}

func (g goal) key() string { return goalNames[g.kind] + ":" + g.target }

// goals lists every goal worth anything, best first.
func (b *Bot) goals(v game.View) []goal {
	m := b.c.Maps[v.Map]
	hops := b.hops(v)
	own, enemy := 0.0, b.enemyForce(v) // the Bot's whole strength, and the strongest enemy force it knows of
	owned := 0
	var slots, empty int // Building Slots on its Planets, and those with nothing built or building
	var mine []game.PlanetView
	for _, p := range v.Planets {
		if p.Owner == v.You {
			owned++
			if !p.Locked {
				mine = append(mine, p) // as newTurn's: a Locked Planet's Lab can't start a Project
			}
			own += planetStrength(b.c, p)
			slots += len(p.Buildings)
			for s, id := range p.Buildings {
				if id == "" && !slices.ContainsFunc(p.Queue, func(q game.QueueItem) bool { return q.Slot == s }) {
					empty++
				}
			}
		}
	}
	for _, a := range v.Armies {
		if a.Owner == v.You {
			own += unitsStrength(b.c, a.Units)
		}
	}

	var out []goal
	add := func(kind goalKind, target string, value float64) {
		if value > 0 {
			out = append(out, goal{kind: kind, target: target, score: value})
		}
	}

	// Expand and Attack: every Planet not the Bot's, by its worth, nearness,
	// how fresh the Bot's knowledge is, and how strong it's thought to be.
	capped := v.Economy.CommandPointsUsed >= v.Economy.CommandPointsCap
	var all []fighter // every unit it has
	for _, p := range mine {
		for _, st := range p.Stacks {
			all = append(all, b.fighters(st)...)
		}
	}
	for _, a := range v.Armies {
		if a.Owner == v.You {
			all = append(all, b.fighters(a.Units)...)
		}
	}
	for _, mp := range m.Planets {
		id := string(mp.ID)
		s, seen := b.seen[id]
		owner, fresh := game.Neutral, 0.5 // never seen: assumed neutral, known only from the map
		if seen {
			owner, fresh = s.planet.Owner, freshness(s, v.Time)
		}
		d, reachable := hops[id]
		if owner == v.You || !reachable {
			continue
		}
		pt := b.c.PlanetTypes[string(mp.Type)]
		worth := 1 + float64(sum(pt.Income))/300 + float64(pt.BuildingSlots)/4
		est := b.estimate(v, id)
		value := worth * fresh / float64(1+d) / (1 + est/max(own, 1))
		// Out of reach: more than its whole force could beat, tiers and
		// failed attacks counted as an attack would, with no Command Points
		// to grow it. Chasing it would hoard units nothing else can use.
		if capped {
			theirs := b.defenders(v, id)
			if against(all, theirs) < against(theirs, all)*b.Difficulty.AttackMargin*(1+0.5*float64(b.failed[id])) {
				value /= 10
			}
		}
		if owner == game.Neutral {
			add(expand, id, value)
		} else {
			add(attack, id, value*1.5) // taking an enemy's Planet also hurts them
		}
	}

	// Defend: an own Planet with more enemy strength next to it, or headed
	// for it, than it holds.
	for _, p := range v.Planets {
		if p.Owner != v.You {
			continue
		}
		if threat, garrison := b.threat(v, p.ID), planetStrength(b.c, p); threat > garrison {
			add(defend, p.ID, 3*(threat-garrison)/threat)
		}
	}

	add(economy, "", 0.4+1.6*float64(empty)/float64(max(1, slots))) // empty slots: income its Planets could make
	add(army, "", 0.8+min(3, max(0, enemy-own)/max(own, 1)))
	if free := v.Research.Limit - len(v.Research.Projects); free > 0 && len(v.Research.Hand)+len(v.Research.Saved) > 0 {
		value := 0.8 * float64(free)
		if _, _, ok := b.lab(&turn{v: v, mine: mine}); !ok {
			value *= 2 // every Tech Slot taken: research stops once the running Projects finish
		}
		add(research, "", value)
	}

	w := b.Weights
	weight := [...]float64{w.Expand, w.Attack, w.Defend, w.Economy, w.Army, w.Research}
	for i := range out {
		g := &out[i]
		g.score *= weight[g.kind] * b.winRules(v, g, owned, len(m.Planets))
		if n := b.Difficulty.NoisePercent; n > 0 {
			g.score *= 1 + (b.rng.Float64()*2-1)*float64(n)/100
		}
		if b.current[g.key()] {
			g.score *= 1.25 // near-ties don't flip a goal it's working on
		}
	}
	slices.SortStableFunc(out, func(x, y goal) int {
		return cmp.Or(cmp.Compare(y.score, x.score), cmp.Compare(x.key(), y.key()))
	})
	return out
}

// winRules scales a goal by what wins the Match: holding more than the
// map's share of Planets, and being the last standing. See
// docs/specs/bot-spec.md#playing-to-the-win-conditions.
func (b *Bot) winRules(v game.View, g *goal, owned, planets int) float64 {
	f := 1.0
	share := b.c.Maps[v.Map].Win.PlanetShare
	need := int(math.Floor(share*float64(planets))) + 1
	s, seen := b.seen[g.target]
	switch {
	case v.Hold.Seat == v.You: // holding the share: keep it until the countdown ends
		if g.kind == defend {
			f *= 3
		} else if g.kind == expand || g.kind == attack {
			f *= 0.5
		}
	case v.Hold.Seat != game.Neutral: // an enemy is: breaking their hold comes first
		if g.kind == attack && seen && s.planet.Owner == v.Hold.Seat {
			f *= 3
		}
	case owned >= need-2 && (g.kind == expand || g.kind == attack): // nearing it
		f *= 1.5
	}
	// Last standing: an enemy Capital eliminates its player; its own must hold.
	if seen && s.planet.Capital && (g.kind == attack || g.kind == defend) {
		f *= 2
	}
	return f
}

func sum(m map[string]int) int {
	n := 0
	for _, v := range m {
		n += v
	}
	return n
}
