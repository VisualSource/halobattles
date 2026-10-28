package battle

import (
	"fmt"
	"testing"
)

func bigRun(t *testing.T, label string) {
	c := baseContent(t)
	r := ruleset(c)
	three := func(f Force) Force {
		return Force{Formations: [][]Slot{f.Formations[0], f.Formations[0], f.Formations[0]}, Buildings: f.Buildings}
	}
	line := label + ":"
	for _, mm := range [][2]string{{"base:unsc", "base:covenant"}, {"base:covenant", "base:unsc"}} {
		wins, ticks := 0, 0
		reasons := map[string]int{}
		for seed := range uint64(100) {
			s := New(c, r, Generate(c, r.Battlefield, nil, seed), three(kitForce(c, mm[0], false)), three(kitForce(c, mm[1], true)), seed)
			s.Controllers = [2]Controller{NewAI(WeightsOf(c.Factions[mm[0]].Ai)), NewAI(WeightsOf(c.Factions[mm[1]].Ai))}
			for !s.Over {
				s.Step()
			}
			ticks += s.Tick
			reasons[s.Reason]++
			if s.Winner == Attacker {
				wins++
			}
		}
		line += fmt.Sprintf("  %s attacks %d%% %ds (e%d p%d t%d)", mm[0][5:], wins, ticks/500, reasons[Eliminated], reasons[HeldPoints], reasons[TimeUp])
	}
	t.Log(line)
}

func TestZZBig(t *testing.T) { bigRun(t, "now") }
