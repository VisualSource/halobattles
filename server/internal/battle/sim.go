package battle

import (
	"cmp"
	"errors"
	"math"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// TicksPerSecond is the sim's step rate: one step per match tick.
const TicksPerSecond = 5

// Side is one of a Battle's two sides.
type Side int

const (
	Attacker Side = iota
	Defender
	NoSide Side = -1 // a build pad nobody holds
)

// Slot is a Unit Slot going into a Battle: Cell is its place in its Stack's
// 3 × 5 grid, which sets its place in the formation.
type Slot struct {
	Unit  string
	Count int
	Cell  int
}

// Force is what one side brings: formations of Unit Slots (a Stack each, or
// an Army's slots 15 at a time) and, for the defender, its buildings by
// Building Slot ("" is empty).
type Force struct {
	Formations [][]Slot
	Buildings  []string
	// Boosts are the side's Tech effects, by unit or building id, fixed for
	// the Battle; pad turrets built later get them too.
	Boosts map[string]Boost
}

// Boost is what Tech effects add to a unit's or building's combat stats.
type Boost struct{ Shield, Armor, HP, Damage Mod }

// Mod is a percentage and a flat amount, the percentage applied first.
type Mod struct{ Percent, Amount int }

func (m Mod) apply(v float64) float64 { return v*float64(100+m.Percent)/100 + float64(m.Amount) }

// Squad is a Unit Slot or a building in a Battle: one token in one cell.
type Squad struct {
	ID       int // from 1, in the order squads were added; ids never repeat
	Side     Side
	Unit     string // a unit or building id
	Building bool
	Armed    bool // false for a building without a combat block: it never fires
	// Where it came from: its formation and slot cell, or for a building its
	// Building Slot in Slot.
	Formation, Slot int
	Cell            Cell
	Members         []Layers // the living members; Members[0] takes the hits
	Start           int      // members at the start
	Escaped         bool     // it Retreated off the field, keeping its Members
	OnPad           int      // a pad turret: its pad's index + 1; it isn't a Planet building

	class                  string
	air                    bool
	weapon                 Multipliers
	dice                   Dice
	boost                  Boost
	tiers                  map[string]string
	speed, reach, minRange float64
	sight                  float64
	fireTicks              int
	cooldown               int
	bank                   float64 // movement saved up toward the next cell
	path                   []Cell
	goal                   Cell
	target                 int // an ordered target's id, or 0
	blocked                int // ticks spent waiting for a cell
	retreating             bool
	roles                  []string // the unit's AI role hints: "scout", "skirmisher"
	exit                   int      // the edge it Retreats off: 0 top, 1 right, 2 bottom, 3 left
}

// alive is whether it's still on the field: it has members and hasn't
// Retreated off it.
func (sq *Squad) alive() bool { return len(sq.Members) > 0 && !sq.Escaped }

// Pad is a build pad: a spot whoever holds it can build a turret on. One
// with a turret can't change hands until the turret is destroyed.
type Pad struct {
	Cell     Cell
	Owner    Side // NoSide: nobody's
	Taker    Side
	Progress int    // ticks Taker has held it alone
	Turret   int    // the turret squad on it, or 0
	Building string // the turret under construction, or ""
	ReadyAt  int    // the tick it's built
}

// padStart is how near a Control Point, in cells, a pad starts as the
// defender's.
const padStart = 10

// Point is a Control Point. Taker has been in range alone for Progress ticks.
type Point struct {
	Cell     Cell
	Owner    Side
	Taker    Side
	Progress int
}

// Reasons a Battle ends.
const (
	Eliminated = "elimination"
	HeldPoints = "points"
	TimeUp     = "time"
	Retreated  = "retreat"
)

// Logged is a player's order and the tick it came in before, so a Battle can
// be re-simulated from its inputs.
type Logged struct {
	Tick  int
	Side  Side
	Order Order
}

// Sim is a running Battle. It's a pure function of its inputs: the same
// content, Field, forces, seed and orders give the same Battle.
type Sim struct {
	Field  *Field
	Squads []*Squad // by id; dead ones stay, with no Members
	Points []Point
	Pads   []Pad
	// Funds is what a side without an economy, a neutral garrison, has to
	// spend on pad turrets; nil for a player, who pays from their Resources.
	Funds  [2]map[string]int
	boosts [2]map[string]Boost // each side's Force.Boosts
	Edge   int                 // the attacker's edge: 0 top, 1 right, 2 bottom, 3 left
	Tick   int
	Hold   int // ticks the attacker has held enough points
	// HoldPaused: the attacker holds enough points, but a defender stands on
	// one, so the hold timer waits.
	HoldPaused bool
	Over       bool
	Winner     Side
	Reason     string
	// RetreatAt is the tick each side's Retreat countdown ends, or 0; once it
	// has, the side is Retreating and can't call it off.
	RetreatAt  [2]int
	Retreating [2]bool
	Log        []Logged // every player order, in order

	Controllers [2]Controller

	content     *cs.Content
	rules       cs.BattleRules
	toHit       int
	pathClass   string
	deployDepth int
	rng         *rand.Rand
	ground, air []int     // the squad id in each cell, or 0
	visible     [2][]bool // by squad id: what each side can see this tick
	costCache   map[string]costs
	main        []bool            // cells joined to the Control Points on foot
	reach       map[string][]bool // per Unit Class: cells it can walk to a Control Point from
}

// Each edge's inward direction, and the direction along it.
var (
	inward = [4]Cell{{0, 1}, {-1, 0}, {0, -1}, {1, 0}}
	along  = [4]Cell{{1, 0}, {0, 1}, {1, 0}, {0, 1}}
)

func (a Cell) add(b Cell) Cell   { return Cell{a.X + b.X, a.Y + b.Y} }
func (a Cell) scale(k int) Cell  { return Cell{a.X * k, a.Y * k} }
func dist(a, b Cell) float64     { return math.Sqrt(float64(dist2(a, b))) }
func ticks(seconds float64) int  { return int(math.Round(seconds * TicksPerSecond)) }
func (s *Sim) height(c Cell) int { return int(s.Field.Height[s.Field.index(c)]) }
func (s *Sim) layer(sq *Squad) []int {
	if sq.air {
		return s.air
	}
	return s.ground
}

// New deploys both sides on the Field. The defender holds every Control
// Point. A side with nothing that can fight has already lost: the Sim
// starts Over.
func New(c *cs.Content, rules cs.Ruleset, f *Field, attack, defend Force, seed uint64) *Sim {
	s := &Sim{
		Field: f, content: c, rules: rules.Battle, toHit: rules.ToHit, pathClass: string(rules.Battlefield.PathClass), deployDepth: rules.Battlefield.DeployDepth,
		rng: rand.New(rand.NewPCG(seed, 4)), ground: make([]int, f.W*f.H), air: make([]int, f.W*f.H),
		costCache: map[string]costs{}, reach: map[string][]bool{},
		boosts: [2]map[string]Boost{attack.Boosts, defend.Boosts},
	}
	foot := s.costsFor(s.pathClass)
	s.main = f.largestRegion(func(i int) bool { return foot[i] > 0 })
	for _, p := range f.Points {
		s.Points = append(s.Points, Point{Cell: p, Owner: Defender, Taker: Defender})
	}
	for _, c := range f.Pads {
		owner := NoSide
		if slices.ContainsFunc(f.Points, func(p Cell) bool { return dist(p, c) <= padStart }) {
			owner = Defender
		}
		s.Pads = append(s.Pads, Pad{Cell: c, Owner: owner, Taker: owner})
	}
	s.Edge = s.rng.IntN(4)
	in, side := inward[s.Edge], along[s.Edge]
	origin := [4]Cell{{f.W / 2, 0}, {f.W - 1, f.H / 2}, {f.W / 2, f.H - 1}, {0, f.H / 2}}[s.Edge]

	for k, form := range attack.Formations {
		centre := (2*k - (len(attack.Formations) - 1)) * 3 // formations 6 cells apart, centred on the edge
		for _, sl := range form {
			col, row := sl.Cell%5, sl.Cell/5
			want := origin.add(side.scale(centre + col - 2)).add(in.scale(max(0, rules.Battlefield.DeployDepth-1-row)))
			s.addUnit(Attacker, k, sl, want)
		}
	}
	for k, form := range defend.Formations {
		if len(f.Points) == 0 {
			break
		}
		p := f.Points[k%len(f.Points)]
		for _, sl := range form {
			col, row := sl.Cell%5, sl.Cell/5
			// The front row faces the attacker, which is against the inward direction.
			s.addUnit(Defender, k, sl, p.add(side.scale(col-2)).add(in.scale(row-1)))
		}
	}
	for slot, id := range defend.Buildings {
		if id == "" || len(f.Points) == 0 {
			continue
		}
		s.addBuilding(slot, id, f.Points[slot%len(f.Points)].add(in.scale(3)))
	}
	s.see()
	s.end() // nobody on one side: decided before it starts
	return s
}

func (s *Sim) addUnit(side Side, formation int, sl Slot, want Cell) {
	cb := s.content.Units[sl.Unit].Combat
	sq := &Squad{Side: side, Unit: sl.Unit, Armed: true, Formation: formation, Slot: sl.Cell}
	for _, r := range s.content.Units[sl.Unit].Roles {
		sq.roles = append(sq.roles, string(r))
	}
	s.stats(sq, &cb)
	sq.Members = make([]Layers, sl.Count)
	for i := range sq.Members {
		sq.Members[i] = sq.layers(&cb)
	}
	s.place(sq, want)
}

func (s *Sim) addBuilding(slot int, id string, want Cell) {
	sq := &Squad{Side: Defender, Unit: id, Building: true, Slot: slot}
	cb := s.content.Buildings[id].Combat
	if cb == nil {
		st := s.rules.Structure
		cb = &cs.Combat{UnitClass: st.UnitClass, Shield: st.Shield, Armor: st.Armor, Hp: st.Hp}
	} else {
		sq.Armed = true
	}
	s.stats(sq, cb)
	sq.speed = 0
	sq.Members = []Layers{sq.layers(cb)}
	s.place(sq, want)
}

// layers is a fresh member's Shield, Armor and HP, with its side's Boost.
func (sq *Squad) layers(cb *cs.Combat) Layers {
	b := sq.boost
	return Layers{b.Shield.apply(float64(cb.Shield)), b.Armor.apply(float64(cb.Armor)), b.HP.apply(float64(cb.Hp))}
}

// stats reads a squad's combat block, filling what it leaves out from its
// Unit Class defaults.
func (s *Sim) stats(sq *Squad, cb *cs.Combat) {
	def := s.rules.ClassDefaults[string(cb.UnitClass)]
	or := func(p *float64, d float64) float64 {
		if p != nil {
			return *p
		}
		return d
	}
	w := s.content.WeaponTypes[string(cb.WeaponType)]
	sq.class = string(cb.UnitClass)
	sq.air = s.content.UnitClasses[sq.class].Air != nil && *s.content.UnitClasses[sq.class].Air
	sq.weapon = Multipliers{w.Shield, w.Armor, w.Hp}
	sq.dice = parseDice(string(cb.Damage))
	sq.boost = s.boosts[sq.Side][sq.Unit]
	sq.tiers = map[string]string{}
	for class, t := range cb.Tiers {
		sq.tiers[class] = string(t)
	}
	sq.speed = or(cb.Speed, def.Speed)
	sq.reach = or(cb.Range, def.Range)
	sq.minRange = or(cb.MinRange, 0)
	sq.sight = or(cb.Sight, def.Sight)
	sq.fireTicks = max(1, ticks(or(cb.FireInterval, def.FireInterval)))
}

// place puts a squad in the free cell it can stand on nearest want, searching
// outward from it. Ground squads stay in the main region, so every one can
// reach the Control Points. A squad that can stand nowhere (its Unit Class
// can't enter any Terrain here) takes the nearest free cell anyway, so no
// unit is ever left out of a Battle.
func (s *Sim) place(sq *Squad, want Cell) {
	f := s.Field
	want = Cell{min(max(want.X, 0), f.W-1), min(max(want.Y, 0), f.H-1)}
	c := s.costsFor(sq.class)
	if sq.Building {
		c = s.costsFor(s.pathClass)
	}
	layer := s.layer(sq)
	reach := s.reachFor(sq.class)
	if sq.Building || !slices.Contains(reach, true) {
		reach = s.main // a class that can't reach any point, or a building: anywhere on foot
	}
	fits := func(i int) bool { return c[i] > 0 && (sq.air || reach[i]) }
	if !slices.ContainsFunc(layer, func(id int) bool { return id == 0 }) {
		return // shortcut: a map with every cell taken can't seat it; maps are thousands of cells
	}
	if !slices.ContainsFunc(c, func(v float64) bool { return v > 0 }) {
		fits = func(int) bool { return true }
	}
	seen := make([]bool, f.W*f.H)
	queue := []int{f.index(want)}
	seen[queue[0]] = true
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		if layer[i] == 0 && fits(i) {
			sq.ID = len(s.Squads) + 1
			sq.Cell = f.cell(i)
			sq.Start = len(sq.Members)
			layer[i] = sq.ID
			s.Squads = append(s.Squads, sq)
			return
		}
		at := f.cell(i)
		for _, d := range steps {
			n := at.add(d)
			if n.X >= 0 && n.Y >= 0 && n.X < f.W && n.Y < f.H && !seen[f.index(n)] {
				seen[f.index(n)] = true
				queue = append(queue, f.index(n))
			}
		}
	}
	// Its ground has no free cell left: stand anywhere free.
	for i, id := range layer {
		if id == 0 {
			sq.ID, sq.Cell, sq.Start = len(s.Squads)+1, f.cell(i), len(sq.Members)
			layer[i] = sq.ID
			s.Squads = append(s.Squads, sq)
			return
		}
	}
}

