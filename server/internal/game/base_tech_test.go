package game

import (
	"maps"
	"slices"
	"testing"
)

// The base Mod's tech tree, played from the UNSC Starting Kit: build a
// research building of each field (Fleet Command most, for Logistics'
// Legendary), Labs and a Forerunner Dig Site, keep every field busy
// (Legendary first, then the rarest card), and reach Forerunner
// Reverse-Engineering. Resources are topped up each second and Seat 0 is
// handed Planets to build on, so only research is being tested.
func TestTheBaseModResearchesFromAStartingKitToALegendaryTech(t *testing.T) {
	c := baseMod()
	s, err := StartMatch(c, "base:quadrant",
		[]SeatSetup{{User: "u1", Faction: "base:unsc"}, {User: "u2", Faction: "base:covenant"}},
		c.Rulesets[RulesetID].StartingResources, 1)
	if err != nil {
		t.Fatal(err)
	}
	if lab := capitalOf(s, 0).Buildings[2]; lab != "base:research-lab" {
		t.Fatalf("Capital buildings %v, want the Starting Kit's Research Lab", capitalOf(s, 0).Buildings)
	}
	// Six more Planets, the roomiest, keeps Seat 0 under the map's winning share.
	var neutral []*Planet
	for _, id := range slices.Sorted(maps.Keys(s.Planets)) {
		if p := s.Planets[id]; p.Owner == Neutral {
			neutral = append(neutral, p)
		}
	}
	slices.SortStableFunc(neutral, func(a, b *Planet) int { return len(b.Buildings) - len(a.Buildings) })
	for _, p := range neutral[:6] {
		p.Owner, p.Stacks = 0, [StacksPerPlanet]Stack{}
	}
	topUp := func() {
		s.Players[0].Resources = maps.Clone(c.Rulesets[RulesetID].StockpileCaps)
	}
	place := func(building string) {
		topUp()
		for _, id := range slices.Sorted(maps.Keys(s.Planets)) {
			p := s.Planets[id]
			for slot := range p.Buildings {
				if p.Owner == 0 && s.QueueBuilding(c, 0, id, slot, building) == nil {
					return
				}
			}
		}
		t.Fatalf("nowhere to build %s", building)
	}
	place("base:forerunner-dig-site")
	for range 4 {
		place("base:fleet-command")
		place("base:research-lab")
	}
	place("base:oni-station")
	place("base:proving-grounds")

	rank := map[string]int{"legendary": 0, "rare": 1, "uncommon": 2, "common": 3}
	const goal = "base:forerunner-reverse-engineering"
	for now := int64(0); now <= 3*3600*1000; now += 1000 {
		topUp()
		s.Advance(c, now)
		if s.heldTechs(c, 0)[goal] {
			t.Logf("held %d Techs by %d s at %v Research", len(s.heldTechs(c, 0)), now/1000, s.researchRates(c, 0))
			return
		}
		pl := &s.Players[0]
		var cards []string // a busy field's cards are refused
		for _, f := range slices.Sorted(maps.Keys(pl.Hands)) {
			cards = append(cards, pl.Hands[f]...)
		}
		for _, v := range pl.Saved {
			cards = append(cards, v.Tech)
		}
		slices.SortStableFunc(cards, func(a, b string) int {
			return rank[string(c.Techs[a].Rarity)] - rank[string(c.Techs[b].Rarity)]
		})
		started := map[string]bool{}
	pick:
		for _, tech := range cards {
			if f := string(c.Techs[tech].Field); !started[f] {
				for _, id := range slices.Sorted(maps.Keys(s.Planets)) {
					for slot := range s.Planets[id].Buildings {
						if s.StartProject(c, 0, tech, id, slot) == nil {
							started[f] = true
							continue pick
						}
					}
				}
			}
		}
	}
	t.Fatalf("no %s after 3 hours: held %v at %v Research", goal, slices.Sorted(maps.Keys(s.heldTechs(c, 0))), s.researchRates(c, 0))
}
