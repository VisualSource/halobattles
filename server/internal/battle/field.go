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
// and its Control Points.
type Field struct {
	W, H     int
	Terrains []string // Terrain ids, sorted; a cell holds an index into this
	Terrain  []uint8
	Height   []uint8
	Points   []Cell
	Pads     []Cell // build pads
}

func (f *Field) index(c Cell) int { return c.Y*f.W + c.X }

func (f *Field) cell(i int) Cell { return Cell{i % f.W, i / f.W} }

// Generate builds a Planet's Battlefield from the Ruleset's defaults and the
// Planet's own overrides, if any. The same inputs give the same Field.
func Generate(c *cs.Content, rules cs.BattlefieldRules, planet *cs.PlanetBattlefield, seed uint64) *Field {
	presetID, w, h := string(rules.TerrainPreset), rules.Width, rules.Height
	if planet != nil {
		if planet.TerrainPreset != nil {
			presetID = string(*planet.TerrainPreset)
		}
		w, h = cmp.Or(deref(planet.Width), w), cmp.Or(deref(planet.Height), h)
	}
	preset := c.TerrainPresets[presetID]
	f := &Field{W: w, H: h, Terrain: make([]uint8, w*h), Height: make([]uint8, w*h)}

	ids := []string{string(preset.Clear.Terrain)}
	for _, b := range preset.Bands {
		for _, t := range b.Terrains {
			ids = append(ids, string(t.Terrain))
		}
	}
	slices.Sort(ids)
	f.Terrains = slices.Compact(ids)
	terrain := func(id cs.ID) uint8 {
		i, _ := slices.BinarySearch(f.Terrains, string(id))
		return uint8(i)
	}

	elevation := f.ranked(preset.Noise, newPerlin(rand.New(rand.NewPCG(seed, 1))))
	moisture := f.ranked(preset.Noise, newPerlin(rand.New(rand.NewPCG(seed, 2))))
	for i := range f.Terrain {
		b := preset.Bands[slices.IndexFunc(preset.Bands, func(b cs.Band) bool { return elevation[i] <= b.UpTo })]
		t := b.Terrains[slices.IndexFunc(b.Terrains, func(t cs.BandTerrain) bool { return moisture[i] <= t.UpTo })]
		f.Terrain[i], f.Height[i] = terrain(t.Terrain), uint8(b.Height)
	}

	passable := make([]bool, len(f.Terrains))
	for i, id := range f.Terrains {
		_, passable[i] = c.Terrains[id].Movement[string(rules.PathClass)]
	}
	open := func(i int) bool { return passable[f.Terrain[i]] }
	clear := func(i int) { f.Terrain[i], f.Height[i] = terrain(preset.Clear.Terrain), uint8(preset.Clear.Height) }

	main := f.largestRegion(open)
	for _, strip := range f.edgeStrips(rules.DeployDepth) {
		if !slices.ContainsFunc(strip, func(i int) bool { return main[i] }) {
			f.carve(main, strip, open, clear)
			main = f.largestRegion(open)
		}
	}
	f.Points = f.placePoints(main, rules.ControlPoints, rules.ControlPointSpacing, rand.New(rand.NewPCG(seed, 3)))
	f.Pads = f.placePads(main, rules.BuildPads, rules.DeployDepth, rand.New(rand.NewPCG(seed, 5)))
	return f
}

// padSpacing is the fewest cells between a build pad and a Control Point or
// another pad.
const padSpacing = 6

// placePads picks build pads in the main region, clear of the edges (where
// attackers deploy) and spaced from the Control Points and each other. Where
// they don't all fit, it places what it can.
func (f *Field) placePads(main []bool, n, edge int, rng *rand.Rand) []Cell {
	margin := edge + 2
	var candidates []Cell
	for i, m := range main {
		c := f.cell(i)
		if m && c.X >= margin && c.Y >= margin && c.X < f.W-margin && c.Y < f.H-margin {
			candidates = append(candidates, c)
		}
	}
	rng.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })
	var pads []Cell
	far := func(c Cell, from []Cell) bool {
		return !slices.ContainsFunc(from, func(p Cell) bool { return dist2(p, c) < padSpacing*padSpacing })
	}
	for _, c := range candidates {
		if len(pads) == n {
			break
		}
		if far(c, f.Points) && far(c, pads) {
			pads = append(pads, c)
		}
	}
	return pads
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

// placePoints picks Control Points in the main region, in the middle half of
// the map each way, at least spacing apart. Where they don't fit, it tries
// again with less spacing.
func (f *Field) placePoints(main []bool, n, spacing int, rng *rand.Rand) []Cell {
	var candidates []Cell
	for i, m := range main {
		c := f.cell(i)
		if m && c.X >= f.W/4 && c.X < f.W*3/4 && c.Y >= f.H/4 && c.Y < f.H*3/4 {
			candidates = append(candidates, c)
		}
	}
	if len(candidates) < n {
		candidates = candidates[:0]
		for i, m := range main {
			if m {
				candidates = append(candidates, f.cell(i))
			}
		}
	}
	rng.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })
	for s := spacing; ; s-- {
		var points []Cell
		for _, c := range candidates {
			if len(points) == n {
				break
			}
			if !slices.ContainsFunc(points, func(p Cell) bool { return dist2(p, c) < s*s }) {
				points = append(points, c)
			}
		}
		if len(points) == n || s <= 0 {
			return points
		}
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