// reachFor marks the cells a Unit Class can walk to a Control Point from,
// so a squad never deploys in a pocket it can't leave, such as a vehicle
// ringed by forest.
func (s *Sim) reachFor(class string) []bool {
	if r, ok := s.reach[class]; ok {
		return r
	}
	f, c := s.Field, s.costsFor(class)
	r := make([]bool, f.W*f.H)
	var queue []int
	for _, p := range f.Points {
		if i := f.index(p); c[i] > 0 {
			r[i] = true
			queue = append(queue, i)
		}
	}
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		f.neighbours4(i, func(n int) {
			if !r[n] && c[n] > 0 {
				r[n] = true
				queue = append(queue, n)
			}
		})
	}
	s.reach[class] = r
	return r
}

// Step runs one tick: orders, movement, fire, Control Points, then the end
// checks. It returns the tick's volleys.
func (s *Sim) Step() []Volley {
	if s.Over {
		return nil
	}
	for side, ctl := range s.Controllers {
		if ctl != nil {
			for _, o := range ctl.Orders(View{s, Side(side)}) {
				s.apply(Side(side), o)
			}
		}
	}
	s.retreat()
	s.raiseTurrets()
	s.move()
	s.see()
	volleys := s.fire()
	s.capture()
	s.Tick++
	s.end()
	return volleys
}

