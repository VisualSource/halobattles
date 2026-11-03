package battle

import (
	"cmp"
	"container/heap"
	"maps"
	"math"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// layout shapes a Field once the noise terrain is down (#64, #99): river
// fords and ruin blocks for those archetypes, the fixtures stamped in (see
// fixtures.go), clear ground round each Landing Zone with cover at its edge,
// main lanes every ground Unit Class can travel joining the Landing Zones
// and the base, and build pads beside them.
type layout struct {
	f      *Field
	ground [][]bool // per ground Unit Class, by Terrain index: whether it can cross it
	foot   []bool   // the same for the Ruleset's path class (Infantry)
	clearT uint8    // the preset's clear Terrain, and its height
	clearH uint8
	cover  int    // the preset's point cover Terrain, or -1
	lane   []bool // main lane cells
	side   []bool // side lane cells
	zone   []bool // start zones and point areas: kept free of sites and pads
	fixed  []bool // fixture cells: hand-made, so lanes go round them and leave them as drawn
	padAt  []bool // fixtures' pads: a lane never runs over one
}

const (
	// padReach is how far from its Landing Zone, in cells, a build pad can be.
	padReach = 8
	// keepApart is the fewest cells between two sites or pads.
	keepApart = 3
)

func newLayout(c *cs.Content, f *Field, pathClass string, clearT, clearH uint8, cover int) *layout {
	l := &layout{f: f, clearT: clearT, clearH: clearH, cover: cover,
		lane: make([]bool, f.W*f.H), side: make([]bool, f.W*f.H), zone: make([]bool, f.W*f.H), fixed: make([]bool, f.W*f.H), padAt: make([]bool, f.W*f.H)}
	crosses := func(class string) []bool {
		ok := make([]bool, len(f.Terrains))
		for i, id := range f.Terrains {
			_, ok[i] = c.Terrains[id].Movement[class]
		}
		return ok
	}
	for _, id := range slices.Sorted(maps.Keys(c.UnitClasses)) {
		if uc := c.UnitClasses[id]; uc.Air == nil || !*uc.Air {
			if ok := crosses(id); slices.Contains(ok, true) { // a class that moves on the ground
				l.ground = append(l.ground, ok)
			}
		}
	}
	l.foot = crosses(pathClass)
	return l
}

// all is whether every ground Unit Class can cross cell i.
func (l *layout) all(i int) bool {
	return !slices.ContainsFunc(l.ground, func(ok []bool) bool { return !ok[l.f.Terrain[i]] })
}

func (l *layout) onFoot(i int) bool { return l.foot[l.f.Terrain[i]] }

// clear turns cell i into the clear Terrain, at the clear height where it
// was ground the path class couldn't cross (water, peaks), else its own.
func (l *layout) clear(i int) {
	if !l.onFoot(i) {
		l.f.Height[i] = l.clearH
	}
	l.f.Terrain[i] = l.clearT
}

func (l *layout) in(c Cell) bool { return c.X >= 0 && c.Y >= 0 && c.X < l.f.W && c.Y < l.f.H }

// shapePoints clears the ground within radius of each Control Point, level
// with the point, and scatters the point cover Terrain over about a third
// of the ring just outside, as cover for its guards.
func (l *layout) shapePoints(radius int, rng *rand.Rand) {
	f := l.f
	r := float64(radius)
	for _, p := range f.Points {
		h := f.Height[f.index(p)]
		for y := p.Y - radius - 2; y <= p.Y+radius+2; y++ {
			for x := p.X - radius - 2; x <= p.X+radius+2; x++ {
				c := Cell{x, y}
				if !l.in(c) || l.fixed[f.index(c)] { // a fixture keeps what it was drawn with
					continue
				}
				i, d := f.index(c), dist(c, p)
				switch {
				case d <= r+1.5 && d > r-1.5 && l.cover >= 0 && rng.IntN(3) == 0:
					if !l.onFoot(i) || d <= r {
						f.Height[i] = h
					}
					f.Terrain[i] = uint8(l.cover)
					l.zone[i] = l.zone[i] || d <= r
				case d <= r:
					f.Terrain[i], f.Height[i] = l.clearT, h
					l.zone[i] = true
				}
			}
		}
	}
}

// route is the cheapest 4-way path from a to b, by cost per cell entered.
func (l *layout) route(a, b Cell, cost func(i int) float64) []int {
	f := l.f
	n := f.W * f.H
	g, from := make([]float64, n), make([]int, n)
	for i := range g {
		g[i], from[i] = math.Inf(1), -1
	}
	start, goal := f.index(a), f.index(b)
	g[start] = 0
	open := &cellHeap{{start, 0}}
	for open.Len() > 0 {
		cur := heap.Pop(open).(cellCost)
		if cur.i == goal {
			break
		}
		if cur.cost > g[cur.i] {
			continue
		}
		f.neighbours4(cur.i, func(nb int) {
			if c := g[cur.i] + cost(nb); c < g[nb] {
				g[nb], from[nb] = c, cur.i
				heap.Push(open, cellCost{nb, c})
			}
		})
	}
	var path []int
	for i := goal; i >= 0; i = from[i] {
		path = append(path, i)
		if i == start {
			break
		}
	}
	slices.Reverse(path)
	return path
}

type cellCost struct {
	i    int
	cost float64
}

// cellHeap is a min-heap of cells by cost; ties go to the lower cell, so
// routes don't depend on the order cells were pushed.
type cellHeap []cellCost

func (h cellHeap) Len() int { return len(h) }
func (h cellHeap) Less(a, b int) bool {
	return cmp.Or(cmp.Compare(h[a].cost, h[b].cost), cmp.Compare(h[a].i, h[b].i)) < 0
}
func (h cellHeap) Swap(a, b int) { h[a], h[b] = h[b], h[a] }
func (h *cellHeap) Push(x any)   { *h = append(*h, x.(cellCost)) }
func (h *cellHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

// paint marks a path width cells wide, and fixes each cell it covers but
// a fixture's, which stays as it was drawn; never a fixture's pad.
func (l *layout) paint(path []int, width int, mark []bool, fix func(i int)) {
	for _, i := range path {
		c := l.f.cell(i)
		for dy := range width {
			for dx := range width {
				if b := c.add(Cell{dx, dy}); l.in(b) && !l.padAt[l.f.index(b)] {
					j := l.f.index(b)
					mark[j] = true
					if !l.fixed[j] {
						fix(j)
					}
				}
			}
		}
	}
}

// mainLanes joins the Control Points with the shortest lanes that link
// them all (a spanning tree), then closes them into a ring, so guards can
// go round the points, and joins each attacker start to its nearest point.
// Each lane is width cells wide, and anything on it a ground Unit Class
// can't cross is cleared, so vehicles and infantry can reach every point.
// A lane follows open ground where it can, and an earlier lane where that's
// cheaper.
func (l *layout) mainLanes(starts []Cell, area, width int) {
	f := l.f
	cost := func(i int) float64 {
		switch {
		case l.padAt[i]:
			return 500
		case l.fixed[i]:
			return 50 // round a fixture where there's a way
		case l.lane[i]:
			return 0.5
		case l.all(i):
			return 1
		case l.onFoot(i):
			return 4
		}
		return 12
	}
	fix := func(i int) {
		if !l.all(i) {
			l.clear(i)
		}
	}
	linked := map[[2]int]bool{}
	// A link keeps off the other points' ground, so it joins its two
	// directly rather than through a third.
	link := func(a, b int) {
		if a == b || linked[[2]int{min(a, b), max(a, b)}] {
			return
		}
		linked[[2]int{min(a, b), max(a, b)}] = true
		l.paint(l.route(f.Points[a], f.Points[b], func(i int) float64 {
			for k, p := range f.Points {
				if k != a && k != b && dist(f.cell(i), p) <= float64(area+width) {
					return 50
				}
			}
			return cost(i)
		}), width, l.lane, fix)
	}
	joined := []int{0}
	for len(joined) < len(f.Points) { // Prim's, by straight-line distance
		bestA, bestB, bestD := -1, -1, math.MaxInt
		for _, a := range joined {
			for b := range f.Points {
				if !slices.Contains(joined, b) && dist2(f.Points[a], f.Points[b]) < bestD {
					bestA, bestB, bestD = a, b, dist2(f.Points[a], f.Points[b])
				}
			}
		}
		link(bestA, bestB)
		joined = append(joined, bestB)
	}
	// The ring: the points in turn round their middle, each to the next.
	if len(f.Points) > 2 {
		var mx, my float64
		for _, p := range f.Points {
			mx, my = mx+float64(p.X), my+float64(p.Y)
		}
		mx, my = mx/float64(len(f.Points)), my/float64(len(f.Points))
		ring := make([]int, len(f.Points))
		for i := range ring {
			ring[i] = i
		}
		angle := func(i int) float64 { return math.Atan2(float64(f.Points[i].Y)-my, float64(f.Points[i].X)-mx) }
		slices.SortStableFunc(ring, func(a, b int) int { return cmp.Compare(angle(a), angle(b)) })
		for k, a := range ring {
			link(a, ring[(k+1)%len(ring)])
		}
	}
	for _, s := range starts {
		if len(f.Points) == 0 {
			break
		}
		p := slices.MinFunc(f.Points, func(a, b Cell) int { return cmp.Compare(dist2(s, a), dist2(s, b)) })
		l.paint(l.route(s, p, cost), width, l.lane, fix)
	}
}

// fromStarts is how far each cell is from the nearest attacker start, in
// straight-line cells.
func fromStarts(c Cell, starts []Cell) float64 {
	d := math.Inf(1)
	for _, s := range starts {
		d = min(d, dist(c, s))
	}
	return d
}

// reachAll marks the cells every ground Unit Class can reach from the
// first Control Point.
func (l *layout) reachAll() []bool {
	f := l.f
	out := make([]bool, f.W*f.H)
	if len(f.Points) == 0 {
		return out
	}
	start := f.index(f.Points[0])
	out[start] = true
	queue := []int{start}
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		f.neighbours4(i, func(n int) {
			if !out[n] && l.all(n) {
				out[n] = true
				queue = append(queue, n)
			}
		})
	}
	return out
}

// near is whether c is within keepApart of any of the cells given.
func (l *layout) near(c Cell, a, b []Cell) bool {
	close := func(o Cell) bool { return dist2(o, c) < keepApart*keepApart }
	return slices.ContainsFunc(a, close) || slices.ContainsFunc(b, close)
}

// placePads picks n build pads, dealt round the Control Points in turn:
// beside a main lane (2 cells off it, clear of every lane), between the
// point's clear ground and padReach from it, on ground every ground Unit
// Class can reach, as far from the attacker starts as it can be. Where
// none fits by its point, it goes by the next point with room.
func (l *layout) placePads(n, area int, starts, sites []Cell) []Cell {
	f := l.f
	if len(f.Points) == 0 {
		return nil
	}
	// Beside a lane: 2 cells off one, with a clear cell between, so a turret
	// never narrows a lane, main or side.
	reached := l.reachAll()
	beside, touching := make([]bool, f.W*f.H), make([]bool, f.W*f.H)
	for i := range l.lane {
		if !l.lane[i] && !l.side[i] {
			continue
		}
		c := f.cell(i)
		for y := c.Y - 2; y <= c.Y+2; y++ {
			for x := c.X - 2; x <= c.X+2; x++ {
				if b := (Cell{x, y}); l.in(b) {
					if l.lane[i] {
						beside[f.index(b)] = true
					}
					if abs(x-c.X) <= 1 && abs(y-c.Y) <= 1 {
						touching[f.index(b)] = true
					}
				}
			}
		}
	}
	var pads []Cell
	for k := range n {
		// Its own point first; where that has no room, the next one that does.
		best, bestScore, found := Cell{}, math.Inf(-1), false
		for try := 0; try < len(f.Points) && !found; try++ {
			p := f.Points[(k+try)%len(f.Points)]
			for y := p.Y - padReach; y <= p.Y+padReach; y++ {
				for x := p.X - padReach; x <= p.X+padReach; x++ {
					c := Cell{x, y}
					if !l.in(c) {
						continue
					}
					i, d := f.index(c), dist(c, p)
					if d <= float64(area) || d > padReach || !beside[i] || touching[i] || !reached[i] || l.zone[i] || l.near(c, pads, sites) {
						continue
					}
					if score := fromStarts(c, starts) - 0.25*d; score > bestScore {
						best, bestScore, found = c, score, true
					}
				}
			}
		}
		if found {
			pads = append(pads, best)
		}
	}
	return pads
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
