package battle

import (
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// kitForce is a Faction's Starting Kit as a Force: its Stacks as formations,
// its buildings for a defender.
func kitForce(c *cs.Content, faction string, defending bool) Force {
	kit := c.Factions[faction].StartingKit
	var f Force
	for _, st := range kit.Stacks {
		var slots []Slot
		for i, e := range st {
			slots = append(slots, Slot{string(e.Unit), e.Count, i})
		}
		f.Formations = append(f.Formations, slots)
	}
	if defending {
		for _, b := range kit.Buildings {
			f.Buildings = append(f.Buildings, string(b))
		}
	}
	return f
}

// The roster's pacing and balance targets: the two Starting Kits, alone and
// three Stacks a side, fight for 1–3 minutes on average, and either attacking the other wins 45–55% of the
// time, each side playing its Faction's AI weights. Over 100 seeds the rate
// is within about 5 points of the truth, so the test allows 40–60%.
func TestStartingKitsArePacedAndBalanced(t *testing.T) {
	if testing.Short() {
		t.Skip("hundreds of Battles")
	}
	c := baseContent(t)
	r := ruleset(c)
	// Big: three Stacks a side, where spreading over the points and roles
	// count for more.
	three := func(f Force) Force {
		return Force{Formations: [][]Slot{f.Formations[0], f.Formations[0], f.Formations[0]}, Buildings: f.Buildings}
	}
	for _, tc := range []struct {
		name, attack, defend string
		big                  bool
	}{
		{"UNSC attacks Covenant", "base:unsc", "base:covenant", false},
		{"Covenant attacks UNSC", "base:covenant", "base:unsc", false},
		{"big: UNSC attacks Covenant", "base:unsc", "base:covenant", true},
		{"big: Covenant attacks UNSC", "base:covenant", "base:unsc", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			const seeds = 100
			wins, ticks := 0, 0
			reasons := map[string]int{}
			for seed := range uint64(seeds) {
				attack, defend := kitForce(c, tc.attack, false), kitForce(c, tc.defend, true)
				if tc.big {
					attack, defend = three(attack), three(defend)
				}
				s := New(c, r, Generate(c, r.Battlefield, nil, seed), attack, defend, seed)
				s.Controllers = [2]Controller{
					NewAI(WeightsOf(c.Factions[tc.attack].Ai)), NewAI(WeightsOf(c.Factions[tc.defend].Ai)),
				}
				for !s.Over {
					s.Step()
				}
				ticks += s.Tick
				reasons[s.Reason]++
				if s.Winner == Attacker {
					wins++
				}
			}
			mean := float64(ticks) / seeds / TicksPerSecond
			rate := float64(wins) / seeds
			t.Logf("%.0f s on average; the attacker wins %.0f%%; endings %v", mean, rate*100, reasons)
			if mean < 60 || mean > 180 {
				t.Errorf("Starting Kits fight for %.0f s on average, want 60–180", mean)
			}
			if rate < 0.4 || rate > 0.6 {
				t.Errorf("the attacker wins %.0f%%, want 45–55%% (40–60%% allowing for noise): the Starting Kits are out of balance", rate*100)
			}
		})
	}
}