func (s *Sim) squad(id int) *Squad {
	if id < 1 || id > len(s.Squads) {
		return nil
	}
	return s.Squads[id-1]
}

// Command carries out a player's order for side now, between ticks, and logs
// it. A player's order comes after the AI's for the tick, so it wins.
func (s *Sim) Command(side Side, o Order) {
	s.Log = append(s.Log, Logged{Tick: s.Tick, Side: side, Order: o})
	s.apply(side, o)
}

// apply carries out one order, ignoring any that isn't valid: not the
// side's squad, dead, Retreating, or a building told to move.
func (s *Sim) apply(side Side, o Order) {
	switch o.Kind {
	case Build:
		if s.CanBuild(side, o.Target, o.Building) != nil {
			return
		}
		if f := s.Funds[side]; f != nil {
			for r, n := range s.content.Buildings[o.Building].Cost {
				f[r] -= n
			}
		}
		p := &s.Pads[o.Target]
		p.Building, p.ReadyAt = o.Building, s.Tick+max(1, ticks(s.rules.PadBuildSeconds))
		return
	case Retreat:
		if s.RetreatAt[side] == 0 {
			s.RetreatAt[side] = s.Tick + max(1, ticks(s.rules.RetreatCountdown))
		}
		return
	case CancelRetreat:
		if !s.Retreating[side] {
			s.RetreatAt[side] = 0
		}
		return
	}
	sq := s.squad(o.Squad)
	if sq == nil || sq.Side != side || !sq.alive() || sq.retreating {
		return
	}
	switch o.Kind {
	case Move:
		if sq.speed == 0 || o.Cell.X < 0 || o.Cell.Y < 0 || o.Cell.X >= s.Field.W || o.Cell.Y >= s.Field.H {
			return
		}
		sq.goal, sq.blocked = o.Cell, 0
		sq.path = s.Field.path(s.costsFor(sq.class), sq.Cell, o.Cell, nil)
	case Attack:
		if t := s.squad(o.Target); t != nil && t.Side != side {
			sq.target = t.ID
		}
	case Hold:
		sq.path, sq.target = nil, 0
	}
}

