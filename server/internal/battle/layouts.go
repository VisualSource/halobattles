package battle

import (
	"container/heap"
	"maps"
	"math"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Layouts (#104; docs/specs/tactical-battle-spec.md#layouts): a hand-drawn
// lane plan a Battlefield is remixed from. It's drawn with the attacker's
// edge at the top (y 0) and the defender's at the bottom (y 1), each point
// a share of the map's width and height.

// GenerateLayout builds a Planet's Battlefield by remixing a layout: id's,
// else the Planet's, else one the seed picks among those that suit its
// Archetype and preset. See generate.
func GenerateLayout(c *cs.Content, rules cs.BattlefieldRules, planet *cs.PlanetBattlefield, seed uint64, faction, id string) *Field {
	if id == "" && planet != nil && planet.Layout != nil {
		id = string(*planet.Layout)
	}
	return generate(c, rules, planet, seed, faction, id)
}

// pickLayout is layout id, or one picked by weight among those that suit the
// archetype and preset (any, if none suit); false if there are none.
func pickLayout(c *cs.Content, id, archetype, preset string, rng *rand.Rand) (cs.Layout, bool) {
	if l, ok := c.Layouts[id]; ok {
		return l, true
	}
	var all, suit []cs.Layout
	for _, k := range slices.Sorted(maps.Keys(c.Layouts)) {
		l := c.Layouts[k]
		all = append(all, l)
		if (len(l.Archetypes) == 0 || slices.Contains(l.Archetypes, cs.LayoutArchetypesElem(archetype))) &&
			(len(l.Presets) == 0 || slices.Contains(l.Presets, cs.ID(preset))) {
			suit = append(suit, l)
		}
	}
	if len(suit) == 0 {
		suit = all
	}
	total := 0.0
	for _, l := range suit {
		total += layoutWeight(l)
	}
	r := rng.Float64() * total
	for _, l := range suit {
		if r -= layoutWeight(l); r < 0 {
			return l, true
		}
	}
	if len(suit) > 0 {
		return suit[len(suit)-1], true
	}
	return cs.Layout{}, false
}

func layoutWeight(l cs.Layout) float64 {
	if l.Weight != nil {
		return *l.Weight
	}
	return 1
}

// placer turns a layout's points into cells: turned so its bottom is the
// defender's edge, flipped if it was picked to be, and each point nudged by
// up to nudge cells, the same point by the same amount, so lanes and the
// places they join stay joined.
type placer struct {
	f      *Field
	edge   int
	mirror bool
	nudge  int
	rng    *rand.Rand
	moved  map[[2]float64]Cell
	lanes  []routedLeg // each lane's legs, routed before the terrain is molded to them
}

// routedLeg is one leg of a lane, between two of its points, as routed.
type routedLeg struct {
	cells []int
	width int
}

// float is where a layout point falls, in cells, unnudged.
func (p *placer) float(pt cs.Point) (float64, float64) {
	x, y := pt[0], pt[1]
	if p.mirror {
		x = 1 - x
	}
	w, h := float64(p.f.W-1), float64(p.f.H-1)
	switch p.edge { // y runs from the attacker's edge to the defender's
	case 0: // the defender's edge is the top
		return (1 - x) * w, (1 - y) * h
	case 1: // the right
		return y * w, x * h
	case 3: // the left
		return (1 - y) * w, (1 - x) * h
	}
	return x * w, y * h
}

// cell is where a layout point goes: nudged, on the map.
func (p *placer) cell(pt cs.Point) Cell {
	key := [2]float64{pt[0], pt[1]}
	if c, ok := p.moved[key]; ok {
		return c
	}
	x, y := p.float(pt)
	c := Cell{int(math.Round(x)) + p.rng.IntN(2*p.nudge+1) - p.nudge, int(math.Round(y)) + p.rng.IntN(2*p.nudge+1) - p.nudge}
	c = Cell{min(max(c.X, 0), p.f.W-1), min(max(c.Y, 0), p.f.H-1)}
	p.moved[key] = c
	return c
}

// inside is whether cell (x, y)'s middle is inside a layout area's shape.
func (p *placer) inside(shape []cs.Point, x, y int) bool {
	px, py := float64(x), float64(y)
	in := false
	for i, j := 0, len(shape)-1; i < len(shape); j, i = i, i+1 {
		xi, yi := p.float(shape[i])
		xj, yj := p.float(shape[j])
		if (yi > py) != (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}

// routeLanes lays each lane along the plan, before the terrain is molded
// to it: a smooth curve through its points (Catmull-Rom, so a bend is
// rounded, not a corner), as a line of cells each sharing a side with the
// next, so ground units can always pass along it. The ground is shaped to
// the lane, never the lane to the ground.
func (p *placer) routeLanes(lay cs.Layout) {
	for _, ln := range lay.Lanes {
		width := 2
		if ln.Width != nil {
			width = *ln.Width
		}
		pts := make([][2]float64, len(ln.Points))
		for i, pt := range ln.Points {
			c := p.cell(pt)
			pts[i] = [2]float64{float64(c.X), float64(c.Y)}
		}
		for k := 1; k < len(pts); k++ {
			p.lanes = append(p.lanes, routedLeg{p.curve(pts, k), width})
		}
	}
}

// curve is the cells along the Catmull-Rom curve from pts[k-1] to pts[k],
// each sharing a side with the next.
func (p *placer) curve(pts [][2]float64, k int) []int {
	at := func(i int) [2]float64 { return pts[min(max(i, 0), len(pts)-1)] }
	p0, p1, p2, p3 := at(k-2), at(k-1), at(k), at(k+1)
	point := func(t float64) (float64, float64) {
		t2, t3 := t*t, t*t*t
		f := func(a, b, c, d float64) float64 {
			return 0.5 * (2*b + (c-a)*t + (2*a-5*b+4*c-d)*t2 + (3*b-a-3*c+d)*t3)
		}
		return f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])
	}
	steps := int(4*math.Hypot(p2[0]-p1[0], p2[1]-p1[1])) + 1
	var cells []int
	last := Cell{-1, -1}
	for s := 0; s <= steps; s++ {
		x, y := point(float64(s) / float64(steps))
		c := Cell{min(max(int(math.Round(x)), 0), p.f.W-1), min(max(int(math.Round(y)), 0), p.f.H-1)}
		if c == last {
			continue
		}
		if last.X >= 0 && c.X != last.X && c.Y != last.Y { // a diagonal step: fill the corner, so it shares a side
			cells = append(cells, p.f.index(Cell{c.X, last.Y}))
		}
		cells = append(cells, p.f.index(c))
		last = c
	}
	return cells
}

// moldLanes shapes the noise to the plan, before the areas and the bands:
// along each routed lane, and round each pad, site and Landing Zone, the
// elevation is the middle of the lowest band every ground Unit Class can
// cross (level, walkable ground), easing back to the noise over the next
// moldReach cells, so hills, peaks and lakes sit between the lanes rather
// than on them, and nothing the plan places lands in water.
func (p *placer) moldLanes(lay cs.Layout, bands []cs.Band, walkable func(cs.Band) bool, elevation []float64) {
	k := slices.IndexFunc(bands, func(b cs.Band) bool { return walkable(b) && b.Height == 0 })
	if k < 0 {
		k = slices.IndexFunc(bands, walkable)
	}
	if k < 0 {
		return
	}
	lo := 0.0
	if k > 0 {
		lo = bands[k-1].UpTo
	}
	level := (lo + bands[k].UpTo) / 2
	// How far each cell is past the level ground's edge: a lane's half width
	// and a cell more, or 2 round a point; spread out by octile steps.
	far := make([]float64, len(elevation))
	for i := range far {
		far[i] = math.Inf(1)
	}
	h := &cellHeap{}
	seed := func(i int, core float64) {
		if -core < far[i] {
			far[i] = -core
			heap.Push(h, cellCost{i, -core})
		}
	}
	for _, lg := range p.lanes {
		for _, i := range lg.cells {
			seed(i, float64(lg.width)/2+1)
		}
	}
	spots := append(slices.Clone(lay.Pads), lay.Sites...)
	for _, z := range lay.LandingZones {
		spots = append(spots, z.At)
	}
	for _, pt := range spots {
		seed(p.f.index(p.cell(pt)), 2)
	}
	for h.Len() > 0 {
		cur := heap.Pop(h).(cellCost)
		if cur.cost > far[cur.i] || cur.cost >= moldReach {
			continue
		}
		c := p.f.cell(cur.i)
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				n := c.add(Cell{dx, dy})
				if (dx == 0 && dy == 0) || !p.f.inBounds(n) {
					continue
				}
				step := 1.0
				if dx != 0 && dy != 0 {
					step = math.Sqrt2
				}
				if ni := p.f.index(n); cur.cost+step < far[ni] {
					far[ni] = cur.cost + step
					heap.Push(h, cellCost{ni, far[ni]})
				}
			}
		}
	}
	for i, d := range far {
		if t := max(0, d/moldReach); t < 1 {
			t = t * t * (3 - 2*t) // eased, so the ground doesn't crease at the edge
			elevation[i] = level*(1-t) + elevation[i]*t
		}
	}
}

