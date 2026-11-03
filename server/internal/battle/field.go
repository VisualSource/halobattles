// Package battle runs tactical Battles: the Battlefield they're fought on
// and, later, the sim. See docs/specs/tactical-battle-spec.md.
package battle

import (
	"cmp"
	"math/rand/v2"
	"slices"
	"strings"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Cell is a grid position; X runs along the width.
type Cell struct{ X, Y int }

// Field is a Battlefield: a grid of Terrains and height levels, row by row,
// its Landing Zones (Points), the defender's base, and what the generator
// laid out round them.
type Field struct {
	W, H      int
	Terrains  []string // Terrain ids, sorted; a cell holds an index into this
	Terrain   []uint8
	Height    []uint8
	Archetype string // the Battlefield Archetype it was shaped by
	Points    []Cell // Landing Zones
	Pads      []Cell // build pads
	// Starts are the Landing Zones an attacker may land at, the farther half
	// from the base; each Battle's seed picks one.
	Starts []Cell
	Sites  []Cell // building sites, the base's
	// CommandPost is the defender's objective structure's cell, in its base;
	// UnitStarts are where its Stacks deploy, Stack 1 first.
	CommandPost Cell
	UnitStarts  []Cell
	lane        []bool // main lane cells, for tests
	side        []bool // side lane cells, for tests
}

func (f *Field) index(c Cell) int { return c.Y*f.W + c.X }

func (f *Field) cell(i int) Cell { return Cell{i % f.W, i / f.W} }

// Generate builds a Planet's Battlefield for a neutral garrison: the
// tests' shorthand, since the game and the Lab call GenerateFor.
func Generate(c *cs.Content, rules cs.BattlefieldRules, planet *cs.PlanetBattlefield, seed uint64) *Field {
	return GenerateFor(c, rules, planet, seed, "")
}

// GenerateFor builds a Planet's Battlefield from the Ruleset's defaults and
// the Planet's own overrides, if any, with the defending Faction's base (""
// for a neutral garrison). The same inputs give the same Field.
//
// Each stage draws from its own PCG stream, numbered in the order they were
// added: 1 elevation, 2 moisture, 3 Landing Zones, 6 (attacker starts,
// unused since #99), 7 point cover, 8 archetype and base edge, 9 base, 10
// features, 11 river fords and ruins. A new stage takes the next number.
func GenerateFor(c *cs.Content, rules cs.BattlefieldRules, planet *cs.PlanetBattlefield, seed uint64, faction string) *Field {
	presetID, w, h := string(rules.TerrainPreset), rules.Width, rules.Height
	if planet != nil {
		if planet.TerrainPreset != nil {
			presetID = string(*planet.TerrainPreset)
		}
		w, h = cmp.Or(deref(planet.Width), w), cmp.Or(deref(planet.Height), h)
	}
	preset := c.TerrainPresets[presetID]
	f := &Field{W: w, H: h, Terrain: make([]uint8, w*h), Height: make([]uint8, w*h)}

	shape := rand.New(rand.NewPCG(seed, 8))
	f.Archetype = pickArchetype(preset, planet, shape)
	edge := shape.IntN(4) // the defender's end: its base is in the third by it
	baseRng, featureRng := rand.New(rand.NewPCG(seed, 9)), rand.New(rand.NewPCG(seed, 10))
	base, ok := weighted(fixturesFor(c, cs.FixtureKindBase, f.Archetype, faction), baseRng)
	if !ok {
		base = plainBase
	}
	var features []cs.Fixture
	for range 1 + featureRng.IntN(3) {
		if fx, ok := weighted(fixturesFor(c, cs.FixtureKindFeature, f.Archetype, faction), featureRng); ok {
			features = append(features, fx)
		}
	}

	ids := []string{string(preset.Clear.Terrain)}
	if preset.PointCover != nil {
		ids = append(ids, string(*preset.PointCover))
	}
	for _, b := range preset.Bands {
		for _, t := range b.Terrains {
			ids = append(ids, string(t.Terrain))
		}
	}
	ids = append(ids, fixtureTerrains(append([]cs.Fixture{base}, features...)...)...)
	slices.Sort(ids)
	f.Terrains = slices.Compact(ids)
	terrain := func(id cs.ID) uint8 {
		i, _ := slices.BinarySearch(f.Terrains, string(id))
		return uint8(i)
	}

	elevation := f.ranked(preset.Noise, newPerlin(rand.New(rand.NewPCG(seed, 1))))
	moisture := f.ranked(preset.Noise, newPerlin(rand.New(rand.NewPCG(seed, 2))))
	f.shapeElevation(elevation, f.Archetype, edge, shape)
	for i := range f.Terrain {
		b := preset.Bands[slices.IndexFunc(preset.Bands, func(b cs.Band) bool { return elevation[i] <= b.UpTo })]
		t := b.Terrains[slices.IndexFunc(b.Terrains, func(t cs.BandTerrain) bool { return moisture[i] <= t.UpTo })]
		f.Terrain[i], f.Height[i] = terrain(t.Terrain), uint8(b.Height)
	}

	cover := -1
	if preset.PointCover != nil {
		cover = int(terrain(*preset.PointCover))
	}
	l := newLayout(c, f, string(rules.PathClass), terrain(preset.Clear.Terrain), uint8(preset.Clear.Height), cover)
	detail := rand.New(rand.NewPCG(seed, 11))
	switch f.Archetype {
	case River:
		l.riverFords(edge, detail)
	case Ruins:
		l.ruinBlocks(detail)
	}

	// The base, in the third of the map by the defender's edge; the features
	// in open ground between, clear of it and of the edges.
	taken := make([]bool, w*h)
	rot, mirror := orient(base, baseRng)
	g := fixtureGrid(base, rot, mirror)
	o, ok := l.place(g, taken, func(mid Cell) bool { return f.towardBase(mid, edge) >= 0.72 }, baseRng)
	if !ok { // too small a map for it: the plain base, wherever it fits
		base, g = plainBase, fixtureGrid(plainBase, 0, false)
		o, _ = l.place(g, taken, func(Cell) bool { return true }, baseRng)
	}
	got := l.stamp(base, g, o, terrain)
	l.take(g, o, 4, taken)
	for _, fx := range features {
		rot, mirror := orient(fx, featureRng)
		g := fixtureGrid(fx, rot, mirror)
		between := func(mid Cell) bool { t := f.towardBase(mid, edge); return t > 0.15 && t < 0.8 }
		if o, ok := l.place(g, taken, between, featureRng); ok {
			st := l.stamp(fx, g, o, terrain)
			got.pads = append(got.pads, st.pads...)
			l.take(g, o, 3, taken)
		}
	}
	f.CommandPost, f.UnitStarts = got.post, got.starts

	passable := make([]bool, len(f.Terrains))
	for i, id := range f.Terrains {
		_, passable[i] = c.Terrains[id].Movement[string(rules.PathClass)]
	}
	open := func(i int) bool { return passable[f.Terrain[i]] }
	clear := func(i int) { f.Terrain[i], f.Height[i] = terrain(preset.Clear.Terrain), uint8(preset.Clear.Height) }
	// Every edge strip (Retreats leave by them) and the Command Post joined to the main region.
	main := f.largestRegion(open)
	strips := f.edgeStrips(rules.DeployDepth)
	for _, strip := range append(strips[:], []int{f.index(f.CommandPost)}) {
		if !slices.ContainsFunc(strip, func(i int) bool { return main[i] }) {
			f.carve(main, strip, open, clear)
			main = f.largestRegion(open)
		}
	}

	f.Points = f.placeLandingZones(main, rules.ControlPoints, rules.ControlPointSpacing, rules.DeployDepth+3, f.CommandPost, edge, rand.New(rand.NewPCG(seed, 3)))
	f.Starts = attackerStarts(f.Points, f.CommandPost)
	area, width := 3, 2
	if rules.PointArea != nil {
		area = *rules.PointArea
	}
	if rules.LaneWidth != nil {
		width = *rules.LaneWidth
	}
	l.shapePoints(area, rand.New(rand.NewPCG(seed, 7)))
	l.mainLanes([]Cell{f.CommandPost}, area, width) // the base's lane to its nearest Landing Zone
	f.Sites = got.sites
	f.Pads = got.pads[:min(len(got.pads), rules.BuildPads)]
	f.Pads = append(f.Pads, l.placePads(max(0, rules.BuildPads-len(f.Pads)), area, f.Starts, f.Sites)...)
	f.lane, f.side = l.lane, l.side
	return f
}

func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// ranked samples noise at every cell and replaces each value with its rank,
// as a share of the cells in (0, 1], so a preset's thresholds are shares of
// the map.
func (f *Field) ranked(n cs.Noise, p *perlin) []float64 {
	scale := n.Frequency / float64(f.W)
	raw := make([]float64, f.W*f.H)
	for i := range raw {
		c := f.cell(i)
		raw[i] = p.octaves(float64(c.X)*scale, float64(c.Y)*scale, n.Octaves, n.Persistence)
	}
	order := make([]int, len(raw))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int { return cmp.Compare(raw[a], raw[b]) })
	out := make([]float64, len(raw))
	for rank, i := range order {
		out[i] = float64(rank+1) / float64(len(raw))
	}
	return out
}

