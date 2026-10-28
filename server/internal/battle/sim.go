package battle

import (
	"cmp"
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
}

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

	class                  string
	air                    bool
	weapon                 Multipliers
	dice                   Dice
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
}

func (sq *Squad) alive() bool { return len(sq.Members) > 0 }

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
)

// Sim is a running Battle. It's a pure function of its inputs: the same
// content, Field, forces, seed and orders give the same Battle.
type Sim struct {
	Field  *Field
	Squads []*Squad // by id; dead ones stay, with no Members
	Points []Point
	Edge   int // the attacker's edge: 0 top, 1 right, 2 bottom, 3 left
	Tick   int
	Hold   int // ticks the attacker has held enough points
	Over   bool
	Winner Side
	Reason string

	Controllers [2]Controller

	content     *cs.Content
	rules       cs.BattleRules
	toHit       int
	pathClass   string
	rng         *rand.Rand
	ground, air []int // the squad id in each cell, or 0
	visible     [2]map[int]bool
	costCache   map[string]costs
	main        []bool // cells joined to the Control Points on foot
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
// Point.
func New(c *cs.Content, rules cs.Ruleset, f *Field, attack, defend Force, seed uint64) *Sim {
	s := &Sim{
		Field: f, content: c, rules: rules.Battle, toHit: rules.ToHit, pathClass: string(rules.Battlefield.PathClass),
		rng: rand.New(rand.NewPCG(seed, 4)), ground: make([]int, f.W*f.H), air: make([]int, f.W*f.H),
		costCache: map[string]costs{},
	}
	foot := s.costsFor(s.pathClass)
	s.main = f.largestRegion(func(i int) bool { return foot[i] > 0 })
	for _, p := range f.Points {
		s.Points = append(s.Points, Point{Cell: p, Owner: Defender, Taker: Defender})
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
	return s
}

func (s *Sim) addUnit(side Side, formation int, sl Slot, want Cell) {
	cb := s.content.Units[sl.Unit].Combat
	sq := &Squad{Side: side, Unit: sl.Unit, Armed: true, Formation: formation, Slot: sl.Cell}
	s.stats(sq, &cb)
	sq.Members = make([]Layers, sl.Count)
	for i := range sq.Members {
		sq.Members[i] = Layers{float64(cb.Shield), float64(cb.Armor), float64(cb.Hp)}
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
	sq.Members = []Layers{{float64(cb.Shield), float64(cb.Armor), float64(cb.Hp)}}
	s.place(sq, want)
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
// reach the Control Points.
func (s *Sim) place(sq *Squad, want Cell) {
	f := s.Field
	want = Cell{min(max(want.X, 0), f.W-1), min(max(want.Y, 0), f.H-1)}
	c := s.costsFor(sq.class)
	if sq.Building {
		c = s.costsFor(s.pathClass)
	}
	layer := s.layer(sq)
	seen := make([]bool, f.W*f.H)
	queue := []int{f.index(want)}
	seen[queue[0]] = true
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		if layer[i] == 0 && c[i] > 0 && (sq.air || s.main[i]) {
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
	// shortcut: a squad with nowhere to stand sits out the Battle; only a map
	// fuller than its ground can cause it.
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

// apply carries out one order from side's Controller, ignoring any that
// isn't valid: not its squad, dead, or a building told to move.
func (s *Sim) apply(side Side, o Order) {
	sq := s.squad(o.Squad)
	if sq == nil || sq.Side != side || !sq.alive() {
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
			if layer[s.Field.index(next)] != 0 {
				if dist(sq.Cell, sq.goal) <= closeEnough {
					sq.path = nil // a crowd round the goal: this will do
					break
				}
				sq.bank = min(sq.bank, cost)
				if sq.blocked++; sq.blocked >= TicksPerSecond {
					sq.blocked = 0
					sq.path = s.Field.path(c, sq.Cell, sq.goal, func(i int) bool { return layer[i] != 0 })
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
		}
	}
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
		vis := map[int]bool{}
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
		if !sq.alive() || !sq.Armed {
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
			d := hit(sq.weapon, &t.Members[0], rollWith(tier, func() int { return sq.dice.roll(s.rng) }))
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

// capture updates each Control Point. A point changes hands after one side
// alone has a ground squad in range for captureSeconds; a contested or empty
// point resets its progress. Then the attacker's hold timer runs while it
// holds enough points.
func (s *Sim) capture() {
	r := s.rules.CaptureRadius
	need := ticks(s.rules.CaptureSeconds)
	held := 0
	for i := range s.Points {
		p := &s.Points[i]
		var present [2]bool
		for _, sq := range s.Squads {
			if sq.alive() && !sq.Building && !sq.air && float64(dist2(sq.Cell, p.Cell)) <= r*r {
				present[sq.Side] = true
			}
		}
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
		}
	}
	if held >= s.rules.HoldPoints {
		s.Hold++
	} else {
		s.Hold = 0
	}
}

// end checks whether the Battle is over. Wiping each other out goes to the
// defender.
func (s *Sim) end() {
	attackers := slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Side == Attacker && sq.alive() })
	defenders := slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Side == Defender && sq.alive() && sq.Armed })
	switch {
	case !attackers:
		s.Over, s.Winner, s.Reason = true, Defender, Eliminated
	case !defenders:
		s.Over, s.Winner, s.Reason = true, Attacker, Eliminated
	case s.Hold > 0 && s.Hold >= ticks(s.rules.HoldSeconds):
		s.Over, s.Winner, s.Reason = true, Attacker, HeldPoints
	case s.Tick >= s.rules.TimeCap*TicksPerSecond:
		s.Over, s.Winner, s.Reason = true, Defender, TimeUp
	}
}
