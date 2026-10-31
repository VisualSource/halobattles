package battle

import (
	"cmp"
	"fmt"
	"math"
	"path/filepath"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func baseContent(t testing.TB) *cs.Content {
	t.Helper()
	c, err := content.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		t.Fatal(err)
	}
	return &c.Doc
}

func rules(c *cs.Content) cs.BattlefieldRules { return c.Rulesets["base:rules"].Battlefield }

// reachable lists the cells the path class can reach from start.
func reachable(c *cs.Content, f *Field, class string, start Cell) []bool {
	open := func(i int) bool { _, ok := c.Terrains[f.Terrains[f.Terrain[i]]].Movement[class]; return ok }
	seen := make([]bool, f.W*f.H)
	queue := []int{f.index(start)}
	seen[queue[0]] = true
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		f.neighbours4(i, func(n int) {
			if !seen[n] && open(n) {
				seen[n] = true
				queue = append(queue, n)
			}
		})
	}
	return seen
}

func TestGenerateIsDeterministic(t *testing.T) {
	c := baseContent(t)
	a, b := Generate(c, rules(c), nil, 7), Generate(c, rules(c), nil, 7)
	if a.String() != b.String() {
		t.Error("same seed gave different Fields")
	}
	if Generate(c, rules(c), nil, 8).String() == a.String() {
		t.Error("different seeds gave the same Field")
	}
	t.Logf("seed 7:\n%s", a)
}

func TestGenerateConnectsPointsAndEveryEdge(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	for _, preset := range []cs.ID{"base:temperate", "base:desert", "base:ice"} {
		for seed := range uint64(20) {
			f := Generate(c, r, &cs.PlanetBattlefield{TerrainPreset: &preset}, seed)
			if len(f.Points) != r.ControlPoints {
				t.Fatalf("%s seed %d: %d points, want %d", preset, seed, len(f.Points), r.ControlPoints)
			}
			seen := reachable(c, f, string(r.PathClass), f.Points[0])
			for _, p := range f.Points {
				if !seen[f.index(p)] {
					t.Errorf("%s seed %d: point %v unreachable from %v\n%s", preset, seed, p, f.Points[0], f)
				}
			}
			for e, strip := range f.edgeStrips(r.DeployDepth) {
				if !slices.ContainsFunc(strip, func(i int) bool { return seen[i] }) {
					t.Errorf("%s seed %d: edge %d unreachable\n%s", preset, seed, e, f)
				}
			}
		}
	}
}

func TestPointsAreSpacedInTheMiddle(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	for seed := range uint64(20) {
		f := Generate(c, r, nil, seed)
		for i, p := range f.Points {
			if p.X < f.W/4 || p.X >= f.W*3/4 || p.Y < f.H/4 || p.Y >= f.H*3/4 {
				t.Errorf("seed %d: point %v outside the middle", seed, p)
			}
			for _, q := range f.Points[:i] {
				if dist2(p, q) < r.ControlPointSpacing*r.ControlPointSpacing {
					t.Errorf("seed %d: points %v and %v closer than %d", seed, p, q, r.ControlPointSpacing)
				}
			}
		}
	}
}

func TestBandsTakeTheirShareOfTheMap(t *testing.T) {
	c := baseContent(t)
	f := Generate(c, rules(c), nil, 3)
	water, _ := slices.BinarySearch(f.Terrains, "base:water")
	n := 0
	for _, t := range f.Terrain {
		if int(t) == water {
			n++
		}
	}
	// Temperate is 12% water; carving a path to an edge can only lower it.
	if share := float64(n) / float64(len(f.Terrain)); share > 0.12 || share < 0.08 {
		t.Errorf("water share %.3f, want about 0.12", share)
	}
}

func TestPlanetOverridesSizeAndPreset(t *testing.T) {
	c := baseContent(t)
	preset, w, h := cs.ID("base:ice"), 40, 30
	f := Generate(c, rules(c), &cs.PlanetBattlefield{TerrainPreset: &preset, Width: &w, Height: &h}, 1)
	if f.W != 40 || f.H != 30 || len(f.Terrain) != 1200 {
		t.Errorf("size %dx%d, %d cells", f.W, f.H, len(f.Terrain))
	}
	if !slices.Contains(f.Terrains, "base:ice") || slices.Contains(f.Terrains, "base:water") {
		t.Errorf("terrains %v, want the ice preset's", f.Terrains)
	}
}

func TestCarvingJoinsAMostlyBlockedMap(t *testing.T) {
	c := baseContent(t)
	p := c.TerrainPresets["base:temperate"]
	p.Bands = slices.Clone(p.Bands)
	p.Bands[0].UpTo = 0.85 // 85% water
	c.TerrainPresets["base:swamp"] = p
	preset := cs.ID("base:swamp")
	r := rules(c)
	f := Generate(c, r, &cs.PlanetBattlefield{TerrainPreset: &preset}, 5)
	seen := reachable(c, f, string(r.PathClass), f.Points[0])
	for e, strip := range f.edgeStrips(r.DeployDepth) {
		if !slices.ContainsFunc(strip, func(i int) bool { return seen[i] }) {
			t.Errorf("edge %d unreachable\n%s", e, f)
		}
	}
}

// eachField runs fn on every base preset over 20 seeds.
func eachField(t *testing.T, fn func(name string, f *Field)) {
	c := baseContent(t)
	for _, preset := range []cs.ID{"base:temperate", "base:desert", "base:ice"} {
		for seed := range uint64(20) {
			fn(fmt.Sprintf("%s seed %d", preset, seed), Generate(c, rules(c), &cs.PlanetBattlefield{TerrainPreset: &preset}, seed))
		}
	}
}

