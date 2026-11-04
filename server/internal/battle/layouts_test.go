package battle

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// eachLayoutField runs fn on 5 seeds of every base layout on each base preset.
func eachLayoutField(t *testing.T, fn func(name string, lay cs.Layout, f *Field)) {
	c := baseContent(t)
	for _, id := range slices.Sorted(maps.Keys(c.Layouts)) {
		for _, preset := range []cs.ID{"base:temperate", "base:desert", "base:ice"} {
			for seed := range uint64(5) {
				f := GenerateLayout(c, rules(c), &cs.PlanetBattlefield{TerrainPreset: &preset}, seed, "", id)
				fn(fmt.Sprintf("%s on %s seed %d", id, preset, seed), c.Layouts[id], f)
			}
		}
	}
}

func TestLayoutFieldsHaveTheLayoutsLandingZonesPadsAndSites(t *testing.T) {
	eachLayoutField(t, func(name string, lay cs.Layout, f *Field) {
		if f.Generator != "layout: "+string(lay.ID) {
			t.Fatalf("%s: made by %q", name, f.Generator)
		}
		attackers := 0
		for _, z := range lay.LandingZones {
			if z.Attacker != nil && *z.Attacker {
				attackers++
			}
		}
		if len(f.Points) != len(lay.LandingZones) || len(f.Starts) != attackers {
			t.Errorf("%s: %d Landing Zones, %d to land at; want %d and %d", name, len(f.Points), len(f.Starts), len(lay.LandingZones), attackers)
		}
		// The base's own come first; every one of the layout's is placed.
		if len(f.Pads) < len(lay.Pads) || len(f.Sites) < len(lay.Sites) {
			t.Errorf("%s: %d pads and %d sites; want at least the layout's %d and %d", name, len(f.Pads), len(f.Sites), len(lay.Pads), len(lay.Sites))
		}
	})
}

func TestLayoutFieldsReachEveryPointEdgeAndTheBase(t *testing.T) {
	c := baseContent(t)
	class := string(rules(c).PathClass)
	eachLayoutField(t, func(name string, _ cs.Layout, f *Field) {
		seen := reachable(c, f, class, f.Points[0])
		for _, at := range append(slices.Clone(f.Points), f.CommandPost) {
			if !seen[f.index(at)] {
				t.Errorf("%s: %v can't be reached from the first Landing Zone", name, at)
			}
		}
		for e, strip := range f.edgeStrips(rules(c).DeployDepth) {
			if !slices.ContainsFunc(strip, func(i int) bool { return seen[i] }) {
				t.Errorf("%s: edge %d can't be reached, so no Retreat leaves by it", name, e)
			}
		}
	})
}

// The attacker's Landing Zones are the far side of the map from the base,
// however the layout was turned.
func TestLayoutsTurnToTheDefendersEdge(t *testing.T) {
	eachLayoutField(t, func(name string, _ cs.Layout, f *Field) {
		for _, s := range f.Starts {
			if dist(s, f.CommandPost) < float64(min(f.W, f.H))/2 {
				t.Errorf("%s: the attacker lands at %v, %0.f cells from the Command Post at %v", name, s, dist(s, f.CommandPost), f.CommandPost)
			}
		}
	})
}

func TestLayoutFieldsAreTheSameForASeed(t *testing.T) {
	c := baseContent(t)
	for seed := range uint64(5) {
		a := GenerateLayout(c, rules(c), nil, seed, "", "")
		b := GenerateLayout(c, rules(c), nil, seed, "", "")
		if a.Generator != b.Generator || !slices.Equal(a.Terrain, b.Terrain) || !slices.Equal(a.Points, b.Points) || !slices.Equal(a.Pads, b.Pads) || !slices.Equal(a.Sites, b.Sites) {
			t.Errorf("seed %d: two different Fields", seed)
		}
	}
}

// Lanes run on level ground: the terrain is molded to them, so hills and
// peaks rise between them. Only where the layout draws high ground is a
// lane raised.
func TestLayoutLanesRunOnLevelGround(t *testing.T) {
	eachLayoutField(t, func(name string, _ cs.Layout, f *Field) {
		lane, level := 0, 0
		for i, on := range f.lane {
			if on {
				lane++
				if f.Height[i] == 0 {
					level++
				}
			}
		}
		if lane == 0 || level*100 < lane*80 {
			t.Errorf("%s: %d of %d lane cells on level ground; want 80%%", name, level, lane)
		}
	})
}

func TestALaneCurveFollowsItsPointsSideBySide(t *testing.T) {
	p := &placer{f: &Field{W: 40, H: 40}}
	pts := [][2]float64{{2, 2}, {20, 5}, {30, 30}, {5, 35}}
	for k := 1; k < len(pts); k++ {
		cells := p.curve(pts, k)
		first, last := p.f.cell(cells[0]), p.f.cell(cells[len(cells)-1])
		a, b := Cell{int(pts[k-1][0]), int(pts[k-1][1])}, Cell{int(pts[k][0]), int(pts[k][1])}
		if first != a || last != b {
			t.Errorf("leg %d runs %v to %v; want %v to %v", k, first, last, a, b)
		}
		for i := 1; i < len(cells); i++ {
			if d := p.f.cell(cells[i]).add(p.f.cell(cells[i-1]).scale(-1)); abs(d.X)+abs(d.Y) != 1 {
				t.Fatalf("leg %d steps %v: not to a cell sharing a side", k, d)
			}
		}
		for _, i := range cells { // rounded, not wandering: near the straight line
			if d := segmentDistance(p.f.cell(i), a, b); d > 4 {
				t.Errorf("leg %d strays %0.1f cells from its line at %v", k, d, p.f.cell(i))
			}
		}
	}
}

// segmentDistance is how far c is from the line from a to b, in cells.
func segmentDistance(c, a, b Cell) float64 {
	dx, dy := float64(b.X-a.X), float64(b.Y-a.Y)
	px, py := float64(c.X-a.X), float64(c.Y-a.Y)
	s := min(1, max(0, (px*dx+py*dy)/(dx*dx+dy*dy)))
	return math.Hypot(px-s*dx, py-s*dy)
}
