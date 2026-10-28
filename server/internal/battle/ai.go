package battle

import (
	"cmp"
	"maps"
	"math"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Weights tune a side's AI. Each scales one kind of choice; 1 is neutral.
type Weights struct {
	Aggression float64 // going after enemy squads in view
	Caution    float64 // shying from goals with enemies near, regrouping when hurt
	Cover      float64 // preferring cover and high ground to stop on
	Raid       float64 // going after enemy buildings
	Scout      float64 // searching when no enemy is in view
}

// WeightsOf reads a Faction's AI block; anything it leaves out is 1.
func WeightsOf(w *cs.AIWeights) Weights {
	or := func(p *float64) float64 {
		if p == nil {
			return 1
		}
		return *p
	}
	if w == nil {
		return Weights{1, 1, 1, 1, 1}
	}
	return Weights{or(w.Aggression), or(w.Caution), or(w.Cover), or(w.Raid), or(w.Scout)}
}

type goalKind int

const (
	capture goalKind = iota // take a Control Point the side doesn't hold
	defend                  // hold one it does
	kill                    // destroy an enemy squad in view
	raid                    // destroy an enemy building seen
	scout                   // look for the enemy
)

// goal is what the Commander gives a squad: a place, and for kill and raid
// the target's id.
type goal struct {
	kind   goalKind
	cell   Cell
	target int
}

// same is whether two goals are the same job, wherever a target has moved.
func (g goal) same(o goal) bool {
	return g.kind == o.kind && g.target == o.target && (g.target != 0 || g.cell == o.cell)
}

// Facts a squad's plan reasons over, as bits.
type facts uint8

const (
	atGoal facts = 1 << iota
	inRange
	inCover
	nearFriendly
)

// action is one step of a squad's plan.
type action int

const (
	goTo      action = iota // to the goal
	approach                // to a firing position on the target, preferring high ground and cover
	takeCover               // to a covered cell near where it is
	regroup                 // to the nearest friendly squad
)

type plan struct {
	goal    goal
	steps   []action
	members int  // its count when planned: a loss replans
	moveTo  Cell // where the current step sent it
	sent    bool
	engaged int // guarding a point: the enemy it has left the point to fight, or 0
}

// AI drives a side: a Commander that hands each squad a goal, and a
// Goal-Oriented Action Planner per squad that works out how to reach it.
// See ADR 0005.
type AI struct {
	weights Weights
	plans   map[int]*plan
	seen    map[int]Cell     // enemy buildings seen, by id, where they stand
	sighted map[int]sighting // enemy squads seen lately, by id
	owners  []Side           // Control Point holders last tick, to notice a flip
	own     []*Squad         // the side's squads on the field this tick
}

func NewAI(w Weights) *AI {
	return &AI{weights: w, plans: map[int]*plan{}, seen: map[int]Cell{}, sighted: map[int]sighting{}}
}

// sighting is where an enemy squad was last seen, how many it had, and when.
type sighting struct {
	cell    Cell
	members int
	tick    int
}

// weightsOf is looked up per squad, so unit types can tune their own later.
func (ai *AI) weightsOf(*Squad) Weights { return ai.weights }

const (
	// recallTicks is how long the AI keeps counting an enemy it can no longer
	// see. Without it, a squad that sights an enemy, turns away from the
	// threat, and loses sight of it would turn straight back, over and over.
	recallTicks = 10 * TicksPerSecond
	// stickiness is how much better another goal must score before a squad
	// drops the one it has.
	stickiness = 1.25
	// leash is how far from its point, in cells, a guarding squad chases an
	// enemy, times its aggression weight.
	leash        = 6
	nearRadius   = 3 // cells: a friendly this close is near
	threatRadius = 6 // cells: enemies this close to a goal threaten it
	distScale    = 12.0
)

func (ai *AI) Orders(v View) []Order {
	s := v.sim
	enemies := v.Enemies()
	own := v.Own()
	ai.own = own
	ai.remember(v, own, enemies)

	flipped := false
	for i, p := range s.Points {
		flipped = flipped || i < len(ai.owners) && ai.owners[i] != p.Owner
	}
	ai.owners = ai.owners[:0]
	for _, p := range s.Points {
		ai.owners = append(ai.owners, p.Owner)
	}
	if flipped || v.Tick()%TicksPerSecond == 0 {
		ai.command(v, own, enemies)
	}

	var out []Order
	for _, sq := range own {
		p := ai.plans[sq.ID]
		if p == nil || sq.speed == 0 || sq.retreating {
			continue
		}
		if p.goal.target != 0 {
			t := s.squad(p.goal.target)
			if t == nil || !t.alive() {
				continue // gone: the Commander picks a new goal next second
			}
			if s.visible[v.Side][t.ID] {
				p.goal.cell = t.Cell
			}
		}
		if p.goal.kind == defend {
			if e := ai.intruder(v, sq, p, enemies); e != nil {
				out = append(out, ai.engage(v, sq, p, e)...)
				continue
			}
			if p.engaged != 0 { // it's dead or gone: back to the point
				p.engaged, p.steps, p.sent = 0, nil, false
			}
		}
		if p.steps == nil || flipped || len(sq.Members) < p.members || (v.Tick()+sq.ID)%TicksPerSecond == 0 {
			ai.replan(v, sq, p)
		}
		out = append(out, ai.execute(v, sq, p)...)
	}
	return out
}

// remember keeps where enemy buildings were seen, and forgets one whose
// cell is in Sight but which isn't there any more.
func (ai *AI) remember(v View, own, enemies []*Squad) {
	for _, e := range enemies {
		if e.Building {
			ai.seen[e.ID] = e.Cell
		} else {
			ai.sighted[e.ID] = sighting{e.Cell, len(e.Members), v.Tick()}
		}
	}
	inSight := func(at Cell) bool {
		return slices.ContainsFunc(own, func(o *Squad) bool {
			r := v.sim.sightOf(o)
			return float64(dist2(o.Cell, at)) <= r*r
		})
	}
	for _, id := range slices.Sorted(maps.Keys(ai.sighted)) {
		// Forgotten after a while, or once the spot is in Sight and it's gone.
		if sg := ai.sighted[id]; v.Tick()-sg.tick > recallTicks || sg.tick != v.Tick() && inSight(sg.cell) {
			delete(ai.sighted, id)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(ai.seen)) {
		if t := v.sim.squad(id); t == nil || !t.alive() {
			at := ai.seen[id]
			if slices.ContainsFunc(own, func(o *Squad) bool {
				r := v.sim.sightOf(o)
				return float64(dist2(o.Cell, at)) <= r*r
			}) {
				delete(ai.seen, id)
			}
		}
	}
}

// command is the Commander: it lists goals and hands each mobile squad the
// one it scores highest. A goal's score is its value, less for distance, for
// squads already on it, and, except for holding a point, for enemies the
// side has seen near it lately. A squad's current goal scores a quarter more,
// so near-ties don't flip it back and forth.
func (ai *AI) command(v View, own, enemies []*Squad) {
	s := v.sim
	var goals []goal
	var values []float64
	add := func(g goal, value float64) {
		goals = append(goals, g)
		values = append(values, value)
	}
	w := ai.weights
	retake := 3.0
	if v.Side == Defender && s.Hold > 0 {
		retake = 5 // the attacker's hold timer is running: a point back stops it
	}
	for _, p := range s.Points {
		if p.Owner != v.Side {
			add(goal{kind: capture, cell: p.Cell}, retake)
		} else if v.Side == Defender {
			add(goal{kind: defend, cell: p.Cell}, 2)
		} else {
			add(goal{kind: defend, cell: p.Cell}, 1.2)
		}
	}
	for _, e := range enemies {
		if e.Building {
			add(goal{kind: raid, cell: e.Cell, target: e.ID}, 1.2*w.Raid)
		} else {
			add(goal{kind: kill, cell: e.Cell, target: e.ID}, 1.5*w.Aggression)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(ai.seen)) {
		if !s.visible[v.Side][id] {
			add(goal{kind: raid, cell: ai.seen[id], target: id}, w.Raid)
		}
	}
	if len(enemies) == 0 {
		// Toward where the enemy comes from, or else the middle of the map.
		at := Cell{s.Field.W / 2, s.Field.H / 2}
		if v.Side == Defender {
			in := inward[s.Edge]
			at = at.add(Cell{-in.X * s.Field.W / 4, -in.Y * s.Field.H / 4})
		}
		add(goal{kind: scout, cell: at}, 0.6*w.Scout)
	}
	if len(goals) == 0 {
		return
	}

	// Threat counts enemies seen lately, not only those in view now.
	threat := make([]float64, len(goals))
	for i, g := range goals {
		for _, id := range slices.Sorted(maps.Keys(ai.sighted)) {
			if sg := ai.sighted[id]; id != g.target && dist(sg.cell, g.cell) <= threatRadius {
				threat[i] += float64(sg.members)
			}
		}
	}
	strength := 0.0
	for _, sq := range own {
		strength += float64(len(sq.Members))
	}
	assigned := make([]float64, len(goals))
	for _, sq := range own {
		if sq.speed == 0 || sq.retreating {
			continue
		}
		best, bestScore := -1, math.Inf(-1)
		current := ai.plans[sq.ID]
		for i, g := range goals {
			if g.target != 0 && s.tier(sq, s.squad(g.target)) == None {
				continue // it can't hurt that
			}
			score := values[i] / (1 + dist(sq.Cell, g.cell)/distScale) / (1 + assigned[i])
			if g.kind != defend { // a threatened point is the one to hold, not to shy from
				score /= 1 + w.Caution*threat[i]/max(1, strength)
			}
			if current != nil && current.goal.same(g) {
				score *= stickiness
			}
			if score > bestScore { // ties keep the earlier goal
				best, bestScore = i, score
			}
		}
		if best < 0 {
			continue
		}
		assigned[best]++
		if p := ai.plans[sq.ID]; p != nil && p.goal.same(goals[best]) {
			p.goal = goals[best]
			continue
		}
		ai.plans[sq.ID] = &plan{goal: goals[best]}
	}
}

// intruder is the enemy a guarding squad should leave its point to fight:
// the one it's already fighting while that's still on the leash, or else the
// nearest it can see and hurt within the leash of the point.
func (ai *AI) intruder(v View, sq *Squad, p *plan, enemies []*Squad) *Squad {
	s := v.sim
	reach := leash * ai.weightsOf(sq).Aggression
	onLeash := func(e *Squad) bool {
		return e.alive() && !e.Building && s.visible[v.Side][e.ID] && s.tier(sq, e) != None &&
			dist(e.Cell, p.goal.cell) <= reach
	}
	if e := s.squad(p.engaged); e != nil && onLeash(e) {
		return e
	}
	var best *Squad
	for _, e := range enemies {
		if onLeash(e) && (best == nil || dist2(sq.Cell, e.Cell) < dist2(sq.Cell, best.Cell)) {
			best = e
		}
	}
	return best
}

// engage has a guarding squad fight e: stop and fire if it's in range, or
// else move to a firing position on it, refreshed once a second.
func (ai *AI) engage(v View, sq *Squad, p *plan, e *Squad) []Order {
	s := v.sim
	fresh := p.engaged != e.ID
	p.engaged = e.ID
	if s.canHit(sq, e) {
		if len(sq.path) > 0 {
			return []Order{{Kind: Hold, Squad: sq.ID}}
		}
		return nil
	}
	if !fresh && len(sq.path) > 0 && (v.Tick()+sq.ID)%TicksPerSecond != 0 {
		return nil
	}
	to, ok := s.firingPosition(sq, e.Cell, ai.weightsOf(sq).Cover)
	if !ok || (!fresh && len(sq.path) > 0 && dist(p.moveTo, to) <= 2) {
		return nil
	}
	p.moveTo, p.sent = to, false // sent is for its plan's steps; this isn't one
	return []Order{{Kind: Move, Squad: sq.ID, Cell: to}}
}

// state reads a squad's facts now.
func (ai *AI) state(v View, sq *Squad, g goal) facts {
	s := v.sim
	var f facts
	radius := s.rules.CaptureRadius
	if g.kind == scout || g.target != 0 {
		radius = closeEnough
	}
	if dist(sq.Cell, g.cell) <= radius {
		f |= atGoal
	}
	if t := s.squad(g.target); t != nil && s.canHit(sq, t) {
		f |= inRange
	}
	if s.coverAt(sq.Cell) < 0 && !sq.air {
		f |= inCover
	}
	for _, o := range ai.own {
		if o != sq && !o.Building && dist(o.Cell, sq.Cell) <= nearRadius {
			f |= nearFriendly
			break
		}
	}
	return f
}

func (s *Sim) coverAt(c Cell) int {
	return int(s.content.Terrains[s.Field.Terrains[s.Field.Terrain[s.Field.index(c)]]].Cover)
}

// want is the facts a goal asks for. Holding a point wants cover if the
// faction cares for it and there's some by the point; going after a target
// wants friends near when the squad is down to half strength.
func (ai *AI) want(v View, sq *Squad, g goal) facts {
	w := ai.weightsOf(sq)
	switch g.kind {
	case kill, raid:
		if len(sq.Members)*2 < sq.Start && w.Caution >= 1 {
			return inRange | nearFriendly
		}
		return inRange
	case defend:
		if w.Cover >= 1 && !sq.air {
			if _, ok := v.sim.coverNear(sq, g.cell, v.sim.rules.CaptureRadius); ok {
				return atGoal | inCover
			}
		}
	}
	return atGoal
}

// replan finds the cheapest steps from the squad's facts now to its goal's:
// a search over the few states its facts make, at most 4 steps deep. Ties
// go to the action declared first.
func (ai *AI) replan(v View, sq *Squad, p *plan) {
	start, want := ai.state(v, sq, p.goal), ai.want(v, sq, p.goal)
	w := ai.weightsOf(sq)
	speed := max(sq.speed, 0.1)
	travel := func(to Cell) float64 { return dist(sq.Cell, to) / speed }
	type node struct {
		f     facts
		cost  float64
		steps []action
	}
	open := []node{{f: start}}
	best := map[facts]float64{start: 0}
	var found *node
	for len(open) > 0 {
		slices.SortStableFunc(open, func(a, b node) int { return cmp.Compare(a.cost, b.cost) })
		n := open[0]
		open = open[1:]
		if n.f&want == want {
			found = &n
			break
		}
		if len(n.steps) == 4 {
			continue
		}
		for _, a := range []action{goTo, approach, takeCover, regroup} {
			f, cost, ok := n.f, 0.0, true
			switch a {
			case goTo:
				f, cost = (f|atGoal)&^inCover, travel(p.goal.cell)
			case approach:
				ok = p.goal.target != 0
				f, cost = (f|inRange)&^inCover, max(0, dist(sq.Cell, p.goal.cell)-sq.reach)/speed
			case takeCover:
				_, ok = v.sim.coverNear(sq, sq.Cell, nearRadius)
				f, cost = f|inCover, 2/max(w.Cover, 0.1)
			case regroup:
				f, cost = (f|nearFriendly)&^(inCover|atGoal), 3/max(w.Caution, 0.1)
			}
			if !ok || f == n.f {
				continue
			}
			c := n.cost + cost
			if old, seen := best[f]; seen && old <= c {
				continue
			}
			best[f] = c
			open = append(open, node{f: f, cost: c, steps: append(slices.Clone(n.steps), a)})
		}
	}
	steps := []action{}
	if found != nil {
		steps = found.steps
	}
	// The same next step keeps where it was sent: re-sending costs a path.
	if len(steps) == 0 || len(p.steps) == 0 || steps[0] != p.steps[0] {
		p.sent = false
	}
	p.steps, p.members = steps, len(sq.Members)
}

// execute carries out a squad's plan: it drops steps whose effect already
// holds, then sends the squad where the next one needs it. With nothing
// left to do it stops and fires at what's in range.
func (ai *AI) execute(v View, sq *Squad, p *plan) []Order {
	now := ai.state(v, sq, p.goal)
	effect := map[action]facts{goTo: atGoal, approach: inRange, takeCover: inCover, regroup: nearFriendly}
	for len(p.steps) > 0 && now&effect[p.steps[0]] != 0 {
		p.steps, p.sent = p.steps[1:], false
	}
	if len(p.steps) == 0 {
		if len(sq.path) > 0 {
			return []Order{{Kind: Hold, Squad: sq.ID}}
		}
		return nil
	}
	// On its way: look again only on its slot each second, as each new
	// destination costs a path.
	if p.sent && len(sq.path) > 0 && (v.Tick()+sq.ID)%TicksPerSecond != 0 {
		return nil
	}
	to, ok := ai.cellFor(v, sq, p)
	if !ok || (p.sent && dist(p.moveTo, to) <= 2 && (len(sq.path) > 0 || dist(sq.Cell, to) <= closeEnough)) {
		return nil
	}
	p.moveTo, p.sent = to, true
	return []Order{{Kind: Move, Squad: sq.ID, Cell: to}}
}

// cellFor is where a squad's next step sends it.
func (ai *AI) cellFor(v View, sq *Squad, p *plan) (Cell, bool) {
	s := v.sim
	switch p.steps[0] {
	case approach:
		return s.firingPosition(sq, p.goal.cell, ai.weightsOf(sq).Cover)
	case takeCover:
		return s.coverNear(sq, sq.Cell, nearRadius)
	case regroup:
		var near []Cell
		for _, o := range ai.own {
			if o != sq && !o.Building {
				near = append(near, o.Cell)
			}
		}
		if len(near) == 0 {
			return Cell{}, false
		}
		return slices.MinFunc(near, func(a, b Cell) int {
			return cmp.Or(cmp.Compare(dist2(sq.Cell, a), dist2(sq.Cell, b)), cmp.Compare(s.Field.index(a), s.Field.index(b)))
		}), true
	}
	return p.goal.cell, true
}

// standable is whether sq could stop on c: in bounds, its ground, and free.
func (s *Sim) standable(sq *Squad, c Cell) bool {
	f := s.Field
	if c.X < 0 || c.Y < 0 || c.X >= f.W || c.Y >= f.H {
		return false
	}
	i := f.index(c)
	if s.costsFor(sq.class)[i] == 0 || (!sq.air && !s.reachFor(sq.class)[i]) {
		return false
	}
	id := s.layer(sq)[i]
	return id == 0 || id == sq.ID
}

// coverNear is the covered cell within radius of around that's nearest the
// squad, if any.
func (s *Sim) coverNear(sq *Squad, around Cell, radius float64) (Cell, bool) {
	best, found := Cell{}, false
	r := int(radius)
	for y := around.Y - r; y <= around.Y+r; y++ {
		for x := around.X - r; x <= around.X+r; x++ {
			c := Cell{x, y}
			if dist(c, around) > radius || !s.standable(sq, c) || s.coverAt(c) >= 0 {
				continue
			}
			if !found || dist2(sq.Cell, c) < dist2(sq.Cell, best) {
				best, found = c, true
			}
		}
	}
	return best, found
}

// firingPosition is a cell in range of target that the squad can stand on,
// trading the walk there against high ground and cover by the cover weight.
func (s *Sim) firingPosition(sq *Squad, target Cell, cover float64) (Cell, bool) {
	best, bestScore, found := Cell{}, math.Inf(1), false
	r := int(sq.reach)
	for y := target.Y - r; y <= target.Y+r; y++ {
		for x := target.X - r; x <= target.X+r; x++ {
			c := Cell{x, y}
			d := dist(c, target)
			if d > sq.reach || d < sq.minRange || !s.standable(sq, c) {
				continue
			}
			score := dist(sq.Cell, c)
			if !sq.air {
				score -= cover * (2*float64(s.height(c)-s.height(target)) - float64(s.coverAt(c)))
			}
			if score < bestScore {
				best, bestScore, found = c, score, true
			}
		}
	}
	return best, found
}
