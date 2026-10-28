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
	capture  goalKind = iota // take a Control Point the side doesn't hold
	defend                   // hold one it does
	kill                     // destroy an enemy squad in view
	raid                     // destroy an enemy building seen
	scout                    // look for the enemy
	patrol                   // a skirmisher's next stop on its round
	fallback                 // get clear of the enemy: back to a held point or a friend
)

// role is a job the Commander gives a squad on top of the usual goals.
type role int

const (
	noRole      role = iota
	scouting         // roams to look, falls back from the enemy
	skirmish         // patrols between points, hunts what it's good against
	fallingBack      // was scouting or skirmishing, and met more than it could take
)

// matchup scales a kill or raid goal by the squad's tier against the
// target, so squads go after what they're good against. Kept mild: at 1.5 and
// 0.6 the attacker, free to pick its fights, won 75% of Starting Kit Battles.
var matchup = map[string]float64{Advantage: 1.15, Normal: 1, Disadvantage: 0.9}

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
	goal      goal
	steps     []action
	members   int  // its count when planned: a loss replans
	moveTo    Cell // where the current step sent it
	sent      bool
	engaged   int // guarding a point: the enemy it has left the point to fight, or 0
	beat      int // a guard's place on its beat round its point
	beatAt    int // the tick it last set out on its beat
	beatUntil int // the tick it's back from its beat
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
	looked  []int            // per block of the map, the tick the side last saw its middle
	roles   map[int]role     // squads with a job, by id
	rested  map[int]int      // the tick a squad got back from falling back
	round   map[int]int      // a skirmisher's place on its patrol
}

