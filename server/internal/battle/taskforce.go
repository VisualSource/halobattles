package battle

import (
	"cmp"
	"math"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// A Task Force is a few of a side's squads that the Commander gives one goal
// (ADR 0007): they gather out of the goal's threat, then go in together at
// the slowest one's pace. A goal that needs more than forceCap squads gets
// more Task Forces, each gathering on its own bearing, which go in together.
type taskForce struct {
	goal       goal
	n          int // its place among the Task Forces on the goal: picks its bearing
	members    []*Squad
	stage      Cell // where it gathers
	formedAt   int
	going      bool         // gathered, or tired of waiting: on to the goal
	pace       float64      // its slowest member's speed
	near       map[int]bool // members as near the stage as they can get, by id
	target     int          // the enemy its members fire on together, or 0
	leadBest   float64      // the nearest its leaders have got to the goal
	leadAt     int          // the tick they last got nearer
	huntTarget int          // the one its hunters go for: one the rest can't hurt, or 0
}

const (
	// forceCap is the most squads in one Task Force, so a big side splits
	// up and comes in from more than one side.
	forceCap = 4
	// minForce is the fewest squads a goal takes before more go elsewhere.
	minForce = 2
	// margin is how much more strength than the threat seen a goal wants,
	// times the mass weight.
	margin = 1.5
	// stageDist is how far from its goal, in cells, a Task Force gathers:
	// out of the threat there.
	stageDist = threatRadius + 2
	// contactReach is how far past its range, in cells, a member can be
	// from an enemy for its Task Force to pick that enemy as a target.
	contactReach = 2
	// gatherTicks is the longest a Task Force waits to gather or fill up.
	gatherTicks = 20 * TicksPerSecond
	// flankAngle is the turn, in radians, between Task Forces' bearings on
	// one goal.
	flankAngle = math.Pi / 3.5
)

// forms reports whether a goal is a Task Force's rather than one squad's.
func (k goalKind) forms() bool { return k == capture || k == kill || k == raid }

// forceKey picks out a Task Force across the Commander's passes: the job,
// and its place on it.
type forceKey struct {
	kind   goalKind
	target int
	cell   Cell
	n      int
}

func keyOf(g goal, n int) forceKey {
	k := forceKey{g.kind, g.target, g.cell, n}
	if g.target != 0 {
		k.cell = Cell{} // a target moves; it's the same job
	}
	return k
}

// form groups the squads the Commander gave each Task Force goal, forceCap
// at a time. A squad stays in the Task Force it was in, so one going in isn't
// pulled back to gather; new ones fill the free places in id order.
func (ai *AI) form(v View, goals []goal, on [][]*Squad) {
	forces := map[forceKey]*taskForce{}
	was := ai.forceOf
	ai.forceOf = map[int]*taskForce{}
	var order []forceKey // forces in the order they're made, for a fixed result
	for i, g := range goals {
		groups := map[int][]*Squad{}
		var fresh []*Squad
		for _, sq := range on[i] {
			if tf := was[sq.ID]; tf != nil && tf.goal.same(g) {
				groups[tf.n] = append(groups[tf.n], sq)
			} else {
				fresh = append(fresh, sq)
			}
		}
		for n := 0; len(fresh) > 0; n++ {
			k := min(forceCap-len(groups[n]), len(fresh))
			groups[n], fresh = append(groups[n], fresh[:k]...), fresh[k:]
		}
		for n := 0; n < len(on[i]); n++ {
			if len(groups[n]) == 0 {
				continue
			}
			k := keyOf(g, n)
			tf, fresh := ai.forces[k], false
			if tf == nil {
				tf, fresh = &taskForce{n: n, formedAt: v.Tick(), near: map[int]bool{}, leadBest: math.Inf(1)}, true
			}
			tf.goal, tf.members = g, groups[n]
			tf.pace = math.Inf(1)
			for _, sq := range tf.members {
				tf.pace = min(tf.pace, sq.speed)
				ai.forceOf[sq.ID] = tf
			}
			if fresh {
				ai.placeStage(v, tf)
			}
			forces[k] = tf
			order = append(order, k)
		}
	}
	ai.forces = forces

	// The Task Forces on a goal go in together: once all have gathered, or
	// once one has waited long enough. Decided before any is set going, so
	// the order they're looked at doesn't matter.
	var goIn []*taskForce
	for _, k := range order {
		tf := forces[k]
		if tf.going {
			continue
		}
		ready := true
		for _, o := range order {
			if f := forces[o]; f.goal.same(tf.goal) {
				ready = ready && (f.going || f.gathered())
			}
		}
		if ready || v.Tick()-tf.formedAt >= gatherTicks {
			goIn = append(goIn, tf)
		}
	}
	for _, tf := range goIn {
		tf.going = true
	}
}

// gathered is whether every member is at the stage, or as near as it can
// get.
func (tf *taskForce) gathered() bool {
	return !slices.ContainsFunc(tf.members, func(sq *Squad) bool {
		return dist(sq.Cell, tf.stage) > closeEnough && !tf.near[sq.ID]
	})
}

// placeStage picks where a Task Force gathers: stageDist from its goal,
// toward where its squads are, turned by its place on the goal. One already
// that near, or after a moving target, goes straight in.
func (ai *AI) placeStage(v View, tf *taskForce) {
	s := v.sim
	var x, y float64
	for _, sq := range tf.members {
		x, y = x+float64(sq.Cell.X), y+float64(sq.Cell.Y)
	}
	n := float64(len(tf.members))
	mid := Cell{int(math.Round(x / n)), int(math.Round(y / n))}
	urgent := v.Side == Defender && s.Hold > 0 // the attacker's hold timer is running: no time to gather
	if urgent || tf.goal.kind == kill || dist(mid, tf.goal.cell) <= stageDist+closeEnough {
		tf.going = true
		return
	}
	turn := flankAngle * float64((tf.n+1)/2)
	if tf.n%2 == 0 {
		turn = -turn
	}
	dx, dy := x/n-float64(tf.goal.cell.X), y/n-float64(tf.goal.cell.Y)
	l := math.Hypot(dx, dy)
	dx, dy = dx/l, dy/l
	dx, dy = dx*math.Cos(turn)-dy*math.Sin(turn), dx*math.Sin(turn)+dy*math.Cos(turn)
	want := Cell{tf.goal.cell.X + int(math.Round(dx*stageDist)), tf.goal.cell.Y + int(math.Round(dy*stageDist))}

	// A cell every member could stand on, up to 4 each way from that, kept near
	// stageDist from the goal: off a lake's far shore, not on its near one.
	best, bestScore, found := Cell{}, math.Inf(1), false
	for yy := want.Y - 4; yy <= want.Y+4; yy++ {
		for xx := want.X - 4; xx <= want.X+4; xx++ {
			c := Cell{xx, yy}
			if slices.ContainsFunc(tf.members, func(sq *Squad) bool { return !s.standable(sq, c) && c != sq.Cell }) {
				continue
			}
			if score := dist(c, want) + 2*math.Abs(dist(c, tf.goal.cell)-stageDist); score < bestScore { // ties keep the first found
				best, bestScore, found = c, score, true
			}
		}
	}
	if !found {
		tf.going = true
		return
	}
	tf.stage = best
}

// gather sends a Task Force member still gathering to its stage, and holds
// it there.
func (ai *AI) gather(v View, sq *Squad, p *plan, tf *taskForce) []Order {
	p.steps, p.sent = nil, false // its plan starts afresh once it goes in
	switch {
	case dist(sq.Cell, tf.stage) <= closeEnough:
		if len(sq.path) > 0 && sq.goal != tf.stage {
			return []Order{{Kind: Hold, Squad: sq.ID}}
		}
		return nil
	case p.moveTo == tf.stage && sq.goal == tf.stage:
		// Sent, and not stopped by a fight since (that resets moveTo).
		if len(sq.path) == 0 {
			tf.near[sq.ID] = true // as near as it can get
		}
		return nil
	}
	delete(tf.near, sq.ID)
	p.moveTo = tf.stage
	return []Order{{Kind: Move, Squad: sq.ID, Cell: tf.stage}}
}

// pickTarget names the enemy a Task Force's members fire on together, and
// the one its hunters (aircraft, in the base Mod) go for: one they fight at
// a better tier than any of its other members, if there is one. Each comes from the enemies in
// contact: one that fired on a member lately first, so the whole force
// answers; then the one it has; then the one most of its members can hurt;
// then the fewest left; then the nearest; then the lowest id.
func (ai *AI) pickTarget(v View, tf *taskForce, enemies []*Squad) {
	s := v.sim
	hurt := func(e *Squad) int {
		n := 0
		for _, sq := range tf.members {
			if s.tier(sq, e) != None {
				n++
			}
		}
		return n
	}
	// bestTier is the best rank any member hunter or not (as asked) has
	// against e; a lower rank is better.
	bestTier := func(e *Squad, hunter bool) int {
		r := math.MaxInt
		for _, sq := range tf.members {
			if (sq.tfRole == cs.UnitClassTaskForceRoleHunt) == hunter && s.tier(sq, e) != None {
				r = min(r, tierRank[s.tier(sq, e)])
			}
		}
		return r
	}
	// In contact: it fired on a member, or a member that can hurt it has it
	// nearly in range.
	contact := func(e *Squad) bool {
		return tf.shotBy(v, e) || slices.ContainsFunc(tf.members, func(sq *Squad) bool {
			return s.tier(sq, e) != None && dist(sq.Cell, e.Cell) <= sq.reach+contactReach
		})
	}
	near := func(e *Squad) float64 {
		d := math.Inf(1)
		for _, sq := range tf.members {
			d = min(d, dist(sq.Cell, e.Cell))
		}
		return d
	}
	first := func(ok bool) int {
		if ok {
			return 0
		}
		return 1
	}
	pick := func(fits func(*Squad) bool, current int) int {
		var best *Squad
		for _, e := range enemies { // in id order, so a tie keeps the lower id
			if !contact(e) || !fits(e) {
				continue
			}
			if best == nil || cmp.Or(
				cmp.Compare(first(tf.shotBy(v, e)), first(tf.shotBy(v, best))),
				cmp.Compare(first(e.ID == current), first(best.ID == current)),
				-cmp.Compare(hurt(e), hurt(best)),
				cmp.Compare(len(e.Members), len(best.Members)),
				cmp.Compare(near(e), near(best)),
			) < 0 {
				best = e
			}
		}
		if best == nil {
			return 0
		}
		return best.ID
	}
	tf.target = pick(func(*Squad) bool { return true }, tf.target)
	tf.huntTarget = pick(func(e *Squad) bool { return bestTier(e, true) < bestTier(e, false) }, tf.huntTarget)
}

// aim has a Task Force member fire on its force's target whenever it's in
// range: an attack order, while it goes on with its plan. A squad with an
// old target and nothing to aim at now is cleared back to the sim's pick. Breaking off to
// fight it won attackers 72–84% of Starting Kit Battles, as they took firing
// positions guards couldn't answer. With guards answering shooters off the
// leash, only the leaders breaking off still won big Battles 77–82%; see #65.
func (ai *AI) aim(v View, sq *Squad, tf *taskForce) []Order {
	s := v.sim
	t := 0
	if tf != nil {
		t = tf.target
		if sq.tfRole == cs.UnitClassTaskForceRoleHunt && tf.huntTarget != 0 {
			t = tf.huntTarget
		}
		if e := s.squad(t); e == nil || !e.alive() || !s.visible[v.Side][e.ID] || s.tier(sq, e) == None {
			t = 0
		}
	}
	if sq.target == t {
		return nil
	}
	return []Order{{Kind: Attack, Squad: sq.ID, Target: t}}
}

// followDist is how far behind its Task Force's leaders, in cells, a
// follower keeps on the way in.
const followDist = 3

// stallTicks is how long a Task Force's leaders can get no nearer the goal
// before its followers stop waiting for them.
const stallTicks = 2 * TicksPerSecond

// follow keeps a follower behind its Task Force's leaders (vehicles, in the
// base Mod) while they're getting nearer the goal: it waits while it's less
// than followDist further from the goal than the nearest leader, and moves
// on once it's a cell more than that behind. Once the leaders have got no
// nearer for stallTicks, to fight, at the goal or stuck, it comes on.
func (ai *AI) follow(v View, sq *Squad, p *plan, tf *taskForce) ([]Order, bool) {
	if sq.tfRole != cs.UnitClassTaskForceRoleFollow || sq.air {
		return nil, false
	}
	lead := math.Inf(1)
	for _, o := range tf.members {
		if o.tfRole == cs.UnitClassTaskForceRoleLead && !o.air && o.alive() {
			lead = min(lead, dist(o.Cell, tf.goal.cell))
		}
	}
	if lead < tf.leadBest-0.5 { // nearer: they're on the move
		tf.leadBest, tf.leadAt = lead, v.Tick()
	}
	if math.IsInf(lead, 1) || lead <= v.sim.rules.CaptureRadius || v.Tick()-tf.leadAt > stallTicks {
		p.waiting = false
		return nil, false // no leader, or they're there or stopped: on in
	}
	d := dist(sq.Cell, tf.goal.cell)
	switch {
	case d < lead+followDist:
		p.waiting = true
	case d > lead+followDist+1:
		p.waiting = false
	}
	if !p.waiting {
		return nil, false
	}
	p.sent = false // its plan sends it on afresh
	if len(sq.path) > 0 {
		return []Order{{Kind: Hold, Squad: sq.ID}}, true
	}
	return nil, true
}

// shotBy is whether e fired on one of the Task Force's members lately.
func (tf *taskForce) shotBy(v View, e *Squad) bool {
	return slices.ContainsFunc(tf.members, func(sq *Squad) bool { return sq.hitBy == e.ID && v.Tick()-sq.hitAt <= underFire })
}
