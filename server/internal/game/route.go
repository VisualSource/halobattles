package game

import (
	"cmp"
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

// Route is the route an Army of seat takes from one Planet to another,
// given each Planet's owner (Neutral for none). It goes straight through its
// own Planets and neutral ones; entering an enemy Planet ends the move there
// with a Battle. So it enters as few enemy Planets as it can, whatever the
// time; then it's the fastest; then, on equal times, it passes the fewest
// neutral Planets. Ties after that go to the lowest Planet-id sequence,
// compared element by element in byte-wise order. The start isn't entered,
// so it isn't counted. client/src/match/route.ts is a port of this, and both
// pass testdata/routing.
func Route(lanes map[string]map[string]int64, owner func(planet string) int, seat int, from, to string) (path []string, ms int64, ok bool) {
	if from == to {
		return []string{from}, 0, true
	}
	type label struct {
		enemies, neutrals int
		ms                int64
		path              []string
	}
	better := func(a, b label) bool {
		return cmp.Or(
			cmp.Compare(a.enemies, b.enemies),
			cmp.Compare(a.ms, b.ms),
			cmp.Compare(a.neutrals, b.neutrals),
			slices.Compare(a.path, b.path),
		) < 0
	}
	best := map[string]label{from: {path: []string{from}}}
	done := map[string]bool{}
	for {
		// The best unsettled Planet; a few dozen Planets need no heap.
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
		for next, t := range lanes[cur] {
			l := best[cur]
			l.ms += t
			l.path = append(slices.Clone(l.path), next)
			switch owner(next) {
			case seat:
			case Neutral:
				l.neutrals++
			default:
				l.enemies++
			}
			if old, seen := best[next]; !done[next] && (!seen || better(l, old)) {
				best[next] = l
			}
		}
	}
}
