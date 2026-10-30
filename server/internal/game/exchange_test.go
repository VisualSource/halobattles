package game

import (
	"maps"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func exchangeContent() *cs.Content {
	c := lineContent()
	c.Resources["base:alloys"] = cs.Resource{Name: "Alloys"}
	r := c.Rulesets[RulesetID]
	r.Exchange = []cs.ExchangeRate{
		{Give: "base:materials", GiveAmount: 2, Get: "base:credits", GetAmount: 1},
		{Give: "base:alloys", GiveAmount: 1, Get: "base:credits", GetAmount: 2},
		{Give: "base:credits", GiveAmount: 3, Get: "base:materials", GetAmount: 1},
		{Give: "base:credits", GiveAmount: 6, Get: "base:alloys", GetAmount: 1},
	}
	c.Rulesets[RulesetID] = r
	return c
}

func TestExchangeTradesAtEachRate(t *testing.T) {
	for _, tc := range []struct {
		give, get string
		amount    int
		want      map[string]int
	}{
		{"base:materials", "base:credits", 10, map[string]int{"base:credits": 105, "base:materials": 90, "base:alloys": 100}},
		{"base:alloys", "base:credits", 10, map[string]int{"base:credits": 120, "base:materials": 100, "base:alloys": 90}},
		{"base:credits", "base:materials", 30, map[string]int{"base:credits": 70, "base:materials": 110, "base:alloys": 100}},
		{"base:credits", "base:alloys", 60, map[string]int{"base:credits": 40, "base:materials": 100, "base:alloys": 110}},
	} {
		s := fixedMatch(t)
		s.Players[0].Resources = map[string]int{"base:credits": 100, "base:materials": 100, "base:alloys": 100}
		if err := s.Exchange(exchangeContent(), 0, tc.give, tc.get, tc.amount); err != nil {
			t.Errorf("%d %s for %s: %v", tc.amount, tc.give, tc.get, err)
		} else if got := s.Players[0].Resources; !maps.Equal(got, tc.want) {
			t.Errorf("%d %s for %s: Resources %v, want %v", tc.amount, tc.give, tc.get, got, tc.want)
		}
	}
}

func TestExchangeWorksInDebt(t *testing.T) {
	s := fixedMatch(t)
	s.Players[0].Resources = map[string]int{"base:credits": -50, "base:materials": 200}

	if err := s.Exchange(exchangeContent(), 0, "base:materials", "base:credits", 200); err != nil {
		t.Fatal(err)
	}
	if got := s.Players[0].Resources["base:credits"]; got != 50 {
		t.Errorf("Credits = %d, want 50: out of debt", got)
	}
}

func TestExchangeRejections(t *testing.T) {
	for _, tc := range []struct {
		name, give, get string
		amount          int
		want            string
	}{
		{"not a multiple of the rate", "base:credits", "base:materials", 10, "trade Credits in multiples of 3"},
		{"nothing", "base:credits", "base:materials", 0, "trade Credits in multiples of 3"},
		{"negative", "base:materials", "base:credits", -2, "trade Materials in multiples of 2"},
		{"can't pay", "base:credits", "base:alloys", 102, "not enough Credits"},
		{"no Credits side", "base:materials", "base:alloys", 2, "Materials can't be traded for Alloys"},
		{"unknown Resource", "base:gold", "base:credits", 2, " can't be traded for Credits"},
	} {
		s := fixedMatch(t)
		s.Players[0].Resources = map[string]int{"base:credits": 100, "base:materials": 100}
		before := maps.Clone(s.Players[0].Resources)
		err := s.Exchange(exchangeContent(), 0, tc.give, tc.get, tc.amount)
		if err == nil || err.Error() != tc.want {
			t.Errorf("%s: err = %v, want %q", tc.name, err, tc.want)
		}
		if !maps.Equal(s.Players[0].Resources, before) {
			t.Errorf("%s: Resources changed to %v", tc.name, s.Players[0].Resources)
		}
	}

	s := fixedMatch(t)
	s.Players[1].Eliminated = true
	for _, seat := range []int{1, -1, 2} {
		if err := s.Exchange(exchangeContent(), seat, "base:credits", "base:materials", 3); err == nil {
			t.Errorf("Seat %d traded", seat)
		}
	}
}
