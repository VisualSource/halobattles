package game

import (
	"math"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// laneTime is a Lane's travel time in ms: its explicit time, or its length
// (by default the straight-line distance) times its Lane type's multiplier.
// One length unit is 1 s.
func laneTime(l cs.Lane, from, to cs.Position, types map[string]float64) int64 {
	if l.Time != nil {
		return int64(math.Round(*l.Time * 1000))
	}
	length := math.Hypot(to.X-from.X, to.Y-from.Y)
	if l.Length != nil {
		length = *l.Length
	}
	return int64(math.Round(length * types[l.Type] * 1000))
}

// Route is the fastest route from one Planet to another, passing only
// through Planets the player owns: entering any other Planet ends the move,
// so it can only be the last. The start needn't be owned: leaving a Planet
// isn't entering it. Ties go to the lowest Planet-id sequence, compared element by
// element in byte-wise order. client/src/match/route.ts is a port of this,
// and both pass testdata/routing.
func Route(lanes map[string]map[string]int64, owned func(planet string) bool, from, to string) (path []string, ms int64, ok bool) {
	if from == to {
		return []string{from}, 0, true
	}
	type label struct {
		ms   int64
		path []string
	}
	better := func(a, b label) bool {
		return a.ms < b.ms || a.ms == b.ms && slices.Compare(a.path, b.path) < 0
	}
	best := map[string]label{from: {0, []string{from}}}
	done := map[string]bool{}
	for {
		// The closest unsettled Planet; a few dozen Planets need no heap.
		cur, found := "", false
		for id, l := range best {
			if !done[id] && (!found || better(l, best[cur])) {
				cur, found = id, true
			}
		}
		if !found {
			return nil, 0, false
		}
		if cur == to {
			return best[cur].path, best[cur].ms, true
		}
		done[cur] = true
		if cur != from && !owned(cur) {
			continue // an attack ends here
		}
		for next, t := range lanes[cur] {
			l := label{best[cur].ms + t, append(slices.Clone(best[cur].path), next)}
			if old, seen := best[next]; !done[next] && (!seen || better(l, old)) {
				best[next] = l
			}
		}
	}
}
