package game

import (
	"cmp"
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
	Armies  []ArmyView   // only Armies in vision, sorted by id
	Battles []BattleView // only the viewer's own Battles, as a side, sorted by id
	Economy Economy
	Hold    Hold // public
}

// Hold is the running win-hold countdown, if any.
type Hold struct {
	Seat int   // Neutral for none
	Ends int64 // Match Time
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
	Eliminated  bool
	Connected   bool
	GraceEnds   int64 // Match Time; 0 while connected
}

// PlanetView is a Planet in vision. Other players' queues stay hidden.
type PlanetView struct {
	ID        string
	Owner     int
	Capital   bool
	Locked    bool
	Buildings []string
	Stacks    [StacksPerPlanet]Stack
	Queue     []QueueItem // only on the viewer's own Planets
	UnitQueue []QueueItem // every unit queue, by slot then order; own only
	Rally     int         // own only
}

// ArmyView is an Army in vision. Other players' show only the current hop,
// never where they're headed.
type ArmyView struct {
	ID          uint32
	Owner       int
	Units       []UnitSlot
	From, To    string
	Departed    int64
	Arrives     int64
	Waiting     bool
	Destination string   // own only
	ToStack     int      // own only
	Path        []string // own only: the Planets after To, in order
}

// BattleView is a Battle the viewer is a side of, as it stands after the
// Rounds played out so far. Others see only the Planet's Locked flag.
type BattleView struct {
	ID       uint32
	Planet   string
	Attacker int
	Defender int
	Started  int64
	RoundMs  int64
	Round    int         // Rounds completed
	Roster   []Combatant // with each one's Shield, Armor and HP now
}

// visible is the set of Planets a player sees: those they own, every Planet
// one Lane away, and any their Armies have sighted lately.
func (s *State) visible(seat int) map[string]bool {
	v := map[string]bool{}
	for id, until := range s.Players[seat].Sighted {
		if until > s.Time {
			v[id] = true
		}
	}
	for id, p := range s.Planets {
		if p.Owner == seat {
			v[id] = true
			for n := range s.Lanes[id] {
				v[n] = true
			}
		}
	}
	return v
}

func (s *State) sees(seat int, planet string) bool { return s.visible(seat)[planet] }

// View is the only place vision is enforced. Planets outside vision are
// left out, so their owner and Capital flag stay hidden. An Army is seen
// while either end of its Lane hop is in vision, or the Planet it waits at.
func (s *State) View(c *cs.Content, seat int) View {
	v := View{Time: s.Time, Map: s.Map, You: seat, Hold: Hold{Seat: s.HoldSeat, Ends: s.HoldEnds}}
	used, cp := s.commandPoints(c, seat)
	v.Economy = Economy{
		Resources: maps.Clone(s.Players[seat].Resources), CommandPointsUsed: used, CommandPointsCap: cp,
		PaydayStart: s.NextPayday - s.PaydayEvery, PaydayEnd: s.NextPayday,
	}
	counts := map[int]int{}
	for _, p := range s.Planets {
		counts[p.Owner]++
	}
	visible := s.visible(seat)
	for _, p := range s.Players {
		v.Players = append(v.Players, PlayerView{
			Seat: p.Seat, User: p.User, DisplayName: p.DisplayName, Faction: p.Faction, PlanetCount: counts[p.Seat],
			Eliminated: p.Eliminated, Connected: !p.Disconnected, GraceEnds: p.GraceEnds,
		})
	}
	for _, id := range slices.Sorted(maps.Keys(visible)) {
		p := s.Planets[id]
		pv := PlanetView{ID: id, Owner: p.Owner, Capital: p.Capital, Locked: p.Locked, Buildings: slices.Clone(p.Buildings)}
		for i, st := range p.Stacks {
			pv.Stacks[i] = slices.Clone(st)
		}
		if p.Owner == seat {
			if len(p.Queue) > 0 { // nil when empty, so Diff sees no change
				pv.Queue = slices.Clone(p.Queue)
			}
			for _, slot := range slices.Sorted(maps.Keys(p.UnitQueues)) {
				pv.UnitQueue = append(pv.UnitQueue, p.UnitQueues[slot]...)
			}
			pv.Rally = p.Rally
		}
		v.Planets = append(v.Planets, pv)
	}
	for _, id := range slices.Sorted(maps.Keys(s.Armies)) {
		a := s.Armies[id]
		mine := a.Owner == seat
		if !mine && !visible[a.To] && (a.Waiting || !visible[a.From]) {
			continue
		}
		av := ArmyView{
			ID: a.ID, Owner: a.Owner, Units: slices.Clone(a.Units), From: a.From, To: a.To,
			Departed: a.Departed, Arrives: a.Arrives, Waiting: a.Waiting,
		}
		if mine {
			av.Destination, av.ToStack, av.Path = a.destination(), a.ToStack, slices.Clone(a.Path)
		}
		v.Armies = append(v.Armies, av)
	}
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		if b := s.Battles[id]; b.Attacker == seat || b.Defender == seat {
			v.Battles = append(v.Battles, b.view(s.Time))
		}
	}
	return v
}