func TestEveryGroundClassCanReachEveryPointAndStart(t *testing.T) {
	c := baseContent(t)
	eachField(t, func(name string, f *Field) {
		for _, class := range []string{"base:infantry", "base:vehicle"} {
			seen := reachable(c, f, class, f.Points[0])
			for _, at := range append(slices.Clone(f.Points), f.Starts...) {
				if !seen[f.index(at)] {
					t.Errorf("%s: %s can't reach %v\n%s", name, class, at, f)
				}
			}
		}
	})
}

func TestStartsAreOnTheEdgesAndApart(t *testing.T) {
	c := baseContent(t)
	want := *rules(c).AttackerStarts
	eachField(t, func(name string, f *Field) {
		if len(f.Starts) != want {
			t.Fatalf("%s: %d starts, want %d", name, len(f.Starts), want)
		}
		for i, s := range f.Starts {
			if s.X != 0 && s.Y != 0 && s.X != f.W-1 && s.Y != f.H-1 {
				t.Errorf("%s: start %v isn't on an edge", name, s)
			}
			for _, o := range f.Starts[:i] {
				if dist(s, o) < 20 {
					t.Errorf("%s: starts %v and %v only %.0f cells apart", name, s, o, dist(s, o))
				}
			}
		}
	})
}

func TestSitesStandByTheirPointsOnGroundInfantryCanReach(t *testing.T) {
	c := baseContent(t)
	eachField(t, func(name string, f *Field) {
		if len(f.Sites) != sitesPerPoint*len(f.Points) {
			t.Errorf("%s: %d sites, want %d", name, len(f.Sites), sitesPerPoint*len(f.Points))
		}
		seen := reachable(c, f, "base:infantry", f.Points[0])
		for k, s := range f.Sites {
			if p := f.Points[k%len(f.Points)]; dist(s, p) > siteReach {
				t.Errorf("%s: site %v is %.0f cells from its point %v", name, s, dist(s, p), p)
			}
			if !seen[f.index(s)] {
				t.Errorf("%s: site %v can't be walked to", name, s)
			}
		}
	})
}

func TestPadsSitBesideALaneByAPointAwayFromTheStarts(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	away, total := 0, 0
	eachField(t, func(name string, f *Field) {
		if len(f.Pads) != r.BuildPads {
			t.Errorf("%s: %d pads, want %d", name, len(f.Pads), r.BuildPads)
		}
		vehicles := reachable(c, f, "base:vehicle", f.Points[0])
		for _, pad := range f.Pads {
			p := slices.MinFunc(f.Points, func(a, b Cell) int { return cmp.Compare(dist2(pad, a), dist2(pad, b)) })
			if dist(pad, p) > padReach {
				t.Errorf("%s: pad %v is %.0f cells from the nearest point %v", name, pad, dist(pad, p), p)
			}
			beside := false
			for i, on := range f.lane {
				beside = beside || on && dist(f.cell(i), pad) <= 2*math.Sqrt2
			}
			if !beside {
				t.Errorf("%s: pad %v isn't beside a lane", name, pad)
			}
			for y := pad.Y - 1; y <= pad.Y+1; y++ {
				for x := pad.X - 1; x <= pad.X+1; x++ {
					if c := (Cell{x, y}); c.X >= 0 && c.Y >= 0 && c.X < f.W && c.Y < f.H && (f.lane[f.index(c)] || f.side[f.index(c)]) {
						t.Errorf("%s: pad %v on or touching a lane at %v", name, pad, c)
					}
				}
			}
			if !vehicles[f.index(pad)] {
				t.Errorf("%s: pad %v isn't on ground vehicles reach", name, pad)
			}
			total++
			if fromStarts(pad, f.Starts) > fromStarts(p, f.Starts) {
				away++
			}
		}
	})
	if away*4 < total*3 {
		t.Errorf("%d of %d pads are further from the attacker starts than their point; want most", away, total)
	}
}

func TestThePointsAreJoinedInARingOfLanes(t *testing.T) {
	c := baseContent(t)
	area := float64(*rules(c).PointArea)
	eachField(t, func(name string, f *Field) {
		// With three points, a ring joins every pair directly: along lanes,
		// round the third point's clear ground rather than through it.
		for a := range f.Points {
			for b := a + 1; b < len(f.Points); b++ {
				avoid := func(i int) bool {
					return slices.ContainsFunc(f.Points, func(p Cell) bool {
						return p != f.Points[a] && p != f.Points[b] && dist(f.cell(i), p) <= area
					})
				}
				seen := make([]bool, f.W*f.H)
				queue := []int{f.index(f.Points[a])}
				seen[queue[0]] = true
				for len(queue) > 0 {
					i := queue[0]
					queue = queue[1:]
					f.neighbours4(i, func(n int) {
						if !seen[n] && (f.lane[n] || dist(f.cell(n), f.Points[a]) <= area || dist(f.cell(n), f.Points[b]) <= area) && !avoid(n) {
							seen[n] = true
							queue = append(queue, n)
						}
					})
				}
				if !seen[f.index(f.Points[b])] {
					t.Errorf("%s: no lane from point %v to %v that keeps off the others", name, f.Points[a], f.Points[b])
				}
			}
		}
	})
}
