package battle

import (
	"cmp"
	"maps"
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
	zone   []bool // start zones and point areas: kept free of sites and pads
	fixed  []bool // fixture cells: hand-made, so lanes go round them and leave them as drawn
	padAt  []bool // fixtures' pads: a lane never runs over one
}

const (
	// keepApart is the fewest cells between two sites or pads.
	keepApart = 3
)

func newLayout(c *cs.Content, f *Field, pathClass string, clearT, clearH uint8, cover int) *layout {
	l := &layout{f: f, clearT: clearT, clearH: clearH, cover: cover,
		lane: make([]bool, f.W*f.H), zone: make([]bool, f.W*f.H), fixed: make([]bool, f.W*f.H), padAt: make([]bool, f.W*f.H)}
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

// besideLane is whether c touches a lane, so a building
// there would narrow it.
func (l *layout) besideLane(c Cell) bool {
	for y := c.Y - 1; y <= c.Y+1; y++ {
		for x := c.X - 1; x <= c.X+1; x++ {
			if b := (Cell{x, y}); l.in(b) && l.lane[l.f.index(b)] {
				return true
			}
		}
	}
	return false
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
