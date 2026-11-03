package battle

import (
	"cmp"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// baseContent is the base Mod with one squad per Unit Slot, as the tests of
// everything but squadSize were written for; modContent is it as shipped.
func baseContent(t testing.TB) *cs.Content {
	t.Helper()
	c := modContent(t)
	for id, uc := range c.UnitClasses {
		uc.SquadSize = nil
		c.UnitClasses[id] = uc
	}
	return c
}

func modContent(t testing.TB) *cs.Content {
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

// Landing Zones keep their spacing and clear of the base, and at least one
// is in the far half, for the attacker to land at.
func TestLandingZonesAreSpacedAndClearOfTheBase(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	for seed := range uint64(20) {
		f := Generate(c, r, nil, seed)
		if len(f.Points) != r.ControlPoints || len(f.Starts) == 0 {
			t.Fatalf("seed %d: %d Landing Zones, %d starts", seed, len(f.Points), len(f.Starts))
		}
		for i, p := range f.Points {
			if dist(p, f.CommandPost) < baseClearance {
				t.Errorf("seed %d: Landing Zone %v %.0f cells from the Command Post", seed, p, dist(p, f.CommandPost))
			}
			for _, q := range f.Points[:i] {
				if dist2(p, q) < r.ControlPointSpacing*r.ControlPointSpacing {
					t.Errorf("seed %d: Landing Zones %v and %v closer than %d", seed, p, q, r.ControlPointSpacing)
				}
			}
		}
	}
}

func TestBandsTakeTheirShareOfTheMap(t *testing.T) {
	c := baseContent(t)
	ar := cs.GalaxyMapPlanetsElemBattlefieldArchetype(Open) // an open field keeps the preset's shares
	f := Generate(c, rules(c), &cs.PlanetBattlefield{Archetype: &ar}, 3)
	water, _ := slices.BinarySearch(f.Terrains, "base:water")
	n := 0
	for _, t := range f.Terrain {
		if int(t) == water {
			n++
		}
	}
	// Temperate is 12% water; carving and the base can only lower it, and a
	// bridge's stream raise it a little.
	if share := float64(n) / float64(len(f.Terrain)); share > 0.13 || share < 0.08 {
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
	if !slices.Contains(f.Terrains, "base:ice") || !slices.Contains(f.Terrains, "base:snow") {
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

func TestEveryGroundClassCanReachEveryPointStartAndTheBase(t *testing.T) {
	c := baseContent(t)
	eachField(t, func(name string, f *Field) {
		for _, class := range []string{"base:infantry", "base:vehicle"} {
			seen := reachable(c, f, class, f.Points[0])
			at := append(append(slices.Clone(f.Points), f.Starts...), f.CommandPost)
			if class == "base:infantry" {
				at = append(append(at, f.Sites...), f.UnitStarts...)
			}
			for _, a := range at {
				if !seen[f.index(a)] {
					t.Errorf("%s: %s can't reach %v\n%s", name, class, a, f)
				}
			}
		}
	})
}

// The attacker may land at the Landing Zones in the farther half from the
// base, never the nearest.
func TestTheAttackerLandsAtTheLandingZonesFarthestFromTheBase(t *testing.T) {
	eachField(t, func(name string, f *Field) {
		if len(f.Starts) != (len(f.Points)+1)/2 {
			t.Fatalf("%s: %d starts of %d Landing Zones", name, len(f.Starts), len(f.Points))
		}
		nearest := slices.MinFunc(f.Points, func(a, b Cell) int { return cmp.Compare(dist2(a, f.CommandPost), dist2(b, f.CommandPost)) })
		for _, s := range f.Starts {
			if !slices.Contains(f.Points, s) {
				t.Errorf("%s: start %v isn't a Landing Zone", name, s)
			}
			if len(f.Points) > 1 && s == nearest {
				t.Errorf("%s: the attacker can land at %v, the Landing Zone nearest the base", name, s)
			}
		}
	})
}

// The base holds the Command Post, building sites and unit starts round it.
func TestTheBaseHoldsItsSitesAndUnitStarts(t *testing.T) {
	eachField(t, func(name string, f *Field) {
		if len(f.Sites) < 4 || len(f.UnitStarts) < 3 {
			t.Errorf("%s: %d sites, %d unit starts; want a base's 4 and 3", name, len(f.Sites), len(f.UnitStarts))
		}
		for _, x := range append(slices.Clone(f.Sites), f.UnitStarts...) {
			if dist(x, f.CommandPost) > 10 {
				t.Errorf("%s: %v is %.0f cells from the Command Post: outside its base", name, x, dist(x, f.CommandPost))
			}
		}
	})
}

func TestPadsAreOnGroundVehiclesReachAndOffTheLanes(t *testing.T) {
	c := baseContent(t)
	r := rules(c)
	eachField(t, func(name string, f *Field) {
		if len(f.Pads) != r.BuildPads {
			t.Errorf("%s: %d pads, want %d", name, len(f.Pads), r.BuildPads)
		}
		vehicles := reachable(c, f, "base:vehicle", f.Points[0])
		for _, pad := range f.Pads {
			if f.lane[f.index(pad)] {
				t.Errorf("%s: pad %v on a lane", name, pad)
			}
			if !vehicles[f.index(pad)] {
				t.Errorf("%s: pad %v isn't on ground vehicles reach", name, pad)
			}
		}
	})
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

// Over many seeds, every archetype, preset and Faction's base: each place an
// attacker lands reaches every Landing Zone and the Command Post, on foot
// and by vehicle, and the base is always there.
func TestEveryArchetypeKeepsTheBattlefieldPlayable(t *testing.T) {
	if testing.Short() {
		t.Skip("hundreds of Battlefields")
	}
	c := modContent(t)
	r := rules(c)
	for _, a := range []string{Open, River, Ridge, Ruins} {
		for _, preset := range slices.Sorted(maps.Keys(c.TerrainPresets)) {
			for _, faction := range []string{"", "base:unsc", "base:covenant"} {
				for seed := range uint64(15) {
					ar, p := cs.GalaxyMapPlanetsElemBattlefieldArchetype(a), cs.ID(preset)
					f := GenerateFor(c, r, &cs.PlanetBattlefield{Archetype: &ar, TerrainPreset: &p}, seed, faction)
					name := fmt.Sprintf("%s %s %q seed %d", a, preset, faction, seed)
					if f.Archetype != a || len(f.Starts) == 0 || len(f.UnitStarts) == 0 {
						t.Errorf("%s: archetype %s, %d starts, %d unit starts", name, f.Archetype, len(f.Starts), len(f.UnitStarts))
						continue
					}
					for _, class := range []string{"base:infantry", "base:vehicle"} {
						for _, s := range f.Starts {
							seen := reachable(c, f, class, s)
							for _, to := range append(slices.Clone(f.Points), f.CommandPost) {
								if !seen[f.index(to)] {
									t.Errorf("%s: %s can't get from %v to %v\n%s", name, class, s, to, f)
								}
							}
						}
					}
				}
			}
		}
	}
}