func (s *Sim) relocate(sq *Squad, to Cell) {
	layer := s.layer(sq)
	layer[s.Field.index(sq.Cell)] = 0
	layer[s.Field.index(to)] = sq.ID
	sq.Cell = to
}

// What another squad in the way costs a re-route, on top of the Terrain:
// enough to go round a crowd, not so much that a long detour beats waiting
// for a gap. An enemy won't make way, so it costs more.
const (
	friendCost = 4
	enemyCost  = 8
)

// crowding is the extra cost of cells other squads stand on in layer.
func (s *Sim) crowding(side Side, layer []int) func(int) float64 {
	return func(i int) float64 {
		switch o := s.squad(layer[i]); {
		case o == nil:
			return 0
		case o.Side == side:
			return friendCost
		}
		return enemyCost
	}
}

// closeEnough is how near its goal, in cells, a squad stops when its way is
// blocked.
const closeEnough = 3

// move steps each squad along its path as far as its saved-up movement pays
// for. A squad waits for an occupied cell and finds a way round after a
// second, or stops if it's close enough to its goal.
func (s *Sim) move() {
	for _, sq := range s.Squads {
		if !sq.alive() || len(sq.path) == 0 {
			sq.bank = 0
			continue
		}
		c := s.costsFor(sq.class)
		layer := s.layer(sq)
		sq.bank += sq.speed / TicksPerSecond
		for len(sq.path) > 0 {
			next := sq.path[0]
			cost := s.Field.stepCost(c, sq.Cell, next)
			if cost == 0 {
				sq.path = nil
				break
			}
			if other := s.squad(layer[s.Field.index(next)]); other != nil {
				if s.swaps(sq, other, cost) {
					continue
				}
				if !sq.retreating && dist(sq.Cell, sq.goal) <= closeEnough {
					sq.path = nil // a crowd round the goal: this will do
					break
				}
				sq.bank = min(sq.bank, cost)
				if sq.blocked++; sq.blocked >= TicksPerSecond {
					sq.blocked = 0
					sq.path = s.Field.path(c, sq.Cell, sq.goal, s.crowding(sq.Side, layer))
				}
				break
			}
			if sq.bank < cost {
				break
			}
			sq.bank -= cost
			sq.blocked = 0
			s.relocate(sq, next)
			sq.path = sq.path[1:]
			if s.escapes(sq) {
				break
			}
		}
	}
}

