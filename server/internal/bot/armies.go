package bot

import (
	"math"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// A Bot's military: home guards, staging, Armies at the attack margin, and
// Retreat. See docs/specs/bot-spec.md#armies.

// guard is the strength a Planet keeps home: the enemy strength seen near
// it, times the Defend weight; a Capital's half again.
func (b *Bot) guard(t *turn, p game.PlanetView) float64 {
	g := b.threat(t.v, p.ID) * b.Weights.Defend
	if p.Capital {
		g *= 1.5
	}
	return g
}

// spare is what of p's Stacks can leave while it keeps its guard (its armed
// buildings count toward that): the units, their strength, and the Stacks
// left behind.
func (b *Bot) spare(t *turn, p game.PlanetView) (units []*wire.ArmyUnitsT, strength float64, kept [game.StacksPerPlanet]game.Stack) {
	keep := b.guard(t, p) - (planetStrength(b.c, p) - stacksStrength(b.c, p))
	for s, st := range p.Stacks {
		for _, u := range st {
			cb := b.c.Units[u.Unit].Combat
			each := strengthOf(&cb)
			stay := u.Count
			if each > 0 {
				stay = min(u.Count, max(0, int(math.Ceil(keep/each))))
			}
			keep -= float64(stay) * each
			if stay > 0 {
				kept[s] = append(kept[s], game.UnitSlot{Unit: u.Unit, Count: stay})
			}
			if n := u.Count - stay; n > 0 {
				units = append(units, &wire.ArmyUnitsT{Stack: byte(s), Unit: u.Unit, Count: uint32(n)})
				strength += float64(n) * each
			}
		}
	}
	return units, strength, kept
}

// staging is the own Planet nearest target, where an Army for it gathers.
func (b *Bot) staging(t *turn, target string) *game.PlanetView {
	d := b.distances(t.v.Map, []string{target})
	var best *game.PlanetView
	for i, p := range t.mine {
		if n, ok := d[p.ID]; ok && (best == nil || n < d[best.ID]) {
			best = &t.mine[i]
		}
	}
	return best
}

// inbound reports whether any of the Bot's Armies is headed for a Planet.
func (b *Bot) inbound(t *turn, planet string) bool {
	return slices.ContainsFunc(t.v.Armies, func(a game.ArmyView) bool { return a.Owner == t.v.You && a.Destination == planet })
}

// fighter is a number of one combatant, for a matchup.
type fighter struct {
	cb *cs.Combat
	n  int
}

func (b *Bot) fighters(units []game.UnitSlot) []fighter {
	var out []fighter
	for _, u := range units {
		cb := b.c.Units[u.Unit].Combat
		out = append(out, fighter{&cb, u.Count})
	}
	return out
}

// defenders is what holds a Planet, as the Bot believes: as last seen, or,
// never seen, the map's neutral garrison for it.
func (b *Bot) defenders(v game.View, id string) []fighter {
	var out []fighter
	if s, ok := b.seen[id]; ok {
		for _, st := range s.planet.Stacks {
			out = append(out, b.fighters(st)...)
		}
		for _, bid := range s.planet.Buildings {
			if cb := b.c.Buildings[bid].Combat; cb != nil {
				out = append(out, fighter{cb, 1})
			}
		}
		return out
	}
	for _, st := range b.c.Maps[v.Map].Garrisons[id] {
		for _, e := range st {
			cb := b.c.Units[string(e.Unit)].Combat
			out = append(out, fighter{&cb, e.Count})
		}
	}
	return out
}

// against is fs's strength against foes: each one's score times what its
// Advantage tiers make it worth against foes' Unit Classes.
func against(fs, foes []fighter) float64 {
	classes := map[string]int{}
	for _, f := range foes {
		classes[string(f.cb.UnitClass)] += f.n
	}
	sum := 0.0
	for _, f := range fs {
		sum += strengthOf(f.cb) * float64(f.n) * matchup(f.cb, classes)
	}
	return sum
}

// strongEnough reports whether the spare units at st, with those on their
// way if withInbound, beat g's target at the attack margin, tiers counted on
// both sides.
func (b *Bot) strongEnough(t *turn, g goal, st *game.PlanetView, withInbound bool) bool {
	units, _, _ := b.spare(t, *st)
	var ours []fighter
	for _, u := range units {
		cb := b.c.Units[u.Unit].Combat
		ours = append(ours, fighter{&cb, int(u.Count)})
	}
	if withInbound {
		for _, a := range t.v.Armies {
			if a.Owner == t.v.You && a.Destination == st.ID {
				ours = append(ours, b.fighters(a.Units)...)
			}
		}
	}
	theirs := b.defenders(t.v, g.target)
	have := against(ours, theirs)
	return have > 0 && have >= against(theirs, ours)*b.Difficulty.AttackMargin*(1+0.5*float64(b.failed[g.target]))
}

// learn counts the attacks that failed: a Battle the Bot attacked in, now
// over, on a Planet that isn't its own. Each asks half as much again of the
// next Army; taking the Planet clears them.
func (b *Bot) learn(v game.View) {
	now := map[uint32]string{}
	for _, bt := range v.Battles {
		if bt.Attacker == v.You {
			now[bt.ID] = bt.Planet
		}
	}
	for id, planet := range b.attacking {
		if s, ok := b.seen[planet]; now[id] == "" && ok && s.planet.Owner != v.You {
			b.failed[planet]++
		}
	}
	for _, p := range v.Planets {
		if p.Owner == v.You {
			delete(b.failed, p.ID)
		}
	}
	b.attacking = now
}

// ready reports whether g's Army can go, or will once the units on their
// way to its staging Planet arrive.
func (b *Bot) ready(t *turn, g goal) bool {
	st := b.staging(t, g.target)
	return st != nil && !b.underway(t, g.target) && b.strongEnough(t, g, st, true)
}

// underway reports whether the Bot is already attacking a Planet: an Army
// headed there, or a Battle on it. Another Army would wait in orbit and
// fight on its own once that Battle ended, a wave at a time.
func (b *Bot) underway(t *turn, target string) bool {
	return b.inbound(t, target) || slices.ContainsFunc(t.v.Battles, func(bt game.BattleView) bool {
		return bt.Planet == target && bt.Attacker == t.v.You
	})
}

// gatherAt is where g's spare units go: the threatened Planet to defend,
// the staging Planet to attack from.
func (b *Bot) gatherAt(t *turn, g goal) string {
	if g.kind == defend {
		return g.target
	}
	if st := b.staging(t, g.target); st != nil {
		return st.ID
	}
	return ""
}

// richest is the own Planet with the most spare strength, other than except
// and any Planet units are gathering at: a staging Planet keeps what it has,
// or two goals would trade units back and forth.
func (b *Bot) richest(t *turn, except string) (*game.PlanetView, float64) {
	var best *game.PlanetView
	most := 0.0
	for i, p := range t.mine {
		if p.ID == except || t.gathering[p.ID] || b.inbound(t, p.ID) {
			continue
		}
		if _, s, _ := b.spare(t, p); s > most {
			best, most = &t.mine[i], s
		}
	}
	return best, most
}

// send orders p's spare units to planet, and takes them from this think's
// picture so no later goal sends them again.
func (b *Bot) send(t *turn, p *game.PlanetView, to string) *Command {
	units, _, kept := b.spare(t, *p)
	if len(units) == 0 {
		return nil
	}
	p.Stacks = kept
	return b.command(wire.OpOrderArmy, &wire.OrderArmyT{Seq: b.nextSeq(), FromPlanet: p.ID, Units: units, ToPlanet: to})
}

// sendArmy sends the staging Planet's spare units at g's target, once all
// of the Army has gathered there.
func (b *Bot) sendArmy(t *turn, g goal) *Command {
	st := b.staging(t, g.target)
	if st == nil || b.inbound(t, st.ID) || b.underway(t, g.target) {
		return nil // still gathering, or already attacking
	}
	if !b.strongEnough(t, g, st, false) {
		return nil
	}
	return b.send(t, st, g.target)
}

// gather sends the most spare units from another Planet to where g needs them.
func (b *Bot) gather(t *turn, g goal) *Command {
	to := b.gatherAt(t, g)
	from, _ := b.richest(t, to)
	if from == nil || to == "" {
		return nil
	}
	return b.send(t, from, to)
}

// retreat Retreats from a Battle the Bot's side is losing: its strength
// below the difficulty's share of the enemy's it can see.
func (b *Bot) retreat(v game.View, bt game.BattleView) *Command {
	side := battle.Attacker
	if bt.Defender == v.You {
		side = battle.Defender
	}
	share := b.Difficulty.RetreatBelowPercent
	owned := 0
	for _, p := range v.Planets {
		if p.Owner == v.You {
			owned++
		}
	}
	// A defender with no other Planet has nowhere to Retreat to; the server refuses it.
	if share == 0 || bt.RetreatAt != 0 || bt.Retreating[side] || side == battle.Defender && owned < 2 {
		return nil
	}
	own, enemy := 0.0, 0.0
	for _, sq := range bt.Squads {
		cb := b.c.Buildings[sq.Unit].Combat
		if !sq.Building {
			u := b.c.Units[sq.Unit].Combat
			cb = &u
		}
		if s := strengthOf(cb) * float64(sq.Count); sq.Side == side {
			own += s
		} else {
			enemy += s
		}
	}
	if own >= enemy*float64(share)/100 {
		return nil
	}
	return b.command(wire.OpBattleRetreat, &wire.BattleRetreatT{Seq: b.nextSeq(), Planet: bt.Planet})
}
