package bot

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func content() *cs.Content {
	w := func(v float64) *cs.BotWeight { x := cs.BotWeight(v); return &x }
	return &cs.Content{
		Rulesets: map[string]cs.Ruleset{game.RulesetID: {BotDifficulties: []cs.BotDifficulty{
			{ID: "easy", ThinkSeconds: 10},
			{ID: "hard", ThinkSeconds: 2, Weights: &cs.BotGoalWeights{Attack: w(2)}},
		}}},
		Factions: map[string]cs.Faction{"base:covenant": {Ai: &cs.AIWeights{Bot: &cs.BotWeights{Attack: w(1.5), Economy: w(0.5)}}}},
	}
}

func TestWeightsAreTheDifficultysTimesTheFactions(t *testing.T) {
	b := New(content(), 1, "base:covenant", "hard", 7, 0)
	if want := (Weights{Expand: 1, Attack: 3, Defend: 1, Economy: 0.5, Army: 1, Research: 1}); b.Weights != want {
		t.Errorf("weights %+v, want %+v", b.Weights, want)
	}
	if b := New(content(), 1, "base:unsc", "easy", 7, 0); b.Weights != (Weights{1, 1, 1, 1, 1, 1}) {
		t.Errorf("a Faction with no bot block: weights %+v, want all 1", b.Weights)
	}
}

func TestABotThinksOncePerItsInterval(t *testing.T) {
	b := New(content(), 0, "base:unsc", "hard", 7, 500)
	if b.Due(0) || !b.Due(500) {
		t.Fatal("the first think should wait for its 500 ms offset")
	}
	b.Think(game.View{Time: 500})
	if b.Due(2499) || !b.Due(2500) {
		t.Error("Hard thinks every 2 s")
	}
}
