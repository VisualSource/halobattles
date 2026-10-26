package game

import (
	"errors"
	"fmt"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// QueueUnit adds count units to the unit queue of the production building
// in slot, one queue item each. Each charges its cost and reserves its
// Command Points now. It's all or nothing.
func (s *State) QueueUnit(c *cs.Content, seat int, planet string, slot int, unit string, count int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	pl := &s.Players[seat]
	u, ok := c.Units[unit]
	switch {
	case slot < 0 || slot >= len(p.Buildings) || p.Buildings[slot] == "":
		return fmt.Errorf("no building in Building Slot %d", slot+1)
	case !ok || !slices.Contains(c.Buildings[p.Buildings[slot]].Trains, cs.ID(unit)):
		return fmt.Errorf("that building can't train %s", unit)
	case count < 1:
		return errors.New("queue at least one unit")
	case pl.inDebt():
		return errInDebt
	}
	for r, a := range u.Cost {
		if pl.Resources[r] < a*count {
			return fmt.Errorf("not enough %s", c.Resources[r].Name)
		}
	}
	used, cp := s.commandPoints(c, seat)
	if used+u.CommandPoints*count > cp {
		return fmt.Errorf("not enough Command Points (%d of %d used)", used, cp)
	}
	if u.MaxCount != nil && s.units(seat)[unit]+count > *u.MaxCount {
		return fmt.Errorf("you can have at most %d %s", *u.MaxCount, u.Name)
	}
	for r, a := range u.Cost {
		pl.Resources[r] -= a * count
	}
	for range count {
		s.LastID++
		p.setUnitQueue(slot, append(p.UnitQueues[slot], QueueItem{
			ID: s.LastID, Slot: slot, Unit: unit, Remaining: int64(u.BuildTime) * 1000,
		}))
	}
	return nil
}

// MoveUnits moves count of a unit from one of the Planet's Stacks to
// another, at once.
func (s *State) MoveUnits(c *cs.Content, seat int, planet string, from, to int, unit string, count int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	if from < 0 || from >= StacksPerPlanet || to < 0 || to >= StacksPerPlanet || from == to {
		return errors.New("pick two different Stacks")
	}
	i := slices.IndexFunc(p.Stacks[from], func(u UnitSlot) bool { return u.Unit == unit })
	if i < 0 || count < 1 || p.Stacks[from][i].Count < count {
		return fmt.Errorf("Stack %d doesn't have %d of %s", from+1, count, unit)
	}
	if !p.Stacks[to].fits(unit, c.Rulesets[RulesetID].UnitSlotsPerStack) {
		return fmt.Errorf("Stack %d has no free Unit Slot", to+1)
	}
	p.Stacks[to] = p.Stacks[to].add(unit, count)
	p.Stacks[from][i].Count -= count
	if p.Stacks[from][i].Count == 0 {
		p.Stacks[from] = slices.Delete(p.Stacks[from], i, i+1)
	}
	return nil
}

// SetRallyStack sets the Stack trained units join.
func (s *State) SetRallyStack(seat int, planet string, stack int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	if stack < 0 || stack >= StacksPerPlanet {
		return fmt.Errorf("no Stack %d", stack+1)
	}
	p.Rally = stack
	return nil
}

// addUnits puts units in the Rally Stack, or failing that the first other
// Stack with room. It reports false if none has room.
func (p *Planet) addUnits(unit string, count, slots int) bool {
	order := []int{p.Rally}
	for i := range StacksPerPlanet {
		if i != p.Rally {
			order = append(order, i)
		}
	}
	for _, i := range order {
		if p.Stacks[i].fits(unit, slots) {
			p.Stacks[i] = p.Stacks[i].add(unit, count)
			return true
		}
	}
	return false
}

// fits reports whether the Stack can take unit: into its existing Unit
// Slot, or a free one.
func (st Stack) fits(unit string, slots int) bool {
	return len(st) < slots || slices.ContainsFunc(st, func(u UnitSlot) bool { return u.Unit == unit })
}

// add merges into the unit's Unit Slot, or takes a new one. Check fits first.
func (st Stack) add(unit string, count int) Stack {
	if i := slices.IndexFunc(st, func(u UnitSlot) bool { return u.Unit == unit }); i >= 0 {
		st[i].Count += count
		return st
	}
	return append(st, UnitSlot{Unit: unit, Count: count})
}

// setUnitQueue stores a building's unit queue, dropping it when empty.
func (p *Planet) setUnitQueue(slot int, q []QueueItem) {
	if len(q) == 0 {
		delete(p.UnitQueues, slot)
		return
	}
	if p.UnitQueues == nil {
		p.UnitQueues = map[int][]QueueItem{}
	}
	p.UnitQueues[slot] = q
}
