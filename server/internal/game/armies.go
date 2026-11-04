package game

import (
	"cmp"
	"errors"
	"fmt"
	"maps"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Army is a group of units travelling along Lanes. It's on one Lane hop at a
// time, From to To, or Waiting in orbit at To.
type Army struct {
	ID       uint32
	Owner    int
	Units    []UnitSlot // one per unit type
	From, To string
	Departed int64    // Match Time
	Arrives  int64    // Match Time
	Path     []string // the Planets still to go after To
	ToStack  int      // the Stack it merges into on arrival
	Waiting  bool
	// Retreating after a lost Battle: it passes through any Planet without
	// stopping, and can't be re-ordered.
	Retreating bool
	// Raid: it fights for the target's buildings, never the Planet, and only
	// its owner sees it on the way.
	Raid bool
}

// ArmyUnits is part of an order: count of a unit from one Stack.
type ArmyUnits struct {
	Stack int
	Unit  string
	Count int
}

// RaidTurnedBack tells a Raid's owner it found no buildings at Planet.
type RaidTurnedBack struct {
	Seat   int
	Planet string
}

// PlanetCaptured tells Viewers that a Planet changed hands.
type PlanetCaptured struct {
	Planet   string
	From, To int
	Viewers  []int // Seats
}

func (s *State) owns(seat int) func(string) bool {
	return func(id string) bool { return s.Planets[id] != nil && s.Planets[id].Owner == seat }
}

// ownerFor is each Planet's owner as Route sees it for seat: a Teammate's
// Planet counts as seat's own, since its Armies go straight through.
func (s *State) ownerFor(seat int) func(string) int {
	return func(id string) int {
		p := s.Planets[id]
		switch {
		case p == nil:
			return Neutral
		case s.Allied(seat, p.Owner):
			return seat
		}
		return p.Owner
	}
}

// passable reports whether an Army of seat may go on through p rather than
// end its move there: its own and its Teammates' Planets, and neutral ones.
// A Locked one makes it wait in orbit first.
func (s *State) passable(seat int, p *Planet) bool {
	return s.Allied(seat, p.Owner) || p.Owner == Neutral
}

// errAllyPlanet: Stacks stay one player's, so no Army lands on a Teammate's Planet.
var errAllyPlanet = errors.New("you can pass through a Teammate's Planet, but not stop there")

// OrderArmy forms an Army from units on one of the player's Planets, taken
// from any of its Stacks, and sends it on the fastest route to another.
func (s *State) OrderArmy(seat int, from string, units []ArmyUnits, to string, toStack int) error {
	p, err := s.ownedPlanet(seat, from)
	if err != nil {
		return err
	}
	if err := s.checkTarget(seat, to, toStack); err != nil {
		return err
	}
	route, _, ok := Route(s.Lanes, s.ownerFor(seat), seat, from, to)
	if !ok || len(route) < 2 {
		return fmt.Errorf("no route from %s to %s", from, to)
	}
	stacks := p.Stacks
	for i := range stacks {
		stacks[i] = slices.Clone(stacks[i])
	}
	var army Stack
	for _, u := range units {
		if u.Stack < 0 || u.Stack >= StacksPerPlanet || u.Count < 1 {
			return errors.New("pick units from the Planet's Stacks")
		}
		// A Stack can hold the unit in several Unit Slots: take from each.
		st, have := stacks[u.Stack], 0
		for _, sl := range st {
			if sl.Unit == u.Unit {
				have += sl.Count
			}
		}
		if have < u.Count {
			return fmt.Errorf("Stack %d doesn't have %d of %s", u.Stack+1, u.Count, u.Unit)
		}
		left := u.Count
		for k := range st {
			if st[k].Unit == u.Unit {
				take := min(left, st[k].Count)
				st[k].Count -= take
				left -= take
			}
		}
		stacks[u.Stack] = slices.DeleteFunc(st, func(sl UnitSlot) bool { return sl.Count == 0 })
		army = army.add(u.Unit, u.Count, 0)
	}
	if len(army) == 0 {
		return errors.New("pick some units")
	}
	p.Stacks = stacks
	s.LastID++
	a := &Army{ID: s.LastID, Owner: seat, Units: army, To: from, Path: route[1:], ToStack: toStack}
	a.hop(s.Lanes, s.Time)
	if s.Armies == nil {
		s.Armies = map[uint32]*Army{}
	}
	s.Armies[a.ID] = a
	return nil
}

// ReorderArmy gives an Army a new destination. It finishes its current
// Lane hop first and never turns back mid-Lane, so its route starts at To.
// An Army waiting in orbit leaves now.
func (s *State) ReorderArmy(seat int, id uint32, to string, toStack int) error {
	a := s.Armies[id]
	if a == nil || a.Owner != seat {
		return fmt.Errorf("you have no Army %d", id)
	}
	if a.Retreating {
		return errors.New("a Retreating Army can't be re-ordered")
	}
	if err := s.checkTarget(seat, to, toStack); err != nil {
		return err
	}
	route, _, ok := Route(s.Lanes, s.ownerFor(seat), seat, a.To, to)
	// Mid-Lane into an enemy Planet, the Army must stop there.
	if !ok || !a.Waiting && len(route) > 1 && !s.passable(seat, s.Planets[a.To]) {
		return fmt.Errorf("no route to %s", to)
	}
	a.Path, a.ToStack, a.Raid = route[1:], toStack, false // re-ordered as an Attack; ReorderRaid makes it a Raid again
	if a.Waiting && len(a.Path) > 0 {
		a.Waiting = false
		a.hop(s.Lanes, s.Time)
	}
	return nil
}

// OrderRaid sends units as a Raid on to: an Army after its buildings, hidden
// from everyone but its owner on the way.
func (s *State) OrderRaid(c *cs.Content, seat int, from string, units []ArmyUnits, to string, toStack int) error {
	var slots []UnitSlot
	for _, u := range units {
		slots = append(slots, UnitSlot{Unit: u.Unit, Count: u.Count})
	}
	if err := s.raidable(c, seat, slots, to); err != nil {
		return err
	}
	if err := s.OrderArmy(seat, from, units, to, toStack); err != nil {
		return err
	}
	s.Armies[s.LastID].Raid = true
	return nil
}

// ReorderRaid is ReorderArmy for a Raid: it raids its new target.
func (s *State) ReorderRaid(c *cs.Content, seat int, id uint32, to string, toStack int) error {
	if a := s.Armies[id]; a != nil && a.Owner == seat {
		if err := s.raidable(c, seat, a.Units, to); err != nil {
			return err
		}
	}
	if err := s.ReorderArmy(seat, id, to, toStack); err != nil {
		return err
	}
	s.Armies[id].Raid = true
	return nil
}

// raidable checks a Raid: on a Planet that isn't the raider's own, by units
// that all have one of the Ruleset's raidRoles, within its raidCap of
// Command Points.
func (s *State) raidable(c *cs.Content, seat int, units []UnitSlot, to string) error {
	if p := s.Planets[to]; p != nil && p.Owner == seat {
		return errors.New("you can't Raid your own Planet")
	}
	rules := c.Rulesets[RulesetID].Battle
	cp := 0
	for _, u := range units {
		def := c.Units[u.Unit]
		if !slices.ContainsFunc(def.Roles, func(r cs.UnitRolesElem) bool {
			return slices.Contains(rules.RaidRoles, cs.RulesetBattleRaidRolesElem(r))
		}) {
			return fmt.Errorf("%s can't Raid", def.Name)
		}
		cp += def.CommandPoints * u.Count
	}
	if limit := rules.RaidCap; cp > limit {
		return fmt.Errorf("a Raid holds at most %d Command Points; these are %d", limit, cp)
	}
	return nil
}

func (s *State) checkTarget(seat int, to string, toStack int) error {
	switch p := s.Planets[to]; {
	case p == nil:
		return fmt.Errorf("no Planet %s", to)
	case toStack < 0 || toStack >= StacksPerPlanet:
		return fmt.Errorf("no Stack %d", toStack+1)
	case p.Owner != seat && s.Allied(seat, p.Owner):
		return errAllyPlanet
	}
	return nil
}

// destination is the last Planet on the Army's route.
func (a *Army) destination() string {
	if len(a.Path) > 0 {
		return a.Path[len(a.Path)-1]
	}
	return a.To
}

// hop starts the Lane hop to the next Planet on the Army's path.
func (a *Army) hop(lanes map[string]map[string]int64, at int64) {
	a.From, a.To, a.Path = a.To, a.Path[0], a.Path[1:]
	a.Departed, a.Arrives = at, at+lanes[a.From][a.To]
}

// moveArmies moves every Army along its path and resolves arrivals. Armies
// go in Seat order, so when two hostile Armies reach a Planet on the same
// tick, the lower Seat attacks and the other waits in orbit.
func (s *State) moveArmies(c *cs.Content, now int64, ev *Events) {
	armies := slices.SortedFunc(maps.Values(s.Armies), func(a, b *Army) int {
		return cmp.Or(cmp.Compare(a.Owner, b.Owner), cmp.Compare(a.ID, b.ID))
	})
	for _, a := range armies {
		for !a.Waiting && a.Arrives <= now {
			if !a.Retreating {
				s.sight(c, a.Owner, a.To, a.Arrives) // passing through or arriving
			}
			switch {
			case a.Retreating && !s.owns(a.Owner)(a.destination()):
				// Its target fell on the way: pick a new one from here.
				if !s.retreat(a, a.Arrives) {
					delete(s.Armies, a.ID) // its owner has no Planets left
				}
			// Pass through the owner's and Teammates' Planets and neutral ones,
			// as they stand on arrival; an enemy Planet ends the move there,
			// even one that changed hands on the way. A Retreat passes through
			// anything.
			case len(a.Path) > 0 && (a.Retreating || s.passable(a.Owner, s.Planets[a.To]) && !s.Planets[a.To].Locked):
				a.hop(s.Lanes, a.Arrives)
			case len(a.Path) > 0 && s.passable(a.Owner, s.Planets[a.To]):
				a.Waiting = true // Locked on the way: wait out the Battle, keeping the route
			default:
				a.Waiting, a.Retreating, a.Path = true, false, nil
			}
			if s.Armies[a.ID] == nil {
				break
			}
		}
		if s.Armies[a.ID] == nil || !a.Waiting {
			continue
		}
		p := s.Planets[a.To]
		if p.Locked {
			if len(a.Path) == 0 { // it ends here; one passing through keeps its order
				s.reinforce(c, a, p) // with Dropships, it lands what they carry
			}
			continue // the rest waits until the Battle ends, then resolves against the new owner
		}
		if len(a.Path) > 0 {
			// It waited out a Battle on the way: go on if it still may.
			if s.passable(a.Owner, p) {
				a.Waiting = false
				a.hop(s.Lanes, now)
				continue
			}
			a.Path = nil // taken by an enemy: the move ends here
		}
		switch {
		case a.Raid && !s.Allied(a.Owner, p.Owner) && !p.built():
			// Nothing to raid: home, seen like any Retreat.
			ev.TurnedBack = append(ev.TurnedBack, RaidTurnedBack{Seat: a.Owner, Planet: p.ID})
			a.Waiting, a.Retreating = false, true
			if !s.retreat(a, now) {
				delete(s.Armies, a.ID)
			}
			continue
		case a.Raid && !s.Allied(a.Owner, p.Owner):
			s.startBattle(c, a, p, ev) // even with no units there: a Raid never takes the Planet
			continue
		case p.Owner == Neutral && p.empty(),
			// An enemy Planet with no units and no buildings has nothing to
			// fight with: taken without a Battle.
			!s.Allied(a.Owner, p.Owner) && p.empty() && !p.built():
			s.capture(p, a.Owner, ev)
		case p.Owner != a.Owner && s.Allied(a.Owner, p.Owner):
			// A Teammate took it first: it can't land, so it heads home, as a
			// Retreat; a Bot never re-orders an Army, so waiting would strand it.
			a.Waiting, a.Retreating = false, true
			if !s.retreat(a, now) {
				delete(s.Armies, a.ID) // its owner has no Planets left
			}
			continue
		case p.Owner != a.Owner:
			s.startBattle(c, a, p, ev)
			continue
		}
		a.Raid = false // home: what's left in orbit is an ordinary Army
		s.land(c, a, p)
	}
}

// built is whether the Planet has any buildings.
func (p *Planet) built() bool {
	return slices.ContainsFunc(p.Buildings, func(b string) bool { return b != "" })
}

// land merges an Army into its Stack, with overflow. Units that don't fit
// wait in orbit.
func (s *State) land(c *cs.Content, a *Army, p *Planet) {
	a.Units = slices.DeleteFunc(a.Units, func(u UnitSlot) bool { return p.addUnits(c, a.ToStack, u.Unit, u.Count) })
	if len(a.Units) == 0 {
		delete(s.Armies, a.ID)
	}
}

func (p *Planet) empty() bool {
	for _, st := range p.Stacks {
		if len(st) > 0 {
			return false
		}
	}
	return true
}

// capture hands a Planet over. The loser's queues there are cancelled with
// no refund, freeing their Command Points, and their buildings destroyed.
// Losing a Capital eliminates its player.
func (s *State) capture(p *Planet, to int, ev *Events) {
	from := p.Owner
	for i := range p.Buildings {
		s.loseLab(p, i)
		p.Buildings[i] = ""
	}
	p.Owner, p.Queue, p.UnitQueues, p.Rally, p.RallyPoint = to, nil, nil, 0, ""
	p.Layout.Starts = nil
	for _, q := range s.Planets { // the loser's Rally Points on it go
		if q.Owner == from && q.RallyPoint == p.ID {
			q.RallyPoint = ""
		}
	}
	viewers := []int{}
	for seat := range s.Players {
		if seat == from || s.sees(seat, p.ID) {
			viewers = append(viewers, seat)
		}
	}
	ev.Captures = append(ev.Captures, PlanetCaptured{Planet: p.ID, From: from, To: to, Viewers: viewers})
	if p.Capital {
		p.Capital = false // no one's Capital now; the captor keeps their own
		if from != Neutral {
			s.eliminate(from, ev)
		}
	}
}

// sight lets seat see planet until armyVisionSeconds after at.
func (s *State) sight(c *cs.Content, seat int, planet string, at int64) {
	until := at + int64(c.Rulesets[RulesetID].ArmyVisionSeconds)*1000
	p := &s.Players[seat]
	if p.Sighted == nil {
		p.Sighted = map[string]int64{}
	}
	p.Sighted[planet] = max(p.Sighted[planet], until)
}

// sightPlanets keeps vision of every Planet an Army is waiting at, or its
// owner is attacking, so it runs out armyVisionSeconds after they're gone,
// and drops sightings that have run out.
func (s *State) sightPlanets(c *cs.Content, now int64) {
	for _, a := range s.Armies {
		if a.Waiting {
			s.sight(c, a.Owner, a.To, now)
		}
	}
	for _, b := range s.Battles {
		s.sight(c, b.Attacker, b.Planet, now)
	}
	for i := range s.Players {
		maps.DeleteFunc(s.Players[i].Sighted, func(_ string, until int64) bool { return until <= now })
	}
}
