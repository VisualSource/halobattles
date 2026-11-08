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
