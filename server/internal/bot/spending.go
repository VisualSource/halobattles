package bot

import (
	"fmt"
	"maps"
	"math"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// What a Bot spends on: buildings and where, units, the Exchange and
// research. See docs/specs/bot-spec.md#building-and-training and #research.

// richness is the server's extractor multiplier per Richness level (game/economy.go).
var richness = map[string]float64{"none": 0, "poor": 0.5, "normal": 1, "rich": 1.5}

// researchWorth is a point of Research against one of a Resource.
const researchWorth = 0.5

// after is the budget and Payday projection once n of something costing
// cost (with Sprawl) and upkeep each Payday is queued, and whether that
// fits: paid now over the reserve, and the next Payday out of debt.
func (t *turn) after(cost, upkeep map[string]int, n int) (budget, net map[string]int, ok bool) {
	budget, net = maps.Clone(t.budget), maps.Clone(t.net)
	for r, a := range cost {
		budget[r] -= (a*t.sprawl + 50) / 100 * n
	}
	for r, a := range upkeep {
		budget[r] += min(0, net[r]-a*n) - min(0, net[r])
		net[r] -= a * n
	}
	ok = true
	for _, m := range []map[string]int{cost, upkeep} {
		for r := range m {
			ok = ok && budget[r] >= 0
		}
	}
	return budget, net, ok
}

func (t *turn) affords(cost, upkeep map[string]int, n int) bool {
	_, _, ok := t.after(cost, upkeep, n)
	return ok
}

func (t *turn) pay(cost, upkeep map[string]int, n int) { t.budget, t.net, _ = t.after(cost, upkeep, n) }

// paid is t as the next Payday leaves it: what it can save for. Payday
// stops at the Stockpile cap, so nothing costing more than the cap less the
// reserve is ever saved for.
func (t *turn) paid() *turn {
	p := *t
	p.budget = maps.Clone(t.budget)
	caps := t.v.Economy.Caps
	for r, a := range t.net {
		p.budget[r] = min(p.budget[r]+max(0, a), caps[r]-caps[r]*t.reserve/100)
	}
	return &p
}

// exchange trades a Resource near its cap into one running short, down to
// three quarters of the cap: one trade a think.
func (b *Bot) exchange(t *turn) *Command {
	e := t.v.Economy
	for _, x := range b.c.Rulesets[game.RulesetID].Exchange {
		give, get := string(x.Give), string(x.Get)
		if e.Resources[give] < e.Caps[give]*9/10 || e.Resources[get] >= e.Caps[get]/4 {
			continue
		}
		lots := min((e.Resources[give]-e.Caps[give]*3/4)/x.GiveAmount, (e.Caps[get]-e.Resources[get])/x.GetAmount)
		if lots <= 0 {
			continue
		}
		t.budget[give] -= lots * x.GiveAmount
		t.budget[get] += lots * x.GetAmount
		return b.command(wire.OpExchange, &wire.ExchangeT{Seq: b.nextSeq(), Give: give, Get: get, Amount: int32(lots * x.GiveAmount)})
	}
	return nil
}

// build is a building to queue, and where.
type build struct {
	planet game.PlanetView
	slot   int
	id     string // "" for none
}

func slotKey(planet string, slot int) string { return fmt.Sprintf("%s/%d", planet, slot) }

// free is p's first free Building Slot, or -1.
func (t *turn) free(p game.PlanetView) int {
	for s, have := range p.Buildings {
		if have == "" && t.queued[slotKey(p.ID, s)] == "" && !slices.ContainsFunc(p.Queue, func(q game.QueueItem) bool { return q.Slot == s }) {
			return s
		}
	}
	return -1
}

// buildable is the Bot's buildings that fit, unlocked and affordable.
func (b *Bot) buildable(t *turn, fits func(cs.Building) bool) []string {
	var out []string
	for _, id := range slices.Sorted(maps.Keys(b.c.Buildings)) {
		x := b.c.Buildings[id]
		if string(x.Faction) == b.faction && fits(x) && t.affords(x.Cost, x.Upkeep, 1) && unlocked(b.c, t.held, id, false) {
			out = append(out, id)
		}
	}
	return out
}

// place is the own Planet with a free Building Slot that scores highest,
// and its score; slot is -1 if none scores above -Inf.
func (t *turn) place(score func(game.PlanetView) float64) (planet game.PlanetView, slot int, best float64) {
	slot, best = -1, math.Inf(-1)
	for _, p := range t.mine {
		if s := t.free(p); s >= 0 {
			if v := score(p); v > best {
				planet, slot, best = p, s, v
			}
		}
	}
	return planet, slot, best
}

// trainerToBuild is the production building whose units score best, on
// the own Planet nearest the front.
func (b *Bot) trainerToBuild(t *turn) build {
	best, out := 0.0, build{}
	for _, id := range b.buildable(t, func(x cs.Building) bool { return len(x.Trains) > 0 }) {
		for _, u := range b.c.Buildings[id].Trains {
			if v := b.unitScore(t, string(u)); v > best && unlocked(b.c, t.held, string(u), true) {
				best, out.id = v, id
			}
		}
	}
	if out.id == "" {
		return build{}
	}
	if out.planet, out.slot, _ = t.place(func(p game.PlanetView) float64 { return -float64(t.dist(p.ID)) }); out.slot < 0 {
		return build{}
	}
	return out
}

// economyToBuild is the economy building worth most a Payday for its cost,
// and where: extractors by Richness, the rest on the safest Planet. A
// Resource counts for more the further it is below its cap.
func (b *Bot) economyToBuild(t *turn) build {
	e := t.v.Economy
	need := func(r string) float64 {
		if e.Caps[r] == 0 {
			return 1
		}
		return max(0.5, 1.5-float64(e.Resources[r])/float64(e.Caps[r]))
	}
	worth := func(m map[string]int) float64 {
		v := 0.0
		for r, a := range m {
			v += float64(a) * need(r)
		}
		return v
	}
	payday := float64(b.c.Rulesets[game.RulesetID].PaydaySeconds)
	isEconomy := func(x cs.Building) bool {
		return len(x.Trains) == 0 && x.TechSlots == nil &&
			(len(x.Extracts) > 0 || len(x.Yield) > 0 || x.Refines != nil || len(x.Storage) > 0 || x.Research != nil)
	}
	best, out := 0.0, build{}
	for _, id := range b.buildable(t, isEconomy) {
		x := b.c.Buildings[id]
		base := worth(x.Yield) - worth(x.Upkeep)
		if x.Research != nil {
			base += float64(*x.Research) * payday * researchWorth
		}
		if x.Refines != nil && covers(t.net, x.Refines.Input) {
			base += worth(x.Refines.Output) - worth(x.Refines.Input)
		}
		for r, a := range x.Storage {
			if e.Resources[r] >= e.Caps[r]*4/5 {
				base += float64(a) / 4
			}
		}
		p, s, v := t.place(func(p game.PlanetView) float64 {
			v := base
			for r, a := range x.Extracts {
				v += float64(a) * richness[p.Richness[r]] * need(r)
			}
			if v <= 0 {
				return math.Inf(-1)
			}
			return v + float64(t.dist(p.ID))/1000 // a tie goes to the safer
		})
		if v /= float64(max(1, sum(x.Cost))); s >= 0 && v > best {
			best, out = v, build{p, s, id}
		}
	}
	return out
}

// covers reports whether net has at least each amount of m.
func covers(net, m map[string]int) bool {
	for r, a := range m {
		if net[r] < a {
			return false
		}
	}
	return true
}

// labToBuild is a Lab on the own Planet with the fewest, safest first,
// under the Ruleset's limit per Planet.
func (b *Bot) labToBuild(t *turn) build {
	isLab := func(x cs.Building) bool { return x.TechSlots != nil }
	ids := b.buildable(t, isLab)
	if len(ids) == 0 {
		return build{}
	}
	limit := b.c.Rulesets[game.RulesetID].Tech.LabsPerPlanet
	p, s, _ := t.place(func(p game.PlanetView) float64 {
		n := 0
		for i, id := range p.Buildings {
			if isLab(b.c.Buildings[id]) || isLab(b.c.Buildings[t.queued[slotKey(p.ID, i)]]) {
				n++
			}
		}
		for _, q := range p.Queue {
			if isLab(b.c.Buildings[q.Building]) {
				n++
			}
		}
		if n >= limit {
			return math.Inf(-1)
		}
		return -1000*float64(n) + float64(t.dist(p.ID))
	})
	if s < 0 {
		return build{}
	}
	return build{p, s, ids[0]}
}

func (b *Bot) queue(t *turn, x build) *Command {
	if x.id == "" {
		return nil
	}
	bd := b.c.Buildings[x.id]
	t.pay(bd.Cost, bd.Upkeep, 1)
	t.queued[slotKey(x.planet.ID, x.slot)] = x.id
	return b.command(wire.OpQueueBuilding, &wire.QueueBuildingT{Seq: b.nextSeq(), Planet: x.planet.ID, Slot: byte(x.slot), Building: x.id})
}

func (b *Bot) buildTrainer(t *turn, _ goal) *Command { return b.queue(t, b.trainerToBuild(t)) }
func (b *Bot) buildEconomy(t *turn, _ goal) *Command { return b.queue(t, b.economyToBuild(t)) }
func (b *Bot) buildLab(t *turn, _ goal) *Command     { return b.queue(t, b.labToBuild(t)) }

// tierWorth is what an Advantage tier makes a unit worth against a Unit
// Class; one missing from tiers is normal.
var tierWorth = map[cs.CombatTiersValue]float64{"": 1, "normal": 1, "advantage": 1.5, "disadvantage": 0.6, "none": 0}

// matchup is what a combatant's tiers make it worth against these
// numbers of each Unit Class: 1 against none.
func matchup(cb *cs.Combat, classes map[string]int) float64 {
	f, n := 0.0, 0
	for class, k := range classes {
		f += tierWorth[cb.Tiers[class]] * float64(k)
		n += k
	}
	if n == 0 {
		return 1
	}
	return f / float64(n)
}

// unitScore is a unit's strength per cost, by its tiers against the enemy
// units seen.
func (b *Bot) unitScore(t *turn, id string) float64 {
	u := b.c.Units[id]
	return strengthOf(&u.Combat) * matchup(&u.Combat, t.foes) / float64(max(1, sum(u.Cost)))
}

// trainAt is a unit an own production building can train now.
type trainAt struct {
	planet string
	slot   int
	unit   string
}

func (b *Bot) trainers(t *turn) []trainAt {
	var out []trainAt
	for _, p := range t.mine {
		for s, bid := range p.Buildings {
			for _, u := range b.c.Buildings[bid].Trains {
				if unlocked(b.c, t.held, string(u), true) {
					out = append(out, trainAt{p.ID, s, string(u)})
				}
			}
		}
	}
	return out
}

// room is how many more of a unit its MaxCount allows.
func (t *turn) room(u cs.Unit, id string) int {
	if u.MaxCount == nil {
		return math.MaxInt
	}
	return *u.MaxCount - t.units[id]
}

// train queues up to 5 of one unit at the production building nearest the
// front: the best by Advantage, or on a fixed mix each trainable unit in turn.
func (b *Bot) train(t *turn, _ goal) *Command {
	opts := slices.DeleteFunc(b.trainers(t), func(o trainAt) bool {
		u := b.c.Units[o.unit]
		return t.room(u, o.unit) <= 0 || !t.affords(u.Cost, u.Upkeep, 1)
	})
	if len(opts) == 0 {
		return nil
	}
	var unit string
	if b.Difficulty.UnitChoice == cs.BotDifficultyUnitChoiceFixed {
		var units []string
		for _, o := range opts {
			units = append(units, o.unit)
		}
		slices.Sort(units)
		units = slices.Compact(units)
		unit = units[b.mix%len(units)]
	} else {
		best := -1.0
		for _, o := range opts {
			if v := b.unitScore(t, o.unit); v > best {
				best, unit = v, o.unit
			}
		}
	}
	opts = slices.DeleteFunc(opts, func(o trainAt) bool { return o.unit != unit })
	at := slices.MinFunc(opts, func(x, y trainAt) int { return t.dist(x.planet) - t.dist(y.planet) })
	u := b.c.Units[unit]
	n := 0
	for n < 5 && n < t.room(u, unit) && t.cp >= u.CommandPoints && t.affords(u.Cost, u.Upkeep, 1) {
		t.pay(u.Cost, u.Upkeep, 1)
		t.cp -= u.CommandPoints
		n++
	}
	if n == 0 {
		return nil
	}
	b.mix++ // only once trained, so a failed turn isn't skipped
	t.units[unit] += n
	return b.command(wire.OpQueueUnit, &wire.QueueUnitT{Seq: b.nextSeq(), Planet: at.planet, Slot: byte(at.slot), Unit: unit, Count: uint16(n)})
}

// cards are the Techs the Bot can start now: its hand, then the saved
// ones whose requirements it still has (the server refuses the rest).
func (b *Bot) cards(t *turn) []string {
	out := slices.Clone(t.v.Research.Hand)
	for _, s := range t.v.Research.Saved {
		if b.requirementsMet(t, s.Tech) {
			out = append(out, s.Tech)
		}
	}
	return out
}

// requirementsMet mirrors the server's: every Tech it requires held, and
// every building it requires standing on an own Planet.
func (b *Bot) requirementsMet(t *turn, tech string) bool {
	r := b.c.Techs[tech].Requires
	if r == nil {
		return true
	}
	for _, id := range r.Techs {
		if !t.held[string(id)] {
			return false
		}
	}
	for _, id := range r.Buildings {
		if !slices.ContainsFunc(t.v.Planets, func(p game.PlanetView) bool {
			return p.Owner == t.v.You && slices.Contains(p.Buildings, string(id))
		}) {
			return false
		}
	}
	return true
}

// card is the Tech to research: the first on offer, or the one that serves
// its top goals best, saved cards a half more, since a Resume keeps its
// progress and a Recover costs half.
func (b *Bot) card(t *turn) string {
	cards := b.cards(t)
	if len(cards) == 0 {
		return ""
	}
	if b.Difficulty.Research == cs.BotDifficultyResearchFirst {
		return cards[0]
	}
	best, out := -1.0, ""
	for i, id := range cards {
		v := b.cardScore(t, id)
		if i >= len(t.v.Research.Hand) {
			v *= 1.5
		}
		if v > best {
			best, out = v, id
		}
	}
	return out
}

// cardScore is how much a Tech serves the Bot's top goals: combat effects
// its Army goal, the rest its Economy goal, an unlock whichever it's for. A
// unit unlock counts only if that unit would beat what it trains now.
func (b *Bot) cardScore(t *turn, id string) float64 {
	tech := b.c.Techs[id]
	v := 0.1 // something to research beats nothing
	for _, e := range tech.Effects {
		switch e.Stat {
		case cs.EffectStatArmor, cs.EffectStatDamage, cs.EffectStatHp, cs.EffectStatShield, cs.EffectStatCommandPoints:
			v += t.top[army]
		default:
			v += t.top[economy]
		}
	}
	if u := tech.Unlocks; u != nil {
		now := 0.0
		for _, o := range b.trainers(t) {
			now = max(now, b.unitScore(t, o.unit))
		}
		for _, id := range u.Units {
			if string(b.c.Units[string(id)].Faction) == b.faction && b.unitScore(t, string(id)) > now {
				v += t.top[army]
			}
		}
		for _, id := range u.Buildings {
			if x := b.c.Buildings[string(id)]; string(x.Faction) == b.faction && len(x.Trains) == 0 {
				v += t.top[economy]
			}
		}
	}
	return v
}

// lab is the own Lab with the most free Tech Slots, on the safest Planet
// for a tie.
func (b *Bot) lab(t *turn) (planet string, slot int, ok bool) {
	bestFree, bestDist := 0, -1
	for _, p := range t.mine {
		for s, bid := range p.Buildings {
			n := b.c.Buildings[bid].TechSlots
			if n == nil {
				continue
			}
			free := *n - len(p.Labs[s])
			for _, pr := range t.v.Research.Projects {
				if pr.Planet == p.ID && pr.Slot == s {
					free--
				}
			}
			if d := t.dist(p.ID); free > bestFree || free == bestFree && free > 0 && d > bestDist {
				planet, slot, ok, bestFree, bestDist = p.ID, s, true, free, d
			}
		}
	}
	return planet, slot, ok
}

func (b *Bot) startProject(t *turn, _ goal) *Command {
	planet, slot, ok := b.lab(t)
	tech := b.card(t)
	if !ok || tech == "" {
		return nil
	}
	return b.command(wire.OpStartProject, &wire.StartProjectT{Seq: b.nextSeq(), Tech: tech, Planet: planet, Slot: byte(slot)})
}
