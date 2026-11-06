package main

import (
	"strings"
	"testing"
)

func TestALogSummaryNamesBattlesStatsAndRefusals(t *testing.T) {
	log := `{"kind":"match","time":0,"data":{"version":1,"map":"base:war-amp","seats":[{"DisplayName":"Ann","Faction":"base:unsc"},{"DisplayName":"Bo","Faction":"base:covenant","Bot":"hard"}]}}
{"kind":"command","time":1000,"data":{"seat":0,"command":"OfferTruce","rejected":"you're on the same Team"}}
{"kind":"command","time":2000,"data":{"seat":0,"command":"OfferTruce","rejected":"you're on the same Team"}}
{"kind":"stats","time":60000,"data":{"seat":0,"Resources":{"base:credits":400},"Income":{"base:credits":50},"CommandPointsUsed":3,"CommandPointsCap":20,"planets":2,"stacked":5,"moving":2}}
{"kind":"battle","time":125000,"data":{"battle":4,"planet":"harvest","attacker":0,"defender":-1,"winner":-1,"ticks":500,"result":{"reason":"elimination","start":[{"base:marine":19},{"base:aggressor-sentinel":5}],"left":[{},{"base:aggressor-sentinel":3}],"damage":[40,250]}}}
{"kind":"end","time":900000,"data":{"Winner":1,"Reason":"last-standing"}}
`
	var out strings.Builder
	if err := summarize(strings.NewReader(log), &out); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"1 Bo (base:covenant, Bot hard)",
		"#4 2:05 harvest: Ann -> Neutral, defender won in 100s (elimination)",
		"attacker marine 19→0, dealt 40",
		"defender aggressor-sentinel 5→3, dealt 250",
		"1:00  2 Planets, 7 units (2 moving), CP 3/20, have credits 400, income credits 50",
		`2x "you're on the same Team": Ann OfferTruce`,
		"Ended at 15:00: Bo won (last-standing)",
	} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("summary lacks %q:\n%s", want, out.String())
		}
	}
}
