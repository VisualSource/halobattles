package battle

import (
	"cmp"
	"maps"
	"math"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Battlefield Archetypes and fixtures (#99): the archetype gives a
// Battlefield its shape and the defender's end, a base fixture holds the
// defender's Command Post, sites and unit starts there, and a few feature
// fixtures are landmarks in open space. See docs/specs/tactical-battle-spec.md.

// Archetypes, as the content names them.
const (
	Open  = "open"
	River = "river"
	Ridge = "ridge"
	Ruins = "ruins"
)

// pickArchetype is the Planet's forced archetype, or one by its preset's
// weights; an open field if the preset gives none.
func pickArchetype(p cs.TerrainPreset, planet *cs.PlanetBattlefield, rng *rand.Rand) string {
	if planet != nil && planet.Archetype != nil {
		return string(*planet.Archetype)
	}
	if p.Archetypes == nil {
		return Open
	}
	w := p.Archetypes
	type option struct {
		id     string
		weight float64
	}
	var opts []option
	for _, o := range []option{{Open, deref64(w.Open)}, {River, deref64(w.River)}, {Ridge, deref64(w.Ridge)}, {Ruins, deref64(w.Ruins)}} {
		if o.weight > 0 {
			opts = append(opts, o)
		}
	}
	if len(opts) == 0 {
		return Open
	}
	total := 0.0
	for _, o := range opts {
		total += o.weight
	}
	r := rng.Float64() * total
	for _, o := range opts {
		if r -= o.weight; r < 0 {
			return o.id
		}
	}
	return opts[len(opts)-1].id
}

func deref64(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

// towardBase is how far c is along the attack, from the attacker's end (0)
// to the defender's edge (1), the base edge being 0 top, 1 right, 2 bottom,
// 3 left; across is where it is the other way, 0 to 1.
func (f *Field) towardBase(c Cell, edge int) float64 {
	switch edge {
	case 0:
		return 1 - float64(c.Y)/float64(max(1, f.H-1))
	case 2:
		return float64(c.Y) / float64(max(1, f.H-1))
	case 1:
		return float64(c.X) / float64(max(1, f.W-1))
	}
	return 1 - float64(c.X)/float64(max(1, f.W-1))
}

func (f *Field) across(c Cell, edge int) float64 {
	if edge == 0 || edge == 2 {
		return float64(c.X) / float64(max(1, f.W-1))
	}
	return float64(c.Y) / float64(max(1, f.H-1))
}

// riverHalf is half a river's width, as a share of the attack's length.
const riverHalf = 0.035

// shapeElevation bends the ranked elevation to the archetype before it's
// banded: an open field keeps the preset's look; a river sinks a band across the attack
// to the lowest Terrain; a ridge raises the line of the attack, a valley
// the ground either side of it.
func (f *Field) shapeElevation(e []float64, archetype string, edge int, rng *rand.Rand) {
	valley := rng.IntN(2) == 0 // drawn whatever the archetype, so the stream stays put
	for i := range e {
		c := f.cell(i)
		switch archetype {
		case River:
			if math.Abs(f.towardBase(c, edge)-0.5) < riverHalf {
				e[i] = 0
			}
		case Ridge:
			a := f.across(c, edge) - 0.5
			g := math.Exp(-(a * a) / (0.18 * 0.18))
			if valley {
				g = 1 - g
			}
			e[i] = min(1, e[i]*0.6+0.45*g)
		}
	}
}

// riverFords clears 2 or 3 crossings, 3 cells wide, across the river.
func (l *layout) riverFords(edge int, rng *rand.Rand) {
	f := l.f
	n := 2 + rng.IntN(2)
	for k := range n {
		at := (float64(k) + 0.5 + (rng.Float64()-0.5)*0.4) / float64(n) // spread across, jittered
		for i := range f.Terrain {
			c := f.cell(i)
			if math.Abs(f.towardBase(c, edge)-0.5) < riverHalf+0.02 && math.Abs(f.across(c, edge)-at) < 1.5/float64(max(f.W, f.H)) {
				l.clear(i)
			}
		}
	}
}

// ruinBlocks lays a grid of blocks with streets between: each block cover,
// or now and then impassable rubble.
func (l *layout) ruinBlocks(rng *rand.Rand) {
	f := l.f
	const block, street = 5, 2
	period := block + street
	rubble := map[Cell]bool{}
	for by := 0; by*period < f.H; by++ {
		for bx := 0; bx*period < f.W; bx++ {
			rubble[Cell{bx, by}] = rng.IntN(10) < 3
		}
	}
	peak := l.highest()
	for i := range f.Terrain {
		c := f.cell(i)
		if c.X%period >= block || c.Y%period >= block {
			l.clear(i) // a street
			continue
		}
		switch b := (Cell{c.X / period, c.Y / period}); {
		case rubble[b] && peak >= 0:
			f.Terrain[i] = uint8(peak)
		case l.cover >= 0:
			f.Terrain[i] = uint8(l.cover)
		}
	}
}

// highest is the Terrain of the preset's top band, the one no ground unit
// crosses, if it's in the table; else -1.
func (l *layout) highest() int {
	for i := range l.f.Terrains {
		if !slices.ContainsFunc(l.ground, func(ok []bool) bool { return ok[i] }) {
			return i
		}
	}
	return -1
}

// grid is a fixture's cells, turned and flipped as placed.
type grid struct {
	w, h  int
	cells [][]rune // [y][x]
}

func fixtureGrid(fx cs.Fixture, rot int, mirror bool) grid {
	g := grid{}
	for _, row := range fx.Map {
		g.cells = append(g.cells, []rune(row))
	}
	g.h, g.w = len(g.cells), len(g.cells[0])
	if mirror {
		for _, row := range g.cells {
			slices.Reverse(row)
		}
	}
	for range rot { // a quarter turn clockwise each
		out := make([][]rune, g.w)
		for x := range g.w {
			out[x] = make([]rune, g.h)
			for y := range g.h {
				out[x][g.h-1-y] = g.cells[y][x]
			}
		}
		g.cells, g.w, g.h = out, g.h, g.w
	}
	return g
}

// orient is a fixture's turn and flip: drawn from rng whatever it allows,
// so the stream stays put, and used only if it allows them.
func orient(fx cs.Fixture, rng *rand.Rand) (int, bool) {
	rot, mirror := rng.IntN(4), rng.IntN(2) == 1
	if fx.Rotate == nil || !*fx.Rotate {
		rot = 0
	}
	if fx.Mirror == nil || !*fx.Mirror {
		mirror = false
	}
	return rot, mirror
}

// stamped is what a fixture placed: its markers' cells, in reading order.
type stamped struct {
	post                Cell
	hasPost             bool
	sites, starts, pads []Cell
}

// stamp draws g with its top-left at o: key cells take their Terrain (or
// the preset's clear ground or point cover) and any height; marker cells are
// cleared and recorded; anything else is left as it is.
func (l *layout) stamp(fx cs.Fixture, g grid, o Cell, terrain func(cs.ID) uint8) stamped {
	f := l.f
	var out stamped
	for y := range g.h {
		for x := range g.w {
			c := o.add(Cell{x, y})
			if !l.in(c) {
				continue
			}
			i, ch := f.index(c), string(g.cells[y][x])
			l.fixed[i] = true
			if m, ok := fx.Markers[ch]; ok {
				l.clear(i)
				f.Terrain[i] = l.clearT
				switch m {
				case cs.FixtureMarkersValueCommandPost:
					out.post, out.hasPost = c, true
				case cs.FixtureMarkersValueSite:
					out.sites = append(out.sites, c)
				case cs.FixtureMarkersValueUnitStart:
					out.starts = append(out.starts, c)
				case cs.FixtureMarkersValuePad:
					out.pads = append(out.pads, c)
					l.padAt[i] = true
				case cs.FixtureMarkersValueCover:
					if l.cover >= 0 {
						f.Terrain[i] = uint8(l.cover)
					}
				}
				l.zone[i] = true
				continue
			}
			k, ok := fx.Key[ch]
			if !ok {
				continue
			}
			switch {
			case k.Terrain != nil:
				f.Terrain[i] = terrain(*k.Terrain)
			case k.Cover != nil && *k.Cover && l.cover >= 0:
				f.Terrain[i] = uint8(l.cover)
			default: // clear, or cover with none in the preset
				f.Terrain[i], f.Height[i] = l.clearT, l.clearH
			}
			if k.Height != nil {
				f.Height[i] = uint8(*k.Height)
			}
			l.zone[i] = true
		}
	}
	return out
}

// plainBase stands in when no base fixture fits: the Command Post, with
// sites and unit starts round it.
var plainBase = cs.Fixture{
	ID: "plain", Kind: cs.FixtureKindBase,
	Markers: map[string]cs.FixtureMarkersValue{"C": cs.FixtureMarkersValueCommandPost, "s": cs.FixtureMarkersValueSite, "u": cs.FixtureMarkersValueUnitStart},
	Map:     []string{"s...s", ".u.u.", "..C..", "..u..", "s...s"},
}

// fixturesFor lists the fixtures of kind that suit the archetype, and, for
// a base, the defending Faction: its own if it has any, else the neutral
// ones. In id order, so picks are fixed for a seed.
func fixturesFor(c *cs.Content, kind cs.FixtureKind, archetype, faction string) []cs.Fixture {
	var out []cs.Fixture
	for _, id := range slices.Sorted(maps.Keys(c.Fixtures)) {
		fx := c.Fixtures[id]
		if fx.Kind != kind || len(fx.Archetypes) > 0 && !slices.Contains(fx.Archetypes, cs.FixtureArchetypesElem(archetype)) {
			continue
		}
		out = append(out, fx)
	}
	if kind != cs.FixtureKindBase {
		return out
	}
	own := slices.DeleteFunc(slices.Clone(out), func(fx cs.Fixture) bool { return fx.Faction == nil || string(*fx.Faction) != faction })
	if len(own) > 0 {
		return own
	}
	return slices.DeleteFunc(out, func(fx cs.Fixture) bool { return fx.Faction != nil })
}

// weighted picks one fixture by weight, or false if there are none.
func weighted(fxs []cs.Fixture, rng *rand.Rand) (cs.Fixture, bool) {
	weight := func(fx cs.Fixture) float64 {
		if fx.Weight != nil {
			return *fx.Weight
		}
		return 1
	}
	total := 0.0
	for _, fx := range fxs {
		total += weight(fx)
	}
	r := rng.Float64() * total // drawn even with none, so the stream stays put
	for _, fx := range fxs {
		if r -= weight(fx); r < 0 {
			return fx, true
		}
	}
	if len(fxs) > 0 {
		return fxs[len(fxs)-1], true
	}
	return cs.Fixture{}, false
}

// place finds where g goes: a top-left corner that keeps it a cell inside the
// map and off taken, whose middle ok accepts, drawn from rng; false if none.
func (l *layout) place(g grid, taken []bool, ok func(mid Cell) bool, rng *rand.Rand) (Cell, bool) {
	f := l.f
	var spots []Cell
	for y := 1; y+g.h < f.H; y++ {
		for x := 1; x+g.w < f.W; x++ {
			o := Cell{x, y}
			if !ok(o.add(Cell{g.w / 2, g.h / 2})) || l.overlaps(g, o, taken) {
				continue
			}
			spots = append(spots, o)
		}
	}
	if len(spots) == 0 {
		return Cell{}, false
	}
	return spots[rng.IntN(len(spots))], true
}

func (l *layout) overlaps(g grid, o Cell, taken []bool) bool {
	for y := -1; y <= g.h; y++ {
		for x := -1; x <= g.w; x++ {
			if c := o.add(Cell{x, y}); l.in(c) && taken[l.f.index(c)] {
				return true
			}
		}
	}
	return false
}

// take marks g's cells at o, and margin round them, as taken.
func (l *layout) take(g grid, o Cell, margin int, taken []bool) {
	for y := -margin; y < g.h+margin; y++ {
		for x := -margin; x < g.w+margin; x++ {
			if c := o.add(Cell{x, y}); l.in(c) {
				taken[l.f.index(c)] = true
			}
		}
	}
}

// fixtureTerrains are the Terrains fixtures name, for the Field's table.
func fixtureTerrains(fxs ...cs.Fixture) []string {
	var ids []string
	for _, fx := range fxs {
		for _, k := range fx.Key {
			if k.Terrain != nil {
				ids = append(ids, string(*k.Terrain))
			}
		}
	}
	return ids
}

// placeLandingZones picks n Landing Zones in the main region, a few cells in
// from the edges and clear of the base, at least spacing apart, the first in
// the half of the map away from the base (an attacker's to land at). Where
// they don't fit, it tries again with less spacing.
func (f *Field) placeLandingZones(main []bool, n, spacing, margin int, post Cell, edge int, rng *rand.Rand) []Cell {
	var far, near []Cell
	for i, m := range main {
		c := f.cell(i)
		if !m || c.X < margin || c.Y < margin || c.X >= f.W-margin || c.Y >= f.H-margin || dist(c, post) < baseClearance {
			continue
		}
		if f.towardBase(c, edge) < 0.5 {
			far = append(far, c)
		} else {
			near = append(near, c)
		}
	}
	rng.Shuffle(len(far), func(i, j int) { far[i], far[j] = far[j], far[i] })
	rng.Shuffle(len(near), func(i, j int) { near[i], near[j] = near[j], near[i] })
	all := append(slices.Clone(far), near...)
	rng.Shuffle(len(all), func(i, j int) { all[i], all[j] = all[j], all[i] })
	for s := spacing; ; s-- {
		var points []Cell
		if len(far) > 0 {
			points = append(points, far[0])
		}
		for _, c := range all {
			if len(points) >= n {
				break
			}
			if !slices.ContainsFunc(points, func(p Cell) bool { return dist2(p, c) < s*s }) {
				points = append(points, c)
			}
		}
		if len(points) >= n || s <= 1 { // at 1 every distinct cell fits; 0 would take far[0] twice
			return points
		}
	}
}

// baseClearance is the fewest cells from the Command Post to a Landing Zone.
const baseClearance = 14

// attackerStarts are the Landing Zones an attacker may land at: the farther
// half from the Command Post, farthest first.
func attackerStarts(points []Cell, post Cell) []Cell {
	byFar := slices.Clone(points)
	slices.SortStableFunc(byFar, func(a, b Cell) int { return cmp.Compare(dist2(b, post), dist2(a, post)) })
	return byFar[:(len(byFar)+1)/2]
}
