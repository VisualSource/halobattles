package battle

import (
	"math"
	"slices"
)

// A Task Force is a few of a side's squads that the Commander gives one goal
// (ADR 0007): they gather out of the goal's threat, then go in together at
// the slowest one's pace. A goal that needs more than forceCap squads gets
// more Task Forces, each gathering on its own bearing, which go in together.
type taskForce struct {
	goal     goal
	n        int // its place among the Task Forces on the goal: picks its bearing
	members  []*Squad
	stage    Cell // where it gathers
	formedAt int
	going    bool         // gathered, or tired of waiting: on to the goal
	pace     float64      // its slowest member's speed
	near     map[int]bool // members as near the stage as they can get, by id
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
				tf, fresh = &taskForce{n: n, formedAt: v.Tick(), near: map[int]bool{}}, true
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

	// The nearest cell to that every member could stand on.
	best, found := Cell{}, false
	for r := 0; r <= 4 && !found; r++ {
		for yy := want.Y - r; yy <= want.Y+r; yy++ {
			for xx := want.X - r; xx <= want.X+r; xx++ {
				c := Cell{xx, yy}
				if (found && dist2(c, want) >= dist2(best, want)) ||
					slices.ContainsFunc(tf.members, func(sq *Squad) bool { return !s.standable(sq, c) && c != sq.Cell }) {
					continue
				}
				best, found = c, true
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
