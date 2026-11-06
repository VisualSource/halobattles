package game

import (
	"errors"
	"fmt"
	"maps"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// LabRef names a Lab by its Planet and Building Slot.
type LabRef struct {
	Planet string
	Slot   int
}

// Courier makes an Army a Courier: no units, one Tech on its way between
// Labs. It never fights or lands in a Stack, so moveCourier moves it, not
// the Army path of moveArmies. It reserves a Tech Slot in Home and in Dest,
// so it can always land at one; loseLab keeps both pointing at standing Labs.
type Courier struct {
	Tech string
	Home LabRef // the Lab it left; Planet "" once that's lost
	Dest LabRef // the Lab it's going to; Home again when called off or turned back
	// The Planet whose Lab it was coming to when that was lost: reaching it,
	// or waiting there, is no danger even if it's now an enemy's.
	Turned string
}

// holding finds the Lab holding tech, if seat holds it.
func (s *State) holding(c *cs.Content, seat int, tech string) (LabRef, bool) {
	for _, id := range slices.Sorted(maps.Keys(s.Planets)) {
		p := s.Planets[id]
		if p.Owner != seat {
			continue
		}
		for _, slot := range slices.Sorted(maps.Keys(p.Techs)) {
			if _, _, ok := s.labAt(c, seat, id, slot); ok && slices.Contains(p.Techs[slot], tech) {
				return LabRef{id, slot}, true
			}
		}
	}
	return LabRef{}, false
}

// freeSlots is how many of a Lab's Tech Slots hold nothing and aren't
// reserved by a Project or a Courier, and whether seat has that Lab.
func (s *State) freeSlots(c *cs.Content, seat int, lab LabRef) (int, bool) {
	p, free, ok := s.labAt(c, seat, lab.Planet, lab.Slot)
	if !ok {
		return 0, false
	}
	free -= len(p.Techs[lab.Slot])
	for _, q := range s.Players[seat].Projects {
		if q.Planet == lab.Planet && q.Slot == lab.Slot {
			free--
		}
	}
	for _, a := range s.Armies {
		if a.Owner == seat && a.Courier != nil && (a.Courier.Home == lab || a.Courier.Dest == lab) {
			free--
		}
	}
	return free, true
}

// inTransit reports whether one of seat's Couriers carries tech.
func (s *State) inTransit(seat int, tech string) bool {
	for _, a := range s.Armies {
		if a.Owner == seat && a.Courier != nil && a.Courier.Tech == tech {
			return true
		}
	}
	return false
}

// SendTech sends a held Tech to a free Tech Slot in another of seat's Labs
// as a Courier, paying the Ruleset's techTransferCost now.
func (s *State) SendTech(c *cs.Content, seat int, tech, toPlanet string, toSlot int) error {
	pl, err := s.player(seat)
	if err != nil {
		return err
	}
	home, held := s.holding(c, seat, tech)
	dest := LabRef{toPlanet, toSlot}
	free, isLab := s.freeSlots(c, seat, dest)
	switch {
	case !held:
		return errors.New("you don't hold that Tech")
	case s.Planets[home.Planet].Locked:
		return errors.New("a Tech can't leave a Locked Planet")
	case dest == home:
		return errors.New("that Tech is already in that Lab")
	case !isLab:
		return fmt.Errorf("you have no Lab in Building Slot %d of %s", toSlot+1, toPlanet)
	case free < 1:
		return errors.New("that Lab has no free Tech Slot")
	}
	route, err := s.courierRoute(seat, home.Planet, toPlanet)
	if err != nil {
		return err
	}
	cost := c.Rulesets[RulesetID].TechTransferCost[string(c.Techs[tech].Rarity)]
	for r, n := range cost {
		if pl.Resources[r] < n {
			return fmt.Errorf("not enough %s", c.Resources[r].Name)
		}
	}
	for r, n := range cost {
		pl.Resources[r] -= n
	}
	p := s.Planets[home.Planet]
	p.Techs[home.Slot] = slices.DeleteFunc(p.Techs[home.Slot], func(t string) bool { return t == tech })
	s.LastID++
	// A move between Labs on one Planet has no Lane to cross: it lands next tick.
	a := &Army{ID: s.LastID, Owner: seat, From: home.Planet, To: home.Planet, Departed: s.Time, Arrives: s.Time,
		Courier: &Courier{Tech: tech, Home: home, Dest: dest}}
	if a.Path = route[1:]; len(a.Path) > 0 {
		s.hop(a, s.Time)
	}
	if s.Armies == nil {
		s.Armies = map[uint32]*Army{}
	}
	s.Armies[a.ID] = a
	return nil
}

// courierRoute is the route a new order gives a Courier, refused if it would
// enter an enemy's Planet. from itself isn't entered: a turned-back Courier
// can be leaving one.
func (s *State) courierRoute(seat int, from, to string) ([]string, error) {
	route, _, ok := Route(s.Lanes, s.OwnLaneTime, s.ownerFor(seat), seat, from, to)
	if !ok || slices.ContainsFunc(route[1:], func(id string) bool { return !s.passable(seat, s.Planets[id]) }) {
		return nil, fmt.Errorf("no safe route from %s to %s", from, to)
	}
	return route, nil
}

// ReorderCourier sends a Courier to another of seat's Labs with a free Tech
// Slot, or back to the one it left, which calls the move off. The cost isn't
// refunded. Like ReorderArmy, it finishes its current Lane hop first.
func (s *State) ReorderCourier(c *cs.Content, seat int, id uint32, toPlanet string, toSlot int) error {
	a := s.Armies[id]
	if a == nil || a.Owner != seat || a.Courier == nil {
		return fmt.Errorf("you have no Courier %d", id)
	}
	to := LabRef{toPlanet, toSlot}
	free, isLab := s.freeSlots(c, seat, to)
	switch {
	case !isLab:
		return fmt.Errorf("you have no Lab in Building Slot %d of %s", toSlot+1, toPlanet)
	case free < 1 && to != a.Courier.Home && to != a.Courier.Dest:
		return errors.New("that Lab has no free Tech Slot")
	}
	route, err := s.courierRoute(seat, a.To, toPlanet)
	if err != nil {
		return err
	}
	a.Courier.Dest = to
	s.redirect(a, route, s.Time)
	return nil
}

// courierLabLost updates Couriers for a Lab being lost: one going
// there turns back for Home, and with Home lost too its Tech is lost. Its
// new route waits for moveCourier: during a capture, owners are out of date.
func (s *State) courierLabLost(lab LabRef) {
	for _, id := range slices.Sorted(maps.Keys(s.Armies)) {
		a := s.Armies[id]
		if a.Courier == nil {
			continue
		}
		co := a.Courier
		if co.Home == lab {
			co.Home = LabRef{}
		}
		if co.Dest == lab {
			if len(a.Path) == 0 {
				co.Turned = lab.Planet // now: a re-order before moveCourier mustn't lose it
			}
			if co.Dest = co.Home; co.Dest.Planet == "" {
				s.loseCourier(a)
			}
		}
	}
}

// loseCourier destroys a Courier; its Tech comes back as a guaranteed card.
func (s *State) loseCourier(a *Army) {
	delete(s.Armies, a.ID)
	pl := &s.Players[a.Owner]
	pl.Saved = append(pl.Saved, Saved{Tech: a.Courier.Tech, Lost: true})
}

// moveCourier moves a Courier along its path. Like an Army it goes through
// its owner's, Teammates' and neutral Planets and waits in orbit at a Locked
// one of those; at an enemy's it's destroyed, unless it's the Turned one, which
// it just leaves. At Dest it lands.
func (s *State) moveCourier(c *cs.Content, a *Army, now int64) {
	co := a.Courier
	if a.From == co.Turned {
		co.Turned = "" // left it
	}
	if dest := co.Dest.Planet; dest != a.destination() {
		route, _, ok := Route(s.Lanes, s.OwnLaneTime, s.ownerFor(a.Owner), a.Owner, a.To, dest)
		if !ok {
			s.loseCourier(a)
			return
		}
		a.Path = route[1:] // not redirect: a turn-back doesn't leave a Locked orbit
	}
	if a.Waiting && !s.passable(a.Owner, s.Planets[a.To]) && a.To != co.Turned { // taken while it waited out the Battle
		s.loseCourier(a)
		return
	}
	// Locked and not an enemy's: it waits. An enemy's holds nothing of its own to wait for.
	stuck := func(p *Planet) bool { return p.Locked && s.passable(a.Owner, p) }
	for !a.Waiting && a.Arrives <= now {
		s.sight(c, a.Owner, a.To, a.Arrives)
		switch p := s.Planets[a.To]; {
		case !s.passable(a.Owner, p) && a.To != co.Turned:
			s.loseCourier(a)
			return
		case len(a.Path) > 0 && !stuck(p):
			s.hop(a, a.Arrives)
		default:
			a.Waiting = true
		}
	}
	if !a.Waiting {
		return
	}
	switch {
	case stuck(s.Planets[a.To]):
	case len(a.Path) > 0:
		a.Waiting = false
		s.hop(a, now)
	default:
		s.Planets[co.Dest.Planet].hold(co.Dest.Slot, co.Tech)
		delete(s.Armies, a.ID)
	}
}
