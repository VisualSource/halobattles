package bot

import (
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
	hasProduction   facts = 1 << iota // a building that trains units, standing or being built
	canBuildTrainer                   // a free Building Slot and a production building it can afford
	canBuildEconomy                   // a free Building Slot and an economy building worth its cost
	canBuildLab                       // a free Building Slot for a Lab it can afford
	strongEnough                      // a force strong enough for the target, at margin
	spareUnits                        // units on another Planet to send
	hasCard                           // a Tech on offer it can start
	freeLab                           // a Project slot, and a Lab with a free Tech Slot, standing or being built
	armySent                          // goals:
	garrisoned
	economyQueued
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
	{"buildEconomy", canBuildEconomy, economyQueued, 2, (*Bot).buildEconomy},
	{"buildLab", canBuildLab, freeLab, 2, (*Bot).buildLab},
	{"startProject", hasCard | freeLab, projectStarted, 1, (*Bot).startProject},
}

var goalFact = [...]facts{expand: armySent, attack: armySent, defend: garrisoned, economy: economyQueued, army: unitsQueued, research: projectStarted}

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
// Bot's own Planets and the enemies it has seen look like.
type turn struct {
	v       game.View
	budget  map[string]int // Resources over the reserve and the next Payday's shortfall, less this think's spending
	net     map[string]int // what the next Payday changes, with this think's Upkeep
	sprawl  int            // the percent every cost is charged at
	reserve int            // the percent of each cap kept back
	held    map[string]bool
	mine    []game.PlanetView // own Planets, by id
	queued  map[string]string // "planet/slot" taken by this think's builds, to the building
	cp      int               // Command Points left
	front   map[string]int    // Lane jumps from each Planet to the nearest one not the Bot's
	foes    map[string]int    // enemy units seen, by Unit Class
	units   map[string]int    // own units, from queue to death, by id
	top     [len(goalNames)]float64
}

func (b *Bot) newTurn(v game.View) *turn {
	e := v.Economy
	t := &turn{v: v, budget: map[string]int{}, net: map[string]int{}, held: held(v), queued: map[string]string{},
		cp: e.CommandPointsCap - e.CommandPointsUsed, foes: map[string]int{}, units: map[string]int{}, reserve: b.Difficulty.ReservePercent}
	maps.Copy(t.net, e.Projected)
	for r, a := range e.Resources {
		t.budget[r] = a - e.Caps[r]*t.reserve/100 + min(0, t.net[r])
	}
	own := map[string]bool{}
	for _, p := range v.Planets {
		if p.Owner != v.You {
			continue
		}
		own[p.ID] = true
		if !p.Locked {
			t.mine = append(t.mine, p)
		}
		for _, st := range p.Stacks {
			for _, u := range st {
				t.units[u.Unit] += u.Count
			}
		}
		for _, q := range p.UnitQueue {
			t.units[q.Unit]++
		}
	}
	sp := b.c.Rulesets[game.RulesetID].Sprawl
	// shortcut: leaves out Techs that raise freePlanets, so it can overrate a cost by one Planet's percent; read it from the View if that matters.
	t.sprawl = 100 + max(0, len(own)-sp.FreePlanets)*sp.Percent
	for _, a := range v.Armies {
		for _, u := range a.Units {
			if a.Owner == v.You {
				t.units[u.Unit] += u.Count
			} else {
				t.foes[string(b.c.Units[u.Unit].Combat.UnitClass)] += u.Count
			}
		}
	}
	for _, s := range b.seen {
		if s.planet.Owner == v.You {
			continue
		}
		for _, st := range s.planet.Stacks {
			for _, u := range st {
				t.foes[string(b.c.Units[u.Unit].Combat.UnitClass)] += u.Count
			}
		}
	}
	var others []string
	for _, mp := range b.c.Maps[v.Map].Planets {
		if !own[string(mp.ID)] {
			others = append(others, string(mp.ID))
		}
	}
	t.front = b.distances(v.Map, others)
	return t
}

// dist is a Planet's Lane jumps to the front; one cut off from it is far.
func (t *turn) dist(id string) int {
	if d, ok := t.front[id]; ok {
		return min(d, 99)
	}
	return 99
}

// facts is what holds now, for g.
func (b *Bot) facts(t *turn, g goal) facts {
	var f facts
	trains := func(x cs.Building) bool { return len(x.Trains) > 0 }
	isLab := func(x cs.Building) bool { return x.TechSlots != nil }
	if len(b.trainers(t)) > 0 || b.coming(t, trains) {
		f |= hasProduction // one being built counts: train waits for it rather than another being queued
	}
	if b.trainerToBuild(t).id != "" {
		f |= canBuildTrainer
	}
	if b.economyToBuild(t).id != "" {
		f |= canBuildEconomy
	}
	if b.labToBuild(t).id != "" {
		f |= canBuildLab
	}
	if from := b.strongest(t, ""); from != nil && g.target != "" &&
		stacksStrength(b.c, *from) >= b.estimate(t.v, g.target)*b.Difficulty.AttackMargin {
		f |= strongEnough
	}
	if from := b.strongest(t, g.target); from != nil && stacksStrength(b.c, *from) > 0 {
		f |= spareUnits
	}
	if len(b.cards(t)) > 0 {
		f |= hasCard
	}
	if _, _, ok := b.lab(t); (ok || b.coming(t, isLab)) && len(t.v.Research.Projects) < t.v.Research.Limit {
		f |= freeLab
	}
	return f
}

// coming reports whether a building that fits is being built on an own
// Planet, or was queued this think.
func (b *Bot) coming(t *turn, fits func(cs.Building) bool) bool {
	for _, p := range t.mine {
		for _, q := range p.Queue {
			if q.Building != "" && fits(b.c.Buildings[q.Building]) {
				return true
			}
		}
	}
	for _, id := range t.queued {
		if fits(b.c.Buildings[id]) {
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

// shortcut: sendTo sends the strongest other Planet's whole garrison; #45
// replaces it with home guards, staging and the attack margin.

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
