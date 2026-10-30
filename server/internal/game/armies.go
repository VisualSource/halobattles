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
}

// ArmyUnits is part of an order: count of a unit from one Stack.
type ArmyUnits struct {
	Stack int
	Unit  string
	Count int
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

// ownerOf is a Planet's owner, for Route.
func (s *State) ownerOf(id string) int {
	if p := s.Planets[id]; p != nil {
		return p.Owner
	}
	return Neutral
}

// passable reports whether an Army of seat may go on through p rather than
// end its move there: its own Planets and neutral ones. A Locked one makes
// it wait in orbit first.
func passable(seat int, p *Planet) bool {
	return p.Owner == seat || p.Owner == Neutral
}

// OrderArmy forms an Army from units on one of the player's Planets, taken
// from any of its Stacks, and sends it on the fastest route to another.
func (s *State) OrderArmy(seat int, from string, units []ArmyUnits, to string, toStack int) error {
	p, err := s.ownedPlanet(seat, from)
	if err != nil {
		return err
	}
	if err := s.checkTarget(to, toStack); err != nil {
		return err
	}
	route, _, ok := Route(s.Lanes, s.ownerOf, seat, from, to)
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
	if err := s.checkTarget(to, toStack); err != nil {
		return err
	}
	route, _, ok := Route(s.Lanes, s.ownerOf, seat, a.To, to)
	// Mid-Lane into an enemy Planet, the Army must stop there.
	if !ok || !a.Waiting && len(route) > 1 && !passable(seat, s.Planets[a.To]) {
		return fmt.Errorf("no route to %s", to)
	}
	a.Path, a.ToStack = route[1:], toStack
	if a.Waiting && len(a.Path) > 0 {
		a.Waiting = false
		a.hop(s.Lanes, s.Time)
	}
	return nil
}

func (s *State) checkTarget(to string, toStack int) error {
	switch {
	case s.Planets[to] == nil:
		return fmt.Errorf("no Planet %s", to)
	case toStack < 0 || toStack >= StacksPerPlanet:
		return fmt.Errorf("no Stack %d", toStack+1)
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
			// Pass through the owner's Planets and neutral ones, as they stand
			// on arrival; an enemy Planet ends the move there, even one that
			// changed hands on the way. A Retreat passes through anything.
			case len(a.Path) > 0 && (a.Retreating || passable(a.Owner, s.Planets[a.To]) && !s.Planets[a.To].Locked):
				a.hop(s.Lanes, a.Arrives)
			case len(a.Path) > 0 && passable(a.Owner, s.Planets[a.To]):
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
			continue // waits until the Battle ends, then resolves against the new owner
		}
		if len(a.Path) > 0 {
			// It waited out a Battle on the way: go on if it still may.
			if passable(a.Owner, p) {
				a.Waiting = false
				a.hop(s.Lanes, now)
				continue
			}
			a.Path = nil // taken by an enemy: the move ends here
		}
		switch {
		case p.Owner == Neutral && p.empty():
			s.capture(p, a.Owner, ev)
		case p.Owner != a.Owner:
			s.startBattle(c, a, p, ev)
			continue
		}
		s.land(c, a, p)
	}
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
	p.Owner, p.Queue, p.UnitQueues, p.Rally = to, nil, nil, 0
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