// retreat starts each side's Retreat when its countdown runs out: every
// squad that can move stops firing and heads for its exit. Squads still on
// the way look for a way out again once a second.
func (s *Sim) retreat() {
	for side := range s.RetreatAt {
		if at := s.RetreatAt[side]; at != 0 && !s.Retreating[side] && s.Tick >= at {
			s.Retreating[side] = true
			for _, sq := range s.Squads {
				if sq.Side == Side(side) && sq.alive() && sq.speed > 0 {
					sq.retreating, sq.target = true, 0
					s.headOut(sq)
				}
			}
		}
	}
	for _, sq := range s.Squads {
		if sq.retreating && sq.alive() && len(sq.path) == 0 && (s.Tick+sq.ID)%TicksPerSecond == 0 {
			s.headOut(sq)
		}
	}
}

// depth is how many cells c is in from edge e.
func (s *Sim) depth(e int, c Cell) int {
	return [4]int{c.Y, s.Field.W - 1 - c.X, s.Field.H - 1 - c.Y, c.X}[e]
}

// headOut picks a squad's exit, the attacker's own edge or the nearest edge
// for the defender, and paths to the nearest cell it can stand on in that
// edge's deployment strip.
func (s *Sim) headOut(sq *Squad) {
	sq.exit = s.Edge
	if sq.Side == Defender {
		sq.exit = 0
		for e := 1; e < 4; e++ {
			if s.depth(e, sq.Cell) < s.depth(sq.exit, sq.Cell) {
				sq.exit = e
			}
		}
	}
	if s.escapes(sq) {
		return
	}
	f, c, reach := s.Field, s.costsFor(sq.class), s.reachFor(sq.class)
	best, found := Cell{}, false
	for i := range c {
		at := f.cell(i)
		if c[i] > 0 && (sq.air || reach[i]) && s.depth(sq.exit, at) < s.deployDepth &&
			(!found || dist2(sq.Cell, at) < dist2(sq.Cell, best)) {
			best, found = at, true
		}
	}
	if found {
		sq.goal, sq.blocked = best, 0
		sq.path = f.path(c, sq.Cell, best, nil)
	}
}

// escapes takes a Retreating squad off the field once it's in its exit's
// strip, and reports whether it did.
func (s *Sim) escapes(sq *Squad) bool {
	if !sq.retreating || s.depth(sq.exit, sq.Cell) >= s.deployDepth {
		return false
	}
	s.layer(sq)[s.Field.index(sq.Cell)] = 0
	sq.Escaped, sq.path = true, nil
	return true
}