func NewAI(w Weights) *AI {
	return &AI{
		weights: w, plans: map[int]*plan{}, seen: map[int]Cell{}, sighted: map[int]sighting{},
		roles: map[int]role{}, rested: map[int]int{}, round: map[int]int{},
	}
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
	// padValue is how much the Commander wants a build pad it doesn't hold,
	// against 3 for a Control Point.
	padValue = 1.2
	// block is the side, in cells, of the squares the AI tracks looking at.
	block = 8
	// scoutShare is the part of a defender's mobile squads sent scouting,
	// times its scout weight; at least one once it has minForScouts, and at
	// most maxScouts. A two-squad defender whose scout kept going out lost
	// its points: 63% attacker wins; scouting once, 55%.
	scoutShare   = 0.2
	minForScouts = 2
	// minForRepeat is how many mobile squads a defender needs before a scout
	// that fell back goes out again; with fewer it scouts once.
	minForRepeat = 3
	maxScouts    = 3
	// skirmishShare is the part of a side's mobile squads it sends
	// skirmishing, times its aggression weight, out of those it can spare
	// (beyond one per point for the defender, two per point for the
	// attacker): at least 1 and at most maxSkirmishers.
	skirmishShare  = 0.3
	maxSkirmishers = 5
	// restTicks is how long a squad that fell back is left to the usual
	// goals before it can take a role again.
	restTicks = 20 * TicksPerSecond
	// outnumbered is how many times its own members an enemy needs before a
	// skirmisher falls back rather than fights.
	outnumbered = 1.5
	// staleCap is the most seconds since a block was looked at that count.
	staleCap = 60
	// A guard's beat: every beatEvery seconds it walks to a stop up to
	// beatReach cells from its point, inside the capture radius so the point
	// is never left open, and pauses there beatPause seconds. Out to 4 cells
	// and the pads near it, guards were caught away: 59% attacker wins
	// instead of 54%; this costs about 2.
	beatEvery = 8
	beatReach = 2
	beatPause = 3
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
	var out []Order
	if flipped || v.Tick()%TicksPerSecond == 0 {
		ai.look(v, own)
		ai.command(v, own, enemies)
		out = append(out, ai.build(v)...)
	}

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
			if v.Tick() < p.beatUntil {
				continue // walking its beat, or pausing at a stop
			}
			if o, ok := ai.walkBeat(v, sq, p); ok {
				out = append(out, o)
				continue
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
	for _, p := range s.Pads {
		if p.Owner != v.Side && p.Turret == 0 {
			add(goal{kind: capture, cell: p.Cell}, padValue)
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
	busy := ai.assignRoles(v, own, enemies)
	for _, sq := range own {
		if sq.speed == 0 || sq.retreating || busy[sq.ID] {
			continue
		}
		best, bestScore := -1, math.Inf(-1)
		current := ai.plans[sq.ID]
		for i, g := range goals {
			if g.target != 0 && s.tier(sq, s.squad(g.target)) == None {
				continue // it can't hurt that
			}
			score := values[i] / (1 + dist(sq.Cell, g.cell)/distScale) / (1 + assigned[i])
			if g.target != 0 {
				score *= matchup[s.tier(sq, s.squad(g.target))] // go after what it's good against
			}
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

// walkBeat sends an idle guard to the next stop on its beat round its point,
// so a garrison doesn't stand still: covered cells by the point, or else a
// spot each way. It goes only when it's settled on the point and the side
// knows of no enemy, and the usual plan brings it back once it has paused
// there. Walking beats with the enemy about got guards caught out.
func (ai *AI) walkBeat(v View, sq *Squad, p *plan) (Order, bool) {
	s := v.sim
	if len(p.steps) > 0 || len(sq.path) > 0 || dist(sq.Cell, p.goal.cell) > s.rules.CaptureRadius ||
		v.Tick()-p.beatAt < beatEvery*TicksPerSecond || (v.Tick()+sq.ID)%TicksPerSecond != 0 {
		return Order{}, false
	}
	if len(ai.sighted) > 0 {
		return Order{}, false // the enemy's been seen: stay put
	}
	var stops []Cell
	// Covered cells by the point if there are any, so it keeps its cover;
	// else a spot each way.
	for y := -beatReach; y <= beatReach; y++ {
		for x := -beatReach; x <= beatReach; x++ {
			c := p.goal.cell.add(Cell{x, y})
			if c != sq.Cell && dist(c, p.goal.cell) <= beatReach && !sq.air && s.standable(sq, c) && s.coverAt(c) < 0 {
				stops = append(stops, c)
			}
		}
	}
	if len(stops) == 0 {
		for _, d := range steps[:4] {
			for r := beatReach; r > 1; r-- {
				if c := p.goal.cell.add(d.scale(r)); s.standable(sq, c) {
					stops = append(stops, c)
					break
				}
			}
		}
	}
	if len(stops) == 0 {
		return Order{}, false
	}
	to := stops[p.beat%len(stops)]
	p.beat++
	p.beatAt = v.Tick()
	p.beatUntil = v.Tick() + int(dist(sq.Cell, to)/max(sq.speed, 0.1)*TicksPerSecond) + beatPause*TicksPerSecond
	p.steps, p.sent = nil, false // back to the point afterwards
	return Order{Kind: Move, Squad: sq.ID, Cell: to}, true
}

// intruder is the enemy a guarding squad should leave its point to fight:
// the one it's already fighting while that's still on the leash, or else,
// among those it can see and hurt within the leash of the point, the best
// matchup, then the nearest.
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
		if onLeash(e) && (best == nil || cmp.Or(
			cmp.Compare(tierRank[s.tier(sq, e)], tierRank[s.tier(sq, best)]),
			cmp.Compare(dist2(sq.Cell, e.Cell), dist2(sq.Cell, best.Cell)),
		) < 0) {
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

// build spends a side's own funds, which only a neutral garrison has, on
// a turret for each empty pad it holds: the cheapest it can afford. A
// player's money is theirs to spend, so their side never builds on its own.
func (ai *AI) build(v View) []Order {
	s := v.sim
	if s.Funds[v.Side] == nil {
		return nil
	}
	var turrets []string
	for _, id := range slices.Sorted(maps.Keys(s.content.Buildings)) {
		if b := s.content.Buildings[id]; b.PadTurret != nil && *b.PadTurret && b.Combat != nil {
			turrets = append(turrets, id)
		}
	}
	total := func(id string) int {
		n := 0
		for _, c := range s.content.Buildings[id].Cost {
			n += c
		}
		return n
	}
	slices.SortStableFunc(turrets, func(a, b string) int { return cmp.Compare(total(a), total(b)) })
	left := maps.Clone(s.Funds[v.Side]) // spent pad by pad this tick
	affords := func(id string) bool {
		for r, n := range s.content.Buildings[id].Cost {
			if left[r] < n {
				return false
			}
		}
		return true
	}
	var out []Order
	for i := range s.Pads {
		for _, id := range turrets {
			if s.CanBuild(v.Side, i, id) == nil && affords(id) {
				out = append(out, Order{Kind: Build, Target: i, Building: id})
				for r, n := range s.content.Buildings[id].Cost {
					left[r] -= n
				}
				break
			}
		}
	}
	return out
}

// look marks the blocks whose middles the side can see now.
func (ai *AI) look(v View, own []*Squad) {
	f := v.sim.Field
	bw, bh := (f.W+block-1)/block, (f.H+block-1)/block
	if ai.looked == nil {
		ai.looked = make([]int, bw*bh)
		for b := range ai.looked {
			ai.looked[b] = -staleCap * TicksPerSecond // not seen yet: as stale as it gets
		}
	}
	for b := range ai.looked {
		mid := Cell{min(b%bw*block+block/2, f.W-1), min(b/bw*block+block/2, f.H-1)}
		for _, o := range own {
			if r := v.sim.sightOf(o); float64(dist2(o.Cell, mid)) <= r*r {
				ai.looked[b] = v.Tick()
				break
			}
		}
	}
}

// assignRoles gives out the Commander's jobs on top of the usual goals, and
// reports the squads it has a job for:
//   - scouts: the defender's few, preferring units tagged for it, then
//     small squads, then fast ones, roam to the parts of the map it has
//     looked at least lately;
//   - skirmishers: squads a side can spare from its points, preferring
//     units tagged for it, then fast ones, patrol between the points and
//     hunt enemies they meet that they're good against;
//   - a scout, or a skirmisher meeting more than it can take, falls back to
//     a point its side holds or a friend, then rests as an ordinary squad.
func (ai *AI) assignRoles(v View, own, enemies []*Squad) map[int]bool {
	s := v.sim
	w := ai.weights
	busy := map[int]bool{}
	var mobile []*Squad
	for _, sq := range own {
		if sq.speed > 0 && !sq.retreating {
			mobile = append(mobile, sq)
		}
	}

	// Squads already on a job: carry on, hunt, or fall back.
	for _, sq := range mobile {
		r := ai.roles[sq.ID]
		switch {
		case r == noRole:
			continue
		case r == fallingBack:
			p := ai.plans[sq.ID]
			if p == nil || p.goal.kind != fallback || dist(sq.Cell, p.goal.cell) <= closeEnough {
				delete(ai.roles, sq.ID) // safe: back to the usual goals, for a while
				ai.rested[sq.ID] = v.Tick()
				continue
			}
		case !ai.inContact(v, sq):
		case r == skirmish && ai.prey(v, sq, enemies) != nil:
			e := ai.prey(v, sq, enemies)
			if p := ai.plans[sq.ID]; p == nil || p.goal.kind != kill || p.goal.target != e.ID {
				ai.plans[sq.ID] = &plan{goal: goal{kind: kill, cell: e.Cell, target: e.ID}}
			}
		default:
			ai.roles[sq.ID] = fallingBack
			ai.plans[sq.ID] = &plan{goal: goal{kind: fallback, cell: ai.safety(v, sq)}}
		}
		busy[sq.ID] = true
	}

	count := func(r role) int {
		n := 0
		for _, sq := range mobile {
			if ai.roles[sq.ID] == r {
				n++
			}
		}
		return n
	}
	free := func() []*Squad {
		var out []*Squad
		for _, sq := range mobile {
			back, rested := ai.rested[sq.ID]
			if ai.roles[sq.ID] == noRole && (!rested || v.Tick()-back >= restTicks) && !ai.inContact(v, sq) {
				out = append(out, sq)
			}
		}
		return out
	}
	tagged := func(sq *Squad, r string) int {
		if slices.Contains(sq.roles, r) {
			return 1
		}
		return 0
	}
	small := func(sq *Squad) int {
		if len(sq.Members) <= 2 {
			return 1
		}
		return 0
	}

	scouts := 0
	// A small force sends one scout out once: after it has fallen back, the
	// points need every squad more.
	scoutedOnce := len(ai.rested) > 0 && len(mobile) < minForRepeat
	if v.Side == Defender && len(mobile) >= minForScouts && w.Scout > 0 && !scoutedOnce {
		scouts = min(max(1, int(math.Round(float64(len(mobile))*scoutShare*w.Scout))), maxScouts, len(mobile)-1)
	}
	if want := scouts - count(scouting); want > 0 {
		cands := free()
		slices.SortStableFunc(cands, func(a, b *Squad) int {
			// Tagged scouts first; units tagged to skirmish only if nothing else fits.
			return cmp.Or(-cmp.Compare(tagged(a, "scout"), tagged(b, "scout")),
				cmp.Compare(tagged(a, "skirmisher"), tagged(b, "skirmisher")),
				-cmp.Compare(small(a), small(b)), -cmp.Compare(a.speed, b.speed), cmp.Compare(a.ID, b.ID))
		})
		for _, sq := range cands[:min(want, len(cands))] {
			ai.roles[sq.ID] = scouting
		}
	}

	// Squads it needs on the points: one per point for the defender, held or
	// to win back (counting only held ones sent squads skirmishing just as
	// points fell), and two per point for the attacker.
	need := len(s.Points)
	if v.Side == Attacker {
		need = 2 * len(s.Points)
	}
	spare := len(mobile) - need - scouts
	// A handful at most: they find and delay the enemy for the main force.
	skirmishers := min(spare, maxSkirmishers, max(1, int(math.Round(float64(len(mobile))*skirmishShare*w.Aggression))))
	if skirmishers <= 0 || w.Aggression <= 0 {
		skirmishers = 0
	}
	for i := len(mobile) - 1; i >= 0 && count(skirmish) > skirmishers; i-- {
		if sq := mobile[i]; ai.roles[sq.ID] == skirmish {
			delete(ai.roles, sq.ID) // too many now, say the force shrank: the newest go back
			delete(ai.plans, sq.ID)
		}
	}
	if want := skirmishers - count(skirmish); want > 0 {
		cands := free()
		slices.SortStableFunc(cands, func(a, b *Squad) int {
			return cmp.Or(-cmp.Compare(tagged(a, "skirmisher"), tagged(b, "skirmisher")),
				cmp.Compare(tagged(a, "scout"), tagged(b, "scout")),
				-cmp.Compare(a.speed, b.speed), cmp.Compare(a.ID, b.ID))
		})
		for _, sq := range cands[:min(want, len(cands))] {
			ai.roles[sq.ID] = skirmish
		}
	}

	// Send each squad on a job where it goes next.
	taken := map[Cell]bool{}
	stops := ai.stops(v)
	for _, sq := range mobile {
		p := ai.plans[sq.ID]
		switch ai.roles[sq.ID] {
		case scouting:
			busy[sq.ID] = true
			if p != nil && p.goal.kind == scout && dist(sq.Cell, p.goal.cell) > closeEnough {
				taken[p.goal.cell] = true
				continue // still on its way
			}
			if at, ok := ai.waypoint(v, sq, taken); ok {
				taken[at] = true
				ai.plans[sq.ID] = &plan{goal: goal{kind: scout, cell: at}}
			}
		case skirmish:
			busy[sq.ID] = true
			if p != nil && p.goal.kind == kill {
				continue // hunting
			}
			if len(stops) == 0 {
				continue
			}
			k := ai.round[sq.ID] % len(stops)
			if p != nil && p.goal.kind == patrol && dist(sq.Cell, p.goal.cell) <= closeEnough {
				k = (k + 1) % len(stops) // there: on to the next stop
			}
			ai.round[sq.ID] = k
			if p == nil || p.goal.kind != patrol || p.goal.cell != stops[k] {
				ai.plans[sq.ID] = &plan{goal: goal{kind: patrol, cell: stops[k]}}
			}
		}
	}
	return busy
}

// stops is a skirmisher's round: each Control Point and the halfway mark to
// the next, in order.
func (ai *AI) stops(v View) []Cell {
	pts := v.sim.Points
	var out []Cell
	for i, p := range pts {
		out = append(out, p.Cell)
		if len(pts) > 1 {
			q := pts[(i+1)%len(pts)].Cell
			out = append(out, Cell{(p.Cell.X + q.X) / 2, (p.Cell.Y + q.Y) / 2})
		}
	}
	return out
}

// prey is the enemy a skirmisher in contact should take on: in view and in
// its Sight, not one it's at a disadvantage against, and not outnumbering it
// badly; the best matchup first, then the nearest.
func (ai *AI) prey(v View, sq *Squad, enemies []*Squad) *Squad {
	s := v.sim
	r := s.sightOf(sq)
	var best *Squad
	for _, e := range enemies {
		t := s.tier(sq, e)
		if t == None || t == Disadvantage || float64(dist2(sq.Cell, e.Cell)) > r*r ||
			float64(len(e.Members)) > outnumbered*float64(len(sq.Members)) {
			continue
		}
		if best == nil || cmp.Or(
			cmp.Compare(tierRank[t], tierRank[s.tier(sq, best)]),
			cmp.Compare(dist2(sq.Cell, e.Cell), dist2(sq.Cell, best.Cell)),
		) < 0 {
			best = e
		}
	}
	return best
}

// safety is where a squad falls back to: the nearest point its side holds,
// or else the nearest friendly squad, or else where it is.
func (ai *AI) safety(v View, sq *Squad) Cell {
	var at []Cell
	for _, p := range v.sim.Points {
		if p.Owner == v.Side {
			at = append(at, p.Cell)
		}
	}
	if len(at) == 0 {
		for _, o := range ai.own {
			if o != sq && !o.Building && ai.roles[o.ID] == noRole {
				at = append(at, o.Cell)
			}
		}
	}
	if len(at) == 0 {
		return sq.Cell
	}
	return slices.MinFunc(at, func(a, b Cell) int {
		return cmp.Or(cmp.Compare(dist2(sq.Cell, a), dist2(sq.Cell, b)), cmp.Compare(v.sim.Field.index(a), v.sim.Field.index(b)))
	})
}

// inContact is whether an enemy the side has seen lately is in or near the
// squad's Sight.
func (ai *AI) inContact(v View, sq *Squad) bool {
	r := v.sim.sightOf(sq) + 2
	for _, sg := range ai.sighted {
		if float64(dist2(sq.Cell, sg.cell)) <= r*r {
			return true
		}
	}
	return false
}

// waypoint is the middle of the block a scout should look at next: the one
// looked at least lately, leaning toward the attacker's edge and against a
// long walk, and well clear of the side's own points, which it can see.
func (ai *AI) waypoint(v View, sq *Squad, taken map[Cell]bool) (Cell, bool) {
	s := v.sim
	f := s.Field
	bw := (f.W + block - 1) / block
	best, bestScore, found := Cell{}, math.Inf(-1), false
	for b, at := range ai.looked {
		mid := Cell{min(b%bw*block+block/2, f.W-1), min(b/bw*block+block/2, f.H-1)}
		reachable := sq.air || s.costsFor(sq.class)[f.index(mid)] > 0 && s.reachFor(sq.class)[f.index(mid)]
		if taken[mid] || !reachable ||
			slices.ContainsFunc(s.Points, func(p Point) bool { return dist(p.Cell, mid) < block }) {
			continue
		}
		stale := min(float64(v.Tick()-at)/TicksPerSecond, staleCap)
		toward := float64(max(f.W, f.H)-s.depth(s.Edge, mid)) / float64(max(f.W, f.H)) // 1 at the attacker's edge
		score := stale + 20*toward - dist(sq.Cell, mid)/max(sq.speed, 0.1)/2
		if score > bestScore { // ties keep the lower block
			best, bestScore, found = mid, score, true
		}
	}
	return best, found
}

// state reads a squad's facts now.
func (ai *AI) state(v View, sq *Squad, g goal) facts {
	s := v.sim
	var f facts
	radius := s.rules.CaptureRadius
	if g.kind == scout || g.kind == patrol || g.kind == fallback || g.target != 0 {
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