// moldReach is how far, in cells past a lane's edge, its level ground eases
// back into the noise.
const moldReach = 6.0

// shapeAreas sets the noise elevation inside each water, blocked or high
// area, so the preset's bands decide how they look: water the lowest band,
// blocked the top, high the band at its height.
func (p *placer) shapeAreas(lay cs.Layout, bands []cs.Band, elevation []float64) {
	mid := func(k int) float64 { // the middle of band k's share
		lo := 0.0
		if k > 0 {
			lo = bands[k-1].UpTo
		}
		return (lo + bands[k].UpTo) / 2
	}
	for _, a := range lay.Areas {
		k := -1
		switch a.Kind {
		case cs.LayoutAreasElemKindWater:
			k = 0
		case cs.LayoutAreasElemKindBlocked:
			k = len(bands) - 1
		case cs.LayoutAreasElemKindHigh:
			height := 1
			if a.Height != nil {
				height = *a.Height
			}
			k = slices.IndexFunc(bands, func(b cs.Band) bool { return b.Height == height })
		}
		if k < 0 {
			continue
		}
		for y := range p.f.H {
			for x := range p.f.W {
				if p.inside(a.Points, x, y) {
					elevation[p.f.index(Cell{x, y})] = mid(k)
				}
			}
		}
	}
}