// swaps trades places with an idle friendly squad in the way, if each can
// stand where the other is, so a squad parked in a gap can't block another
// for good.
func (s *Sim) swaps(sq, other *Squad, cost float64) bool {
	if other.Side != sq.Side || len(other.path) > 0 || other.speed == 0 || sq.bank < cost ||
		s.costsFor(other.class)[s.Field.index(sq.Cell)] == 0 {
		return false
	}
	layer := s.layer(sq)
	a, b := sq.Cell, other.Cell
	layer[s.Field.index(a)], layer[s.Field.index(b)] = other.ID, sq.ID
	sq.Cell, other.Cell = b, a
	sq.bank -= cost
	sq.blocked = 0
	sq.path = sq.path[1:]
	return true
}

// sightOf is how far a squad sees: its Sight, plus more per height level on
// the ground.
func (s *Sim) sightOf(sq *Squad) float64 {
	if sq.air {
		return sq.sight
	}
	return sq.sight + s.rules.HeightSight*float64(s.height(sq.Cell))
}

// see works out which squads each side can see: its own, and enemies within
// Sight of any of them.
func (s *Sim) see() {
	for side := range s.visible {
		vis := s.visible[side]
		if len(vis) != len(s.Squads)+1 {
			vis = make([]bool, len(s.Squads)+1)
		}
		clear(vis)
		for _, e := range s.Squads {
			if !e.alive() {
				continue
			}
			if e.Side == Side(side) {
				vis[e.ID] = true
				continue
			}
			for _, o := range s.Squads {
				if o.Side == Side(side) && o.alive() {
					if r := s.sightOf(o); float64(dist2(o.Cell, e.Cell)) <= r*r {
						vis[e.ID] = true
						break
					}
				}
			}
		}
		s.visible[side] = vis
	}
}

func (s *Sim) tier(actor, target *Squad) string {
	if t, ok := actor.tiers[target.class]; ok {
		return t
	}
	return Normal
}

func (s *Sim) canHit(actor, target *Squad) bool {
	if !target.alive() || target.Side == actor.Side || !s.visible[actor.Side][target.ID] || s.tier(actor, target) == None {
		return false
	}
	d := dist(actor.Cell, target.Cell)
	return d <= actor.reach && d >= actor.minRange
}

// targetOf is the ordered target if it can be hit, or else the visible enemy
// in range with the best tier, then the nearest, then the lowest id.
func (s *Sim) targetOf(sq *Squad) *Squad {
	if t := s.squad(sq.target); t != nil && s.canHit(sq, t) {
		return t
	}
	var best *Squad
	for _, t := range s.Squads {
		if !s.canHit(sq, t) {
			continue
		}
		if best == nil || cmp.Or(
			cmp.Compare(tierRank[s.tier(sq, t)], tierRank[s.tier(sq, best)]),
			cmp.Compare(dist2(sq.Cell, t.Cell), dist2(sq.Cell, best.Cell)),
		) < 0 {
			best = t // squads are in id order, so a tie keeps the lower id
		}
	}
	return best
}

// toHitMod is the To-hit modifier from terrain: the target's cover and the
// attacker's high ground. Neither counts if either one flies.
func (s *Sim) toHitMod(actor, target *Squad) int {
	if actor.air || target.air {
		return 0
	}
	mod := int(s.content.Terrains[s.Field.Terrains[s.Field.Terrain[s.Field.index(target.Cell)]]].Cover)
	if s.height(actor.Cell) > s.height(target.Cell) {
		mod += s.rules.HighGroundToHit
	}
	return mod
}

// Volley is one squad's fire in one tick: every living member's attack on
// one target squad, added up.
type Volley struct {
	Actor, Target              int
	Shots, Hits, Kills         int
	ShieldDmg, ArmorDmg, HPDmg float64
}

