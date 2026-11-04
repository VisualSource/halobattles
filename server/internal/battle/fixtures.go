package battle

import (
	"maps"
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