// neighbours4 calls fn with each in-bounds cell sharing an edge with i.
// Reachability uses these alone: a diagonal step between two blocked cells
// isn't allowed, so the result is the same.
func (f *Field) neighbours4(i int, fn func(int)) {
	c := f.cell(i)
	if c.X > 0 {
		fn(i - 1)
	}
	if c.X < f.W-1 {
		fn(i + 1)
	}
	if c.Y > 0 {
		fn(i - f.W)
	}
	if c.Y < f.H-1 {
		fn(i + f.W)
	}
}

// largestRegion marks the biggest group of connected open cells; ties go to
// the group with the lowest cell.
func (f *Field) largestRegion(open func(int) bool) []bool {
	region := make([]int, f.W*f.H) // 0: unvisited or blocked
	best, bestSize, next := 0, 0, 0
	for start := range region {
		if region[start] != 0 || !open(start) {
			continue
		}
		next++
		queue, size := []int{start}, 0
		region[start] = next
		for len(queue) > 0 {
			i := queue[0]
			queue = queue[1:]
			size++
			f.neighbours4(i, func(n int) {
				if region[n] == 0 && open(n) {
					region[n] = next
					queue = append(queue, n)
				}
			})
		}
		if size > bestSize {
			best, bestSize = next, size
		}
	}
	out := make([]bool, len(region))
	for i, r := range region {
		out[i] = r != 0 && r == best
	}
	return out
}

