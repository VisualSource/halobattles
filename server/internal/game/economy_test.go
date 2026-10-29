package game

import (
	"maps"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func TestPaydayPaysIncomePlusYieldsMinusUpkeep(t *testing.T) {
	s := fixedMatch(t) // Seat 0's Capital a has a Barracks and a Supply Pad

	paid := s.Advance(lineContent(), 90_000).Paydays

	// Capital 300C 100M, Supply Pad +100C, Barracks -10C.
	want := map[string]int{"base:credits": 390, "base:materials": 100}
	if len(paid) != 2 || !maps.Equal(paid[0].Net, want) {
		t.Fatalf("paid %+v, want Seat 0's net %v", paid, want)
	}
	if got := s.Players[0].Resources; got["base:credits"] != 1390 || got["base:materials"] != 100 {
		t.Errorf("Seat 0's Resources = %v, want 1390C 100M", got)
	}
}

func TestPaydayPaysNothingForNeutralPlanets(t *testing.T) {
	s := fixedMatch(t)
	s.Planets["b"].Owner = 0 // a Standard Planet: +200C 50M

	paid := s.Advance(lineContent(), 90_000).Paydays

	if got := paid[0].Net["base:credits"]; got != 590 {
		t.Errorf("Seat 0's Credits net = %d, want 590 with b", got)
	}
	if got := paid[1].Net["base:credits"]; got != 390 {
		t.Errorf("Seat 1's Credits net = %d, want 390, with no neutral income", got)
	}
}

func TestUpkeepCanPushAPlayerIntoDebt(t *testing.T) {
	s := fixedMatch(t)
	a := s.Planets["a"]
	a.Income = nil
	a.Buildings = []string{"base:barracks", "base:air-pad", "base:air-pad", "base:air-pad"}
	s.Players[0].Resources["base:credits"] = 50

	paid := s.Advance(lineContent(), 90_000).Paydays

	if got := paid[0].Net["base:credits"]; got != -100 {
		t.Errorf("net = %d, want -100 (10 + 3×30 Upkeep)", got)
	}
	if got := s.Players[0].Resources["base:credits"]; got != -50 {
		t.Errorf("Credits = %d, want -50: debt is allowed", got)
	}
}

func TestPaydayFiresOnTheFirstTickAfterItsDue(t *testing.T) {
	s := fixedMatch(t)
	c := lineContent()

	if paid := s.Advance(c, 89_800).Paydays; paid != nil {
		t.Fatalf("paid at 89.8 s, before the 90 s Payday: %+v", paid)
	}
	if paid := s.Advance(c, 90_200).Paydays; len(paid) != 2 {
		t.Fatalf("no Payday on the first tick after 90 s")
	}
	if paid := s.Advance(c, 90_400).Paydays; paid != nil {
		t.Errorf("paid twice for one Payday")
	}
	if s.NextPayday != 180_000 {
		t.Errorf("next Payday at %d, want 180000: the schedule doesn't drift with the tick", s.NextPayday)
	}
}

func TestViewHasOnlyTheViewersEconomy(t *testing.T) {
	s := fixedMatch(t)
	s.Players[1].Resources["base:credits"] = 7
	s.Planets["b"].Owner = 0 // +10 cap, +6 Grunts

	e := s.View(lineContent(), 0).Economy

	want := Economy{
		Resources: map[string]int{"base:credits": 1000}, CommandPointsUsed: 10 + 2*3 + 6, CommandPointsCap: 30,
		PaydayStart: 0, PaydayEnd: 90_000,
	}
	if !maps.Equal(e.Resources, want.Resources) || e.CommandPointsUsed != want.CommandPointsUsed ||
		e.CommandPointsCap != want.CommandPointsCap || e.PaydayStart != 0 || e.PaydayEnd != 90_000 {
		t.Errorf("economy = %+v, want %+v", e, want)
	}
}

func TestDiffIgnoresThePassingOfTime(t *testing.T) {
	s := fixedMatch(t)
	c := lineContent()
	prev := s.View(c, 0)

	s.Advance(c, 1_000)

	if d, changed := Diff(prev, s.View(c, 0)); changed {
		t.Errorf("nothing changed but the time, got %+v", d)
	}
}

func TestDiffUpsertsChangedEntitiesAndRemovesPlanetsLeavingVision(t *testing.T) {
	s := fixedMatch(t)
	c := lineContent()
	s.Planets["b"].Owner = 0 // a, b, c in vision
	prev := s.View(c, 0)

	s.Planets["b"].Owner = Neutral // c leaves vision
	s.Planets["a"].Stacks[0][0].Count = 9
	d, changed := Diff(prev, s.View(c, 0))

	if !changed {
		t.Fatal("Diff saw no change")
	}
	got := []string{}
	for _, p := range d.Planets {
		got = append(got, p.ID)
	}
	if !slices.Equal(got, []string{"a", "b"}) || !slices.Equal(d.RemovedPlanets, []string{"c"}) {
		t.Errorf("upserted %v removed %v, want [a b] and [c]", got, d.RemovedPlanets)
	}
	if len(d.Players) != 1 || d.Players[0].Seat != 0 || d.Players[0].PlanetCount != 1 {
		t.Errorf("players %+v, want only Seat 0 with its new Planet count", d.Players)
	}
	if d.Economy == nil || d.Economy.CommandPointsUsed != 9+2*3 {
		t.Errorf("economy %+v, want the lost Marine's Command Point freed", d.Economy)
	}
}

// Seat 0's Capital a pays 300 Credits and 100 Materials at Payday, and has
// two empty Building Slots, 2 and 3.

func TestAFoundryRefinesMaterialsIntoAlloysAfterUpkeep(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["a"].Buildings[2] = "base:foundry"

	paid := s.Advance(c, 90_000).Paydays

	if got := s.Players[0].Resources; got["base:materials"] != 60 || got["base:alloys"] != 20 {
		t.Errorf("Resources = %v, want 100 Materials in, 40 refined into 20 Alloys", got)
	}
	if net := paid[0].Net; net["base:materials"] != 60 || net["base:alloys"] != 20 {
		t.Errorf("PaydayPaid net = %v, want the refining in it", net)
	}
}

func TestAShortFoundryRefinesWhatThereIsAtTheSameRate(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]
	a.Buildings[2], a.Buildings[3] = "base:foundry", "base:foundry"
	a.Income = map[string]int{"base:materials": 51}

	s.Advance(c, 90_000)

	// The first takes 40 for 20; the second has 11, so 10 for 5, leaving 1.
	if got := s.Players[0].Resources; got["base:materials"] != 1 || got["base:alloys"] != 25 {
		t.Errorf("Resources = %v, want 1 Material and 25 Alloys", got)
	}
}

