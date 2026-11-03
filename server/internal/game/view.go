package game

import (
	"cmp"
	"maps"
	"reflect"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// View is one player's picture of the Match: the only state a player is
// ever sent.
type View struct {
	Time     int64
	Map      string
	You      int // the viewer's Seat
	Players  []PlayerView
	Planets  []PlanetView // only Planets in vision, sorted by id
	Armies   []ArmyView   // only Armies in vision, sorted by id
	Battles  []BattleView // only the viewer's own Battles, as a side, sorted by id
	Economy  Economy
	Research Research
	Hold     Hold // public
}

// Research is the viewer's own: their Research rate, Projects, hand and
// saved Projects.
type Research struct {
	Rates    map[string]int // Research per second, by field
	Projects []Project      // at most one per field
	Hands    map[string][]string
	Saved    []Saved
}

// Hold is the running win-hold countdown, if any.
type Hold struct {
	Team int   // Neutral for none; in a free-for-all, a Seat
	Ends int64 // Match Time
}

// Economy is the viewer's own: other players' Resources and Command Points
// are never part of a View.
type Economy struct {
	Resources         map[string]int
	CommandPointsUsed int
	CommandPointsCap  int
	PaydayStart       int64          // Match Time of the last Payday, or Start
	PaydayEnd         int64          // Match Time of the next Payday
	Caps              map[string]int // Stockpile caps, storage included
	Projected         map[string]int // what the next Payday would change, if it came now; before caps
}

// PlayerView is the public part of every player.
type PlayerView struct {
	Seat        int
	User        string
	DisplayName string
	Faction     string
	Team        int // with Teams on, Team 1 is 0; in a free-for-all, the Seat
	PlanetCount int
	Eliminated  bool
	Connected   bool
	GraceEnds   int64  // Match Time; 0 while connected
	Bot         string // a Bot's difficulty id; "" for a player
	Stats       *Stats // only in a Spectator's View
}

// Stats is what a Spectator sees of a player's economy.
type Stats struct {
	Resources         map[string]int
	Income            map[string]int // what the next Payday would change
	CommandPointsUsed int
	CommandPointsCap  int
}

// Spectating is the You of a Spectator's View: no Seat, so nothing in the
// Match is its own.
const Spectating = -2

// PlanetView is a Planet in vision. Other players' queues stay hidden.
type PlanetView struct {
	ID         string
	Owner      int
	Capital    bool
	Locked     bool
	Buildings  []string
	Stacks     [StacksPerPlanet]Stack
	Queue      []QueueItem // only on the viewer's own Planets
	UnitQueue  []QueueItem // every unit queue, by slot then order; own only
	Rally      int         // own only
	RallyPoint string      // own only
	Richness   map[string]string
	Labs       map[int][]string // the Techs each Lab holds, by Building Slot
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
	Raid        bool     // own only: nobody else sees a Raid at all
}

// BattleView is a Battle the viewer is a side of, as their side sees it.
// Others see only the Planet's Locked flag.
type BattleView struct {
	ID       uint32
	Planet   string
	Attacker int
	Defender int
	Started  int64
	Raid     bool
	Field    *battle.Field // the same for the whole Battle
	battle.Snapshot
}

// visible is the set of Planets a player sees, sharing their Teammates'
// vision: those the Team owns, every Planet one Lane away, and any the
// Team's Armies have sighted lately.
func (s *State) visible(seat int) map[string]bool {
	v := map[string]bool{}
	for _, p := range s.Players {
		if !s.Allied(seat, p.Seat) {
			continue
		}
		for id, until := range p.Sighted {
			if until > s.Time {
				v[id] = true
			}
		}
	}
	for id, p := range s.Planets {
		if s.Allied(seat, p.Owner) {
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
func (s *State) View(c *cs.Content, seat int) View { return s.view(c, seat) }

// SpectatorView is the Match as a Spectator sees it: every Planet, Army and
// Battle without fog, where every Army is headed, and each player's Stats.
// Construction and unit queues and Projects stay private, and a Spectator
// has no economy or research of its own.
func (s *State) SpectatorView(c *cs.Content) View { return s.view(c, Spectating) }

func (s *State) view(c *cs.Content, seat int) View {
	all := seat == Spectating
	v := View{Time: s.Time, Map: s.Map, You: seat, Hold: Hold{Team: s.HoldTeam, Ends: s.HoldEnds}}
	if !all {
		used, cp := s.commandPoints(c, seat)
		v.Economy = Economy{
			Resources: maps.Clone(s.Players[seat].Resources), CommandPointsUsed: used, CommandPointsCap: cp,
			PaydayStart: s.NextPayday - s.PaydayEvery, PaydayEnd: s.NextPayday,
			Caps: s.caps(c, seat), Projected: s.paydayNet(c, seat),
		}
		pl := s.Players[seat]
		v.Research = Research{
			Rates: s.researchRates(c, seat), Projects: slices.Clone(pl.Projects),
			Hands: maps.Clone(pl.Hands), Saved: slices.Clone(pl.Saved),
		}
		for i, card := range v.Research.Saved {
			if card.Lost {
				v.Research.Saved[i].Cost = s.recoveryCost(c, seat, card.Tech)
			}
		}
	}
	counts := map[int]int{}
	for _, p := range s.Planets {
		counts[p.Owner]++
	}
	var visible map[string]bool
	if all {
		visible = map[string]bool{}
		for id := range s.Planets {
			visible[id] = true
		}
	} else {
		visible = s.visible(seat)
	}
	for _, p := range s.Players {
		pv := PlayerView{
			Seat: p.Seat, User: p.User, DisplayName: p.DisplayName, Faction: p.Faction, Team: p.Team, PlanetCount: counts[p.Seat],
			Eliminated: p.Eliminated, Connected: !p.Disconnected, GraceEnds: p.GraceEnds, Bot: p.Bot,
		}
		if all {
			used, cp := s.commandPoints(c, p.Seat)
			pv.Stats = &Stats{Resources: maps.Clone(p.Resources), Income: s.paydayNet(c, p.Seat), CommandPointsUsed: used, CommandPointsCap: cp}
		}
		v.Players = append(v.Players, pv)
	}
	for _, id := range slices.Sorted(maps.Keys(visible)) {
		p := s.Planets[id]
		pv := PlanetView{ID: id, Owner: p.Owner, Capital: p.Capital, Locked: p.Locked, Buildings: slices.Clone(p.Buildings), Richness: p.Richness}
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
			pv.Rally, pv.RallyPoint = p.Rally, p.RallyPoint
		}
		for slot, techs := range p.Techs { // public, so a raid on a Lab can be planned
			if c.Buildings[p.Buildings[slot]].TechSlots != nil && len(techs) > 0 {
				if pv.Labs == nil {
					pv.Labs = map[int][]string{}
				}
				pv.Labs[slot] = slices.Clone(techs)
			}
		}
		v.Planets = append(v.Planets, pv)
	}
	for _, id := range slices.Sorted(maps.Keys(s.Armies)) {
		a := s.Armies[id]
		ours := s.Allied(a.Owner, seat) // the viewer's or a Teammate's
		if !all && !ours && !visible[a.To] && (a.Waiting || !visible[a.From]) ||
			a.Raid && !all && a.Owner != seat { // hidden even from Teammates, until detection (#101)
			continue
		}
		av := ArmyView{
			ID: a.ID, Owner: a.Owner, Units: slices.Clone(a.Units), From: a.From, To: a.To,
			Departed: a.Departed, Arrives: a.Arrives, Waiting: a.Waiting,
		}
		if ours || all { // a Spectator sees where every Army is going
			av.Destination, av.ToStack, av.Path, av.Raid = a.destination(), a.ToStack, slices.Clone(a.Path), a.Raid
		}
		v.Armies = append(v.Armies, av)
	}
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		b := s.Battles[id]
		switch {
		case all:
			v.Battles = append(v.Battles, b.view(battle.NoSide))
		case s.Allied(seat, b.Attacker): // the viewer's side, or a Teammate's
			v.Battles = append(v.Battles, b.view(battle.Attacker))
		case s.Allied(seat, b.Defender):
			v.Battles = append(v.Battles, b.view(battle.Defender))
		}
	}
	return v
}

// view is the Battle as side sees it; NoSide is a Spectator's, both sides.
func (b *Battle) view(side battle.Side) BattleView {
	bv := BattleView{ID: b.ID, Planet: b.Planet, Attacker: b.Attacker, Defender: b.Defender, Started: b.Started, Field: b.Sim.Field, Raid: b.Sim.Raid}
	if side == battle.NoSide {
		bv.Snapshot = b.Sim.SnapshotAll()
	} else {
		bv.Snapshot = b.Sim.Snapshot(side)
	}
	return bv
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
	Research       *Research    // nil when unchanged
	Hold           *Hold        // nil when unchanged
}

// Diff reports what changed from prev to next, and whether anything did.
// The passing of Match Time alone is not a change.
func Diff(prev, next View) (Delta, bool) {
	d := Delta{Time: next.Time}
	for i, p := range next.Players {
		if i >= len(prev.Players) || !reflect.DeepEqual(prev.Players[i], p) {
			d.Players = append(d.Players, p)
		}
	}
	d.Planets, d.RemovedPlanets = diffBy(prev.Planets, next.Planets, func(p PlanetView) string { return p.ID })
	d.Armies, d.RemovedArmies = diffBy(prev.Armies, next.Armies, func(a ArmyView) uint32 { return a.ID })
	d.Battles, d.RemovedBattles = diffBy(prev.Battles, next.Battles, func(b BattleView) uint32 { return b.ID })
	if !reflect.DeepEqual(prev.Economy, next.Economy) {
		d.Economy = &next.Economy
	}
	if !reflect.DeepEqual(prev.Research, next.Research) {
		d.Research = &next.Research
	}
	if prev.Hold != next.Hold {
		d.Hold = &next.Hold
	}
	changed := len(d.Players)+len(d.Planets)+len(d.RemovedPlanets)+len(d.Armies)+len(d.RemovedArmies)+
		len(d.Battles)+len(d.RemovedBattles) > 0 || d.Economy != nil || d.Research != nil || d.Hold != nil
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