// fire lets every armed squad whose fire interval is up shoot. A squad
// killed earlier in the tick doesn't fire.
func (s *Sim) fire() []Volley {
	var out []Volley
	for _, sq := range s.Squads {
		if !sq.alive() || !sq.Armed || sq.retreating {
			continue
		}
		if sq.cooldown > 0 {
			sq.cooldown--
			continue
		}
		t := s.targetOf(sq)
		if t == nil {
			continue
		}
		tier, mod := s.tier(sq, t), s.toHitMod(sq, t)
		v := Volley{Actor: sq.ID, Target: t.ID}
		for range sq.Members {
			if !t.alive() {
				break
			}
			v.Shots++
			if rollWith(tier, func() int { return 1 + s.rng.IntN(20) })+mod < s.toHit {
				continue
			}
			v.Hits++
			roll := rollWith(tier, func() int { return sq.dice.roll(s.rng) })
			roll = int(math.Round(sq.boost.Damage.apply(float64(roll))))
			d := hit(sq.weapon, &t.Members[0], roll)
			v.ShieldDmg, v.ArmorDmg, v.HPDmg = v.ShieldDmg+d.Shield, v.ArmorDmg+d.Armor, v.HPDmg+d.HP
			if t.Members[0].HP <= 0 {
				t.Members = t.Members[1:]
				v.Kills++
			}
		}
		sq.cooldown = sq.fireTicks - 1
		out = append(out, v)
	}
	for _, sq := range s.Squads {
		if layer := s.layer(sq); !sq.alive() && layer[s.Field.index(sq.Cell)] == sq.ID {
			layer[s.Field.index(sq.Cell)] = 0
		}
	}
	return out
}

// capture updates each Control Point, then each build pad. One changes
// hands after one side alone has a ground squad in range for
// captureSeconds; a contested or empty one resets its progress, and so does
// a pad with a turret on it. Then the attacker's hold timer runs while it
// holds enough points.
func (s *Sim) capture() {
	need := ticks(s.rules.CaptureSeconds)
	held, contested := 0, false
	for i := range s.Points {
		p := &s.Points[i]
		present := s.presence(p.Cell)
		switch {
		case present[Attacker] == present[Defender]:
			p.Progress = 0
		default:
			side := Defender
			if present[Attacker] {
				side = Attacker
			}
			if side == p.Owner {
				p.Progress = 0
				break
			}
			if p.Taker != side {
				p.Taker, p.Progress = side, 0
			}
			if p.Progress++; p.Progress >= need {
				p.Owner, p.Progress = side, 0
			}
		}
		if p.Owner == Attacker {
			held++
			contested = contested || present[Defender]
		}
	}
	for i := range s.Pads {
		p := &s.Pads[i]
		if t := s.squad(p.Turret); t != nil && !t.alive() {
			p.Turret = 0 // destroyed: the pad can be taken
		}
		present := s.presence(p.Cell)
		switch {
		case p.Turret != 0 || present[Attacker] == present[Defender]:
			p.Progress = 0
		default:
			side := Defender
			if present[Attacker] {
				side = Attacker
			}
			if side == p.Owner {
				p.Progress = 0
				break
			}
			if p.Taker != side {
				p.Taker, p.Progress = side, 0
			}
			if p.Progress++; p.Progress >= need {
				// Taken: any build under way is lost, with no refund.
				p.Owner, p.Progress, p.Building, p.ReadyAt = side, 0, "", 0
			}
		}
	}
	// The hold timer runs while the attacker holds enough points, and pauses,
	// keeping its count, while a defender stands on one of them.
	s.HoldPaused = held >= s.rules.HoldPoints && contested
	switch {
	case held < s.rules.HoldPoints:
		s.Hold = 0
	case !contested:
		s.Hold++
	}
}

// CanBuild reports why side can't build building on pad, or nil if it can:
// it must hold the pad, the pad must be empty and not already building, and
// the building must be a pad turret. A side with Funds must afford it; a
// player's Resources are checked by the game.
func (s *Sim) CanBuild(side Side, pad int, building string) error {
	if pad < 0 || pad >= len(s.Pads) {
		return errors.New("no such build pad")
	}
	p := s.Pads[pad]
	b, ok := s.content.Buildings[building]
	switch {
	case p.Owner != side:
		return errors.New("you don't hold that build pad")
	case p.Turret != 0 || p.Building != "":
		return errors.New("that build pad is taken")
	case !ok || b.PadTurret == nil || !*b.PadTurret || b.Combat == nil:
		return errors.New("that can't be built on a build pad")
	case s.Retreating[side]:
		return errors.New("you're Retreating")
	}
	if f := s.Funds[side]; f != nil {
		for r, n := range b.Cost {
			if f[r] < n {
				return errors.New("not enough to build that")
			}
		}
	}
	return nil
}

