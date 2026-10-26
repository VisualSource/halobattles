package game

import (
	"maps"
	"reflect"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// View is one player's picture of the Match: the only state a player is
// ever sent.
type View struct {
	Time    int64
	Map     string
	You     int // the viewer's Seat
	Players []PlayerView
	Planets []PlanetView // only Planets in vision, sorted by id
	Economy Economy
}

// Economy is the viewer's own: other players' Resources and Command Points
// are never part of a View.
type Economy struct {
	Resources         map[string]int
	CommandPointsUsed int
	CommandPointsCap  int
	PaydayStart       int64 // Match Time of the last Payday, or Start
	PaydayEnd         int64 // Match Time of the next Payday
}

// PlayerView is the public part of every player.
type PlayerView struct {
	Seat        int
	User        string
	DisplayName string
	Faction     string
	PlanetCount int
}

// PlanetView is a Planet in vision. Queues will be added for owned Planets
// only; other players' Resources are never part of a View.
type PlanetView struct {
	ID        string
	Owner     int
	Capital   bool
	Locked    bool
	Buildings []string
	Stacks    [StacksPerPlanet]Stack
}

// View is the only place vision is enforced: a player sees the Planets they
// own and every Planet one Lane away. Anything else is left out, so its
// owner and Capital flag stay hidden.
func (s *State) View(c *cs.Content, seat int) View {
	v := View{Time: s.Time, Map: s.Map, You: seat}
	used, cp := s.commandPoints(c, seat)
	v.Economy = Economy{
		Resources: maps.Clone(s.Players[seat].Resources), CommandPointsUsed: used, CommandPointsCap: cp,
		PaydayStart: s.NextPayday - s.PaydayEvery, PaydayEnd: s.NextPayday,
	}
	counts := map[int]int{}
	visible := map[string]bool{}
	for id, p := range s.Planets {
		counts[p.Owner]++
		if p.Owner == seat {
			visible[id] = true
			for _, n := range s.Neighbours[id] {
				visible[n] = true
			}
		}
	}
	for _, p := range s.Players {
		v.Players = append(v.Players, PlayerView{
			Seat: p.Seat, User: p.User, DisplayName: p.DisplayName, Faction: p.Faction, PlanetCount: counts[p.Seat],
		})
	}
	for _, id := range slices.Sorted(maps.Keys(visible)) {
		p := s.Planets[id]
		pv := PlanetView{ID: id, Owner: p.Owner, Capital: p.Capital, Locked: p.Locked, Buildings: slices.Clone(p.Buildings)}
		for i, st := range p.Stacks {
			pv.Stacks[i] = slices.Clone(st)
		}
		v.Planets = append(v.Planets, pv)
	}
	return v
}

// Delta is what changed between two Views of the same player: whole
// upserted entities, plus the ids of Planets that left vision.
type Delta struct {
	Time           int64
	Players        []PlayerView
	Planets        []PlanetView // sorted by id
	RemovedPlanets []string     // sorted
	Economy        *Economy     // nil when unchanged
}

// Diff reports what changed from prev to next, and whether anything did.
// The passing of Match Time alone is not a change.
func Diff(prev, next View) (Delta, bool) {
	d := Delta{Time: next.Time}
	for i, p := range next.Players {
		if i >= len(prev.Players) || prev.Players[i] != p {
			d.Players = append(d.Players, p)
		}
	}
	old := map[string]PlanetView{}
	for _, p := range prev.Planets {
		old[p.ID] = p
	}
	for _, p := range next.Planets {
		if o, ok := old[p.ID]; !ok || !reflect.DeepEqual(o, p) {
			d.Planets = append(d.Planets, p)
		}
		delete(old, p.ID)
	}
	d.RemovedPlanets = slices.Sorted(maps.Keys(old))
	if !reflect.DeepEqual(prev.Economy, next.Economy) {
		d.Economy = &next.Economy
	}
	changed := len(d.Players)+len(d.Planets)+len(d.RemovedPlanets) > 0 || d.Economy != nil
	return d, changed
}