// view replays the Rounds whose Round duration has passed onto the roster.
func (b *Battle) view(now int64) BattleView {
	done := 0
	for done < b.Sent && b.Started+int64(done+1)*b.RoundMs <= now {
		done++
	}
	roster := slices.Clone(b.Result.Roster)
	at := map[string]int{}
	for i, cb := range roster {
		at[cb.ID] = i
	}
	for _, round := range b.Result.Rounds[:done] {
		for _, a := range round {
			t := &roster[at[a.Target]]
			t.Shield, t.Armor, t.HP = t.Shield-a.ShieldDmg, t.Armor-a.ArmorDmg, t.HP-a.HPDmg
		}
	}
	return BattleView{
		ID: b.ID, Planet: b.Planet, Attacker: b.Attacker, Defender: b.Defender,
		Started: b.Started, RoundMs: b.RoundMs, Round: done, Roster: roster,
	}
}

// Delta is what changed between two Views of the same player: whole
// upserted entities, plus the ids of those that left vision.
type Delta struct {
	Time           int64
	Players        []PlayerView
	Planets        []PlanetView // sorted by id
	RemovedPlanets []string     // sorted
	Armies         []ArmyView   // sorted by id
	RemovedArmies  []uint32     // sorted
	Battles        []BattleView // sorted by id
	RemovedBattles []uint32     // sorted
	Economy        *Economy     // nil when unchanged
	Hold           *Hold        // nil when unchanged
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
	d.Planets, d.RemovedPlanets = diffBy(prev.Planets, next.Planets, func(p PlanetView) string { return p.ID })
	d.Armies, d.RemovedArmies = diffBy(prev.Armies, next.Armies, func(a ArmyView) uint32 { return a.ID })
	d.Battles, d.RemovedBattles = diffBy(prev.Battles, next.Battles, func(b BattleView) uint32 { return b.ID })
	if !reflect.DeepEqual(prev.Economy, next.Economy) {
		d.Economy = &next.Economy
	}
	if prev.Hold != next.Hold {
		d.Hold = &next.Hold
	}
	changed := len(d.Players)+len(d.Planets)+len(d.RemovedPlanets)+len(d.Armies)+len(d.RemovedArmies)+
		len(d.Battles)+len(d.RemovedBattles) > 0 || d.Economy != nil || d.Hold != nil
	return d, changed
}

// diffBy compares two id-sorted entity lists: the new or changed ones, and
// the sorted ids of those gone.
func diffBy[T any, K cmp.Ordered](prev, next []T, id func(T) K) (upserts []T, removed []K) {
	old := map[K]T{}
	for _, e := range prev {
		old[id(e)] = e
	}
	for _, e := range next {
		if o, ok := old[id(e)]; !ok || !reflect.DeepEqual(o, e) {
			upserts = append(upserts, e)
		}
		delete(old, id(e))
	}
	return upserts, slices.Sorted(maps.Keys(old))
}