// edgeStrips lists the cells within depth of each edge: top, right, bottom,
// left.
func (f *Field) edgeStrips(depth int) [4][]int {
	var strips [4][]int
	for i := range f.W * f.H {
		c := f.cell(i)
		for e, in := range [4]bool{c.Y < depth, c.X >= f.W-depth, c.Y >= f.H-depth, c.X < depth} {
			if in {
				strips[e] = append(strips[e], i)
			}
		}
	}
	return strips
}

// carve clears the fewest blocked cells that join the main region to a
// strip: a 0-1 breadth-first search where only blocked cells cost.
func (f *Field) carve(main []bool, strip []int, open func(int) bool, clear func(int)) {
	const unseen = -2
	from := make([]int, len(main))
	dist := make([]int, len(main))
	for i := range from {
		from[i], dist[i] = unseen, len(main)
	}
	var deque []int
	for i, m := range main {
		if m {
			from[i], dist[i] = -1, 0
			deque = append(deque, i)
		}
	}
	target := slices.Clone(strip)
	slices.Sort(target)
	for len(deque) > 0 {
		i := deque[0]
		deque = deque[1:]
		if _, in := slices.BinarySearch(target, i); in {
			for ; i >= 0 && !main[i]; i = from[i] {
				if !open(i) {
					clear(i)
				}
			}
			return
		}
		f.neighbours4(i, func(n int) {
			cost := 0
			if !open(n) {
				cost = 1
			}
			if d := dist[i] + cost; d < dist[n] {
				dist[n], from[n] = d, i
				if cost == 0 {
					deque = append([]int{n}, deque...)
				} else {
					deque = append(deque, n)
				}
			}
		})
	}
}

func dist2(a, b Cell) int { return (a.X-b.X)*(a.X-b.X) + (a.Y-b.Y)*(a.Y-b.Y) }

// String draws the Field for debugging: each Terrain's first letter,
// upper case on high ground, Control Points as digits and build pads as #.
func (f *Field) String() string {
	var sb strings.Builder
	for i := range f.Terrain {
		c := f.cell(i)
		if p := slices.Index(f.Points, c); p >= 0 {
			sb.WriteByte(byte('1' + p))
		} else if slices.Contains(f.Pads, c) {
			sb.WriteByte('#')
		} else {
			_, name, _ := strings.Cut(f.Terrains[f.Terrain[i]], ":")
			ch := name[0]
			if f.Height[i] > 0 {
				ch -= 'a' - 'A'
			}
			sb.WriteByte(ch)
		}
		if c.X == f.W-1 {
			sb.WriteByte('\n')
		}
	}
	return sb.String()
}