func TestResourcesOverTheirStockpileCapAreLostAtPayday(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) {
		r.StockpileCaps = map[string]int{"base:credits": 1200, "base:materials": 1500, "base:alloys": 500}
	})

	s.Advance(c, 90_000) // 1000 + 390 Credits

	if got := s.Players[0].Resources["base:credits"]; got != 1200 {
		t.Errorf("Credits = %d, want the 1200 cap", got)
	}

	s.Planets["a"].Buildings[2] = "base:depot" // +500 Credits of cap
	s.Advance(c, 180_000)
	if got := s.Players[0].Resources["base:credits"]; got != 1590 {
		t.Errorf("Credits with a Depot = %d, want 1200 + 390 under the raised 1700 cap", got)
	}
}

func TestExtractorsYieldByTheirPlanetsRichness(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]
	a.Income = nil
	a.Buildings = []string{"", "", "base:mine", "base:mine"} // two on one Planet: each yields
	a.Richness = map[string]string{"base:materials": "rich"}
	b := s.Planets["b"]
	b.Owner = 0
	b.Income = nil
	b.Buildings = []string{"base:mine", "", ""}
	b.Richness = map[string]string{"base:materials": "poor"}
	d := s.Planets["d"]
	d.Owner = 0
	d.Income = nil
	d.Buildings = []string{"base:mine", "base:supply-pad", ""}
	d.Richness = map[string]string{} // nothing to draw: a flat yield still pays

	paid := s.Advance(c, 90_000).Paydays

	// 2 × 60 × 1.5 on a, 60 × 0.5 on b, nothing on d.
	if got := paid[0].Net["base:materials"]; got != 180+30 {
		t.Errorf("Materials net = %d, want 210", got)
	}
	if got := paid[0].Net["base:credits"]; got != 100 {
		t.Errorf("Credits net = %d, want d's flat Supply Pad yield of 100", got)
	}
}

func TestStartTakesRichnessFromThePlanetTypeOrTheMapsOverride(t *testing.T) {
	c := lineContent()
	m := c.Maps["base:line"]
	m.Planets[3].Overrides = &cs.PlanetOverrides{Richness: map[string]cs.RichnessLevel{"base:credits": "rich"}} // d
	c.Maps["base:line"] = m

	s, err := StartMatch(c, "base:line", []SeatSetup{{User: "u1", Faction: "base:unsc"}}, nil, 1)
	if err != nil {
		t.Fatal(err)
	}

	if got := s.Planets["b"].Richness; !maps.Equal(got, map[string]string{"base:materials": "poor"}) {
		t.Errorf("b = %v, want its Standard Planet Type's", got)
	}
	if got := s.Planets["d"].Richness; !maps.Equal(got, map[string]string{"base:credits": "rich"}) {
		t.Errorf("d = %v, want the override in full, replacing its type's", got)
	}
}
