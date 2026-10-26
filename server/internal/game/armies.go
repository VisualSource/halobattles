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
	route, _, ok := Route(s.Lanes, s.owns(seat), from, to)
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
		st := stacks[u.Stack]
		i := slices.IndexFunc(st, func(sl UnitSlot) bool { return sl.Unit == u.Unit })
		if i < 0 || st[i].Count < u.Count {
			return fmt.Errorf("Stack %d doesn't have %d of %s", u.Stack+1, u.Count, u.Unit)
		}
		st[i].Count -= u.Count
		stacks[u.Stack] = slices.DeleteFunc(st, func(sl UnitSlot) bool { return sl.Count == 0 })
		army = army.add(u.Unit, u.Count)
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
	if err := s.checkTarget(to, toStack); err != nil {
		return err
	}
	route, _, ok := Route(s.Lanes, s.owns(seat), a.To, to)
	// Mid-Lane into a Planet it doesn't own, the Army must stop there.
	if !ok || !a.Waiting && len(route) > 1 && !s.owns(seat)(a.To) {
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

// hop starts the Lane hop to the next Planet on the Army's path.
func (a *Army) hop(lanes map[string]map[string]int64, at int64) {
	a.From, a.To, a.Path = a.To, a.Path[0], a.Path[1:]
	a.Departed, a.Arrives = at, at+lanes[a.From][a.To]
}

// moveArmies moves every Army along its path and resolves arrivals. Armies
// go in Seat order, so when two hostile Armies reach an empty Planet on the
// same tick, the lower Seat takes it and the other finds an enemy there.
func (s *State) moveArmies(c *cs.Content, now int64) []PlanetCaptured {
	armies := slices.SortedFunc(maps.Values(s.Armies), func(a, b *Army) int {
		return cmp.Or(cmp.Compare(a.Owner, b.Owner), cmp.Compare(a.ID, b.ID))
	})
	var captured []PlanetCaptured
	for _, a := range armies {
		for !a.Waiting && a.Arrives <= now {
			// Pass through only a Planet the owner still holds; anything else
			// ends the move there, even if it changed hands on the way.
			if len(a.Path) > 0 && s.owns(a.Owner)(a.To) {
				a.hop(s.Lanes, a.Arrives)
			} else {
				a.Waiting, a.Path = true, nil
			}
		}
		if !a.Waiting {
			continue
		}
		p := s.Planets[a.To]
		switch {
		case p.Locked:
			continue // waits until the Battle ends
		case p.Owner == Neutral && p.empty():
			captured = append(captured, s.capture(p, a.Owner))
		case p.Owner != a.Owner:
			continue // Battles come with ticket 12; until then it waits
		}
		s.land(c, a, p)
	}
	return captured
}

// land merges an Army into its Stack, with overflow. Units that don't fit
// wait in orbit.
func (s *State) land(c *cs.Content, a *Army, p *Planet) {
	slots := c.Rulesets[RulesetID].UnitSlotsPerStack
	a.Units = slices.DeleteFunc(a.Units, func(u UnitSlot) bool { return p.addUnits(a.ToStack, u.Unit, u.Count, slots) })
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
func (s *State) capture(p *Planet, to int) PlanetCaptured {
	from := p.Owner
	p.Owner, p.Queue, p.UnitQueues, p.Rally = to, nil, nil, 0
	for i := range p.Buildings {
		p.Buildings[i] = ""
	}
	viewers := []int{}
	for seat := range s.Players {
		if seat == from || s.sees(seat, p.ID) {
			viewers = append(viewers, seat)
		}
	}
	return PlanetCaptured{Planet: p.ID, From: from, To: to, Viewers: viewers}
}
