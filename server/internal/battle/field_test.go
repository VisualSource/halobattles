package battle

import (
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

func TestPadsAreSpacedAwayFromPointsAndEdges(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	for seed := range uint64(20) {
		f := Generate(c, r, nil, seed)
		if len(f.Pads) != r.BuildPads {
			t.Fatalf("seed %d: %d pads, want %d\n%s", seed, len(f.Pads), r.BuildPads, f)
		}
		seen := reachable(c, f, string(r.PathClass), f.Points[0])
		for i, p := range f.Pads {
			if !seen[f.index(p)] {
				t.Errorf("seed %d: pad %v can't be walked to", seed, p)
			}
			m := r.DeployDepth + 2
			if p.X < m || p.Y < m || p.X >= f.W-m || p.Y >= f.H-m {
				t.Errorf("seed %d: pad %v by an edge", seed, p)
			}
			for _, q := range append(slices.Clone(f.Points), f.Pads[:i]...) {
				if dist2(p, q) < padSpacing*padSpacing {
					t.Errorf("seed %d: pad %v within %d of %v", seed, p, padSpacing, q)
				}
			}
		}
	}
}