// coverAreas turns walkable ground inside each cover area into the preset's
// point cover.
func (p *placer) coverAreas(lay cs.Layout, l *layout) {
	if l.cover < 0 {
		return
	}
	for _, a := range lay.Areas {
		if a.Kind != cs.LayoutAreasElemKindCover {
			continue
		}
		for y := range p.f.H {
			for x := range p.f.W {
				if i := p.f.index(Cell{x, y}); p.inside(a.Points, x, y) && l.onFoot(i) {
					p.f.Terrain[i] = uint8(l.cover)
				}
			}
		}
	}
}

// at places a fixture's grid with its middle at c, kept a cell inside the map.
func (p *placer) at(g grid, c Cell) Cell {
	return Cell{min(max(c.X-g.w/2, 1), p.f.W-g.w-1), min(max(c.Y-g.h/2, 1), p.f.H-g.h-1)}
}

// paintLanes paints each lane's routed legs, width cells wide, cleared
// where a ground Unit Class can't cross, but a fixture's cells and pads,
// which stay as drawn. It returns each leg as it winds, in steps of a few
// cells, for the Lab's overlay.
func (l *layout) paintLanes(p *placer) [][2]Cell {
	fix := func(i int) {
		if !l.all(i) {
			l.clear(i)
		}
	}
	var legs [][2]Cell
	for _, lg := range p.lanes {
		l.paint(lg.cells, lg.width, l.lane, fix)
		for k := 0; k < len(lg.cells)-1; k += 3 {
			legs = append(legs, [2]Cell{l.f.cell(lg.cells[k]), l.f.cell(lg.cells[min(k+3, len(lg.cells)-1)])})
		}
	}
	return legs
}

// spot is the cell nearest c, within r, that ok accepts; false if none.
func (l *layout) spot(c Cell, r int, ok func(i int) bool) (Cell, bool) {
	best, bestD := Cell{}, math.MaxInt
	for y := c.Y - r; y <= c.Y+r; y++ {
		for x := c.X - r; x <= c.X+r; x++ {
			if b := (Cell{x, y}); l.in(b) && ok(l.f.index(b)) && dist2(b, c) < bestD {
				best, bestD = b, dist2(b, c)
			}
		}
	}
	return best, bestD < math.MaxInt
}

// placeLayoutSpots puts each layout point on the nearest cell, within 6, every ground
// Unit Class can reach, off the lanes and the Landing Zones' ground, and
// clear of those already placed (pads and sites keep apart); a point with
// none near goes unplaced.
func (l *layout) placeLayoutSpots(p *placer, pts []cs.Point, placed []Cell) []Cell {
	reached := l.reachAll()
	var out []Cell
	for _, pt := range pts {
		c, ok := l.spot(p.cell(pt), 6, func(i int) bool {
			b := l.f.cell(i)
			return reached[i] && !l.zone[i] && !l.fixed[i] && !l.lane[i] && !l.besideLane(b) && !l.near(b, placed, out)
		})
		if ok {
			out = append(out, c)
		}
	}
	return out
}
