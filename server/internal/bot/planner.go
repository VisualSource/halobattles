package bot

import (
	"fmt"
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// The planner: a depth-capped search over abstract facts for the cheapest
// actions that reach a goal. Only the first action is sent; the next think
// plans again from the new View. See docs/specs/bot-spec.md#planning.

type facts uint16

const (
	hasProduction   facts = 1 << iota // a building that trains units
	canBuildTrainer                   // a free Building Slot and a production building it can afford
	canBuildMine                      // a free Building Slot and an extractor it can afford
	strongEnough                      // a force strong enough for the target, at margin
	spareUnits                        // units on another Planet to send
	hasCard                           // a Tech on offer
	freeLab                           // a Project slot and a Lab with a free Tech Slot
	armySent                          // goals:
	garrisoned
	mineQueued
	unitsQueued
	projectStarted
)

// action is one step a plan can take: needs its pre facts, gives its add
// facts, and issue turns it into a command, or nil if it can't now.
type action struct {
	name  string
	pre   facts
	add   facts
	cost  int
	issue func(b *Bot, t *turn, g goal) *Command
}

var actions = []action{
	{"buildTrainer", canBuildTrainer, hasProduction, 3, (*Bot).buildTrainer},
	{"train", hasProduction, unitsQueued | strongEnough | garrisoned, 2, (*Bot).train},
	{"sendArmy", strongEnough, armySent, 1, (*Bot).sendTo},
	{"reinforce", spareUnits, garrisoned, 1, (*Bot).sendTo},
	{"buildMine", canBuildMine, mineQueued, 2, (*Bot).buildMine},
	{"startProject", hasCard | freeLab, projectStarted, 1, (*Bot).startProject},
}

var goalFact = [...]facts{expand: armySent, attack: armySent, defend: garrisoned, economy: mineQueued, army: unitsQueued, research: projectStarted}

// plan finds the cheapest sequence of at most depth actions from now to
// want, and returns its first action, or nil if there's none or want holds.
func plan(now, want facts, depth int) *action {
	type node struct {
		state facts
		first *action
		cost  int
		steps int
	}
	open := []node{{state: now}}
	best := map[facts]int{now: 0}
	for len(open) > 0 {
		slices.SortStableFunc(open, func(x, y node) int { return x.cost - y.cost })
		n := open[0]
		open = open[1:]
		if n.state&want == want {
			return n.first
		}
		if n.steps == depth {
			continue
		}
		for i := range actions {
			a := &actions[i]
			if n.state&a.pre != a.pre {
				continue
			}
			next := node{state: n.state | a.add, first: n.first, cost: n.cost + a.cost, steps: n.steps + 1}
			if next.first == nil {
				next.first = a
			}
			if c, ok := best[next.state]; ok && c <= next.cost {
				continue
			}
			best[next.state] = next.cost
			open = append(open, next)
		}
	}
	return nil
}

// turn is one think's working state: what's left to spend, and what the
// Bot's own Planets look like.
type turn struct {
	v      game.View
	budget map[string]int // Resources over the reserve, less what this think spent
	held   map[string]bool
	mine   []game.PlanetView // own Planets, by id
	queued map[string]string // "planet/slot" taken by this think's builds, to the building
	cp     int               // Command Points left
}

func (b *Bot) newTurn(v game.View) *turn {
	t := &turn{v: v, budget: map[string]int{}, held: held(v), queued: map[string]string{},
		cp: v.Economy.CommandPointsCap - v.Economy.CommandPointsUsed}
	for r, a := range v.Economy.Resources {
		t.budget[r] = a - v.Economy.Caps[r]*b.Difficulty.ReservePercent/100
	}
	for _, p := range v.Planets {
		if p.Owner == v.You && !p.Locked {
			t.mine = append(t.mine, p)
		}
	}
	return t
}

func (t *turn) affords(cost map[string]int) bool {
	for r, a := range cost {
		if t.budget[r] < a {
			return false
		}
	}
	return true
}

func (t *turn) spend(cost map[string]int, n int) {
	for r, a := range cost {
		t.budget[r] -= a * n
	}
}

// facts is what holds now, for g.
func (b *Bot) facts(t *turn, g goal) facts {
	var f facts
	if _, _, u := b.trainer(t); u != "" || b.trainerComing(t) {
		f |= hasProduction // one being built counts: train waits for it rather than another being queued
	}
	if _, _, id := b.building(t, func(x cs.Building) bool { return len(x.Trains) > 0 }); id != "" {
		f |= canBuildTrainer
	}
	if _, _, id := b.building(t, func(x cs.Building) bool { return len(x.Extracts) > 0 }); id != "" {
		f |= canBuildMine
	}
	if from := b.strongest(t, ""); from != nil && g.target != "" &&
		stacksStrength(b.c, *from) >= b.estimate(t.v, g.target)*b.Difficulty.AttackMargin {
		f |= strongEnough
	}
	if from := b.strongest(t, g.target); from != nil && stacksStrength(b.c, *from) > 0 {
		f |= spareUnits
	}
	if len(t.v.Research.Hand)+len(t.v.Research.Saved) > 0 {
		f |= hasCard
	}
	if _, _, ok := b.lab(t); ok && len(t.v.Research.Projects) < t.v.Research.Limit {
		f |= freeLab
	}
	return f
}

// shortcut: the actions below make the simplest valid choice (first
// building, first unit, the strongest Planet's whole garrison); #44 and #45
// replace them with placement, unit choice, home guards and staging.

// building finds an own Planet with a free Building Slot and an affordable,
// unlocked building of the Bot's Faction that fits.
func (b *Bot) building(t *turn, fits func(cs.Building) bool) (planet game.PlanetView, slot int, id string) {
	for _, bid := range slices.Sorted(maps.Keys(b.c.Buildings)) {
		x := b.c.Buildings[bid]
		if string(x.Faction) != b.faction || !fits(x) || !t.affords(x.Cost) || !unlocked(b.c, t.held, bid, false) {
			continue
		}
		for _, p := range t.mine {
			for s, have := range p.Buildings {
				key := fmt.Sprintf("%s/%d", p.ID, s)
				if have == "" && t.queued[key] == "" && !slices.ContainsFunc(p.Queue, func(q game.QueueItem) bool { return q.Slot == s }) {
					return p, s, bid
				}
			}
		}
	}
	return game.PlanetView{}, 0, ""
}

// trainer finds an own production building and a unit it can train now.
func (b *Bot) trainer(t *turn) (planet game.PlanetView, slot int, unit string) {
	for _, p := range t.mine {
		for s, bid := range p.Buildings {
			for _, u := range b.c.Buildings[bid].Trains {
				if unlocked(b.c, t.held, string(u), true) {
					return p, s, string(u)
				}
			}
		}
	}
	return game.PlanetView{}, 0, ""
}

// trainerComing reports whether a production building is being built on
// an own Planet, or was queued this think.
func (b *Bot) trainerComing(t *turn) bool {
	for _, p := range t.mine {
		for _, q := range p.Queue {
			if len(b.c.Buildings[q.Building].Trains) > 0 {
				return true
			}
		}
	}
	for _, id := range t.queued {
		if len(b.c.Buildings[id].Trains) > 0 {
			return true
		}
	}
	return false
}

// strongest is the own Planet with the most strength in its Stacks, other
// than except.
func (b *Bot) strongest(t *turn, except string) *game.PlanetView {
	var best *game.PlanetView
	for i, p := range t.mine {
		if p.ID != except && (best == nil || stacksStrength(b.c, p) > stacksStrength(b.c, *best)) {
			best = &t.mine[i]
		}
	}
	return best
}

// lab finds an own Lab with a free Tech Slot.
func (b *Bot) lab(t *turn) (planet string, slot int, ok bool) {
	for _, p := range t.mine {
		for s, bid := range p.Buildings {
			n := b.c.Buildings[bid].TechSlots
			if n == nil {
				continue
			}
			used := len(p.Labs[s])
			for _, pr := range t.v.Research.Projects {
				if pr.Planet == p.ID && pr.Slot == s {
					used++
				}
			}
			if used < *n {
				return p.ID, s, true
			}
		}
	}
	return "", 0, false
}

func (b *Bot) buildOne(t *turn, fits func(cs.Building) bool) *Command {
	p, s, id := b.building(t, fits)
	if id == "" {
		return nil
	}
	t.spend(b.c.Buildings[id].Cost, 1)
	t.queued[fmt.Sprintf("%s/%d", p.ID, s)] = id
	return b.command(wire.OpQueueBuilding, &wire.QueueBuildingT{Seq: b.nextSeq(), Planet: p.ID, Slot: byte(s), Building: id})
}

func (b *Bot) buildTrainer(t *turn, _ goal) *Command {
	return b.buildOne(t, func(x cs.Building) bool { return len(x.Trains) > 0 })
}

func (b *Bot) buildMine(t *turn, _ goal) *Command {
	return b.buildOne(t, func(x cs.Building) bool { return len(x.Extracts) > 0 })
}

func (b *Bot) train(t *turn, _ goal) *Command {
	p, s, id := b.trainer(t)
	if id == "" {
		return nil
	}
	u := b.c.Units[id]
	n := 0
	for n < 5 && t.affords(u.Cost) && t.cp >= u.CommandPoints {
		t.spend(u.Cost, 1)
		t.cp -= u.CommandPoints
		n++
	}
	if n == 0 {
		return nil
	}
	return b.command(wire.OpQueueUnit, &wire.QueueUnitT{Seq: b.nextSeq(), Planet: p.ID, Slot: byte(s), Unit: id, Count: uint16(n)})
}

// sendTo sends the strongest other Planet's whole garrison to the goal's:
// an attack, or reinforcements.
func (b *Bot) sendTo(t *turn, g goal) *Command {
	from, to := b.strongest(t, g.target), g.target
	if from == nil {
		return nil
	}
	var units []*wire.ArmyUnitsT
	for s, st := range from.Stacks {
		for _, u := range st {
			units = append(units, &wire.ArmyUnitsT{Stack: byte(s), Unit: u.Unit, Count: uint32(u.Count)})
		}
	}
	if len(units) == 0 {
		return nil
	}
	from.Stacks = [game.StacksPerPlanet]game.Stack{} // gone: no later goal this think sends them again
	return b.command(wire.OpOrderArmy, &wire.OrderArmyT{Seq: b.nextSeq(), FromPlanet: from.ID, Units: units, ToPlanet: to})
}

func (b *Bot) startProject(t *turn, _ goal) *Command {
	planet, slot, ok := b.lab(t)
	if !ok {
		return nil
	}
	tech := ""
	if len(t.v.Research.Saved) > 0 {
		tech = t.v.Research.Saved[0].Tech // a guaranteed card: progress kept, or half cost
	} else if len(t.v.Research.Hand) > 0 {
		tech = t.v.Research.Hand[0]
	}
	if tech == "" {
		return nil
	}
	return b.command(wire.OpStartProject, &wire.StartProjectT{Seq: b.nextSeq(), Tech: tech, Planet: planet, Slot: byte(slot)})
}