// raiseTurrets puts up each pad turret whose build is done, once nobody is
// standing on its pad.
func (s *Sim) raiseTurrets() {
	for i := range s.Pads {
		p := &s.Pads[i]
		if p.Building == "" || s.Tick < p.ReadyAt || s.ground[s.Field.index(p.Cell)] != 0 {
			continue
		}
		cb := s.content.Buildings[p.Building].Combat
		sq := &Squad{Side: p.Owner, Unit: p.Building, Building: true, Armed: true, Slot: -1, OnPad: i + 1}
		s.stats(sq, cb)
		sq.speed = 0
		sq.Members = []Layers{sq.layers(cb)}
		s.place(sq, p.Cell)
		p.Turret, p.Building, p.ReadyAt = sq.ID, "", 0
		s.see() // a new squad: the visibility tables grow with it
	}
}

// presence is which sides have a ground squad, not Retreating, near c.
func (s *Sim) presence(c Cell) [2]bool {
	r := s.rules.CaptureRadius
	var present [2]bool
	for _, sq := range s.Squads {
		if sq.alive() && !sq.Building && !sq.air && !sq.retreating && float64(dist2(sq.Cell, c)) <= r*r {
			present[sq.Side] = true
		}
	}
	return present
}

// end checks whether the Battle is over. A side whose Retreat has started
// loses once every squad that could leave has left or died. Wiping each
// other out, or both Retreating, goes to the defender.
func (s *Sim) end() {
	// Pad turrets don't keep an attacker in the fight.
	attackers := slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Side == Attacker && sq.alive() && sq.OnPad == 0 })
	defenders := slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Side == Defender && sq.alive() && sq.Armed })
	left := func(side Side) bool {
		return s.Retreating[side] && !slices.ContainsFunc(s.Squads, func(sq *Squad) bool {
			return sq.Side == side && sq.alive() && sq.speed > 0
		})
	}
	switch {
	case left(Attacker):
		s.Over, s.Winner, s.Reason = true, Defender, Retreated
	case !attackers:
		s.Over, s.Winner, s.Reason = true, Defender, Eliminated
	case left(Defender):
		s.Over, s.Winner, s.Reason = true, Attacker, Retreated
	case !defenders:
		s.Over, s.Winner, s.Reason = true, Attacker, Eliminated
	case s.Hold > 0 && s.Hold >= ticks(s.rules.HoldSeconds):
		s.Over, s.Winner, s.Reason = true, Attacker, HeldPoints
	case s.Tick >= s.rules.TimeCap*TicksPerSecond:
		s.Over, s.Winner, s.Reason = true, Defender, TimeUp
	}
}

// SquadView is a squad as a side sees it: where it is, how many are left,
// and its front member's layers.
type SquadView struct {
	ID       int
	Side     Side
	Unit     string
	Building bool
	Cell     Cell
	Count    int
	Start    int
	Front    Layers
}

// Snapshot is one side's picture of the Battle: its own squads, the enemies
// it can see, and the public state. It's the only Battle state a side is
// sent, so it's where fog of war is enforced.
type Snapshot struct {
	Tick       int
	Edge       int
	Squads     []SquadView // on the field, by id
	Points     []Point
	Pads       []Pad // public, like the Points
	Hold       int
	HoldPaused bool
	RetreatAt  int     // the tick the side's own Retreat countdown ends, or 0
	Retreating [2]bool // public: you see the enemy turn and run
}

func (s *Sim) Snapshot(side Side) Snapshot {
	snap := Snapshot{
		Tick: s.Tick, Edge: s.Edge, Points: slices.Clone(s.Points), Pads: slices.Clone(s.Pads), Hold: s.Hold, HoldPaused: s.HoldPaused,
		RetreatAt: s.RetreatAt[side], Retreating: s.Retreating,
	}
	for _, sq := range s.Squads {
		if sq.alive() && s.visible[side][sq.ID] {
			snap.Squads = append(snap.Squads, SquadView{
				ID: sq.ID, Side: sq.Side, Unit: sq.Unit, Building: sq.Building, Cell: sq.Cell,
				Count: len(sq.Members), Start: sq.Start, Front: sq.Members[0],
			})
		}
	}
	return snap
}

// VolleysFor is the volleys side may know about: any that hit its own squads
// or ones it can see. A shooter it can't see shows as 0.
func (s *Sim) VolleysFor(side Side, vs []Volley) []Volley {
	var out []Volley
	for _, v := range vs {
		t := s.squad(v.Target)
		if t.Side != side && !s.visible[side][v.Target] && !s.visible[side][v.Actor] {
			continue
		}
		if a := s.squad(v.Actor); a.Side != side && !s.visible[side][v.Actor] {
			v.Actor = 0
		}
		out = append(out, v)
	}
	return out
}
