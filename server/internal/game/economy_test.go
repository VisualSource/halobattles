package game

import (
	"maps"
	"slices"
	"testing"
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
