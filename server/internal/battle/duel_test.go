package battle

import (
	"cmp"
	"fmt"
	"os"
	"slices"
	"strings"
	"testing"
)

func TestTheDuelMatrixHoldsTheCounters(t *testing.T) {
	c := modContent(t)
	const seeds uint64 = 100              // each fought on both sides: fewer let a peer pair's luck cross the 40–60% band
	full := os.Getenv("HALO_DUELS") != "" // every pair, not just those with an expected outcome
	cells := map[[2]string]DuelCell{}
	DuelMatrix(c, ruleset(c), seeds, full, func(d DuelCell) { cells[[2]string{d.A, d.B}] = d })
	units := DuelUnits(c)
	var table strings.Builder
	fmt.Fprintf(&table, "%-20s", "")
	for _, b := range units {
		fmt.Fprintf(&table, " %5.5s", strings.TrimPrefix(b, "base:"))
	}
	for _, a := range units {
		fmt.Fprintf(&table, "\n%-20s", strings.TrimPrefix(a, "base:"))
		for _, b := range units {
			d, ok := cells[[2]string{a, b}]
			if !ok {
				fmt.Fprintf(&table, " %5s", "")
				continue
			}
			mark := map[string]string{DuelWin: "*", DuelEven: "=", "": " "}[d.Want]
			if d.Missed() {
				mark = "!"
			}
			fmt.Fprintf(&table, " %3.0f%%%s", d.Rate*100, mark)
		}
	}
	misses := slices.SortedFunc(func(yield func(DuelCell) bool) {
		for _, d := range cells {
			if d.Missed() && !yield(d) {
				return
			}
		}
	}, func(x, y DuelCell) int { return cmp.Or(cmp.Compare(x.A, y.A), cmp.Compare(x.B, y.B)) })
	for _, d := range misses {
		if d.Want == DuelWin {
			t.Errorf("%d %s (%s) against %d %s: wins %.0f%%, want at least 80%%", d.NA, d.A, duelTier(c, d.A, d.B), d.NB, d.B, d.Rate*100)
		} else {
			t.Errorf("%d %s against %d %s, its peer: wins %.0f%%, want 40–60%%", d.NA, d.A, d.NB, d.B, d.Rate*100)
		}
	}
	t.Logf("row's win rate against column (peers in equal numbers, the rest at %d CP a side); * should win, = should be even, ! isn't:\n%s", DuelBudget, table.String())
}

// The Starting Kits, fought on open ground as a duel (no AI, no buildings),
// on both sides, come out about even: a Faction's kit isn't the reason its
// attacks win or lose. A Ghost that folded against vehicles once lost the
// Covenant kit 70% of these, unseen by the pairs above.
func TestTheStartingKitsAreEvenOnOpenGround(t *testing.T) {
	c := modContent(t)
	r := ruleset(c)
	kits := func(a, b string, seed uint64) float64 {
		return outcome(NewDuelOf(c, r, kitForce(c, a, false), kitForce(c, b, false), seed))
	}
	const seeds = 100
	wins := 0.0
	for seed := range uint64(seeds) {
		wins += (kits("base:unsc", "base:covenant", seed) + 1 - kits("base:covenant", "base:unsc", seed)) / 2
	}
	if rate := wins / seeds; rate < 0.4 || rate > 0.6 {
		t.Errorf("the UNSC kit beats the Covenant kit %.0f%%, want 40–60%%", rate*100)
	}
}
