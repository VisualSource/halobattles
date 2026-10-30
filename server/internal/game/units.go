package game

import (
	"errors"
	"fmt"
	"math"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// QueueUnit adds count units to the unit queue of the production building
// in slot, one queue item each. Each charges its cost, with Sprawl, and
// reserves its Command Points now. It's all or nothing.
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
	if err := s.mustUnlock(c, seat, unit, true); err != nil {
		return err
	}
	cost := s.sprawled(c, seat, u.Cost)
	for r, a := range cost {
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
	for r, a := range cost {
		pl.Resources[r] -= a * count
	}
	ms := buildMs(u.BuildTime, s.effects(c, seat).unit("buildTime", unit, string(u.Combat.UnitClass)))
	for range count {
		s.LastID++
		p.setUnitQueue(slot, append(p.UnitQueues[slot], QueueItem{
			ID: s.LastID, Slot: slot, Unit: unit, Remaining: ms, Paid: cost,
		}))
	}
	return nil
}

// MoveUnits moves count units out of the Unit Slot in fromCell of one of
// the Planet's Stacks into toCell of a Stack, the same one or another:
//   - an empty cell takes them as a new slot;
//   - a slot of the same unit takes as many as its slotLimit allows, and
//     the rest stay behind;
//   - another unit's slot swaps places with a whole slot moved onto it.
//
// A negative toCell tops up the other Stack's slots of that unit, then fills
// its free cells, as arriving units do. unit must match the slot in fromCell,
// so an order sent against a stale view can't move the wrong units.
func (s *State) MoveUnits(c *cs.Content, seat int, planet string, from, fromCell, to, toCell int, unit string, count int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	slots := c.Rulesets[RulesetID].UnitSlotsPerStack
	if from < 0 || from >= StacksPerPlanet || to < 0 || to >= StacksPerPlanet || toCell >= slots || from == to && toCell < 0 {
		return errors.New("no such Stack or Unit Slot")
	}
	i := p.Stacks[from].at(fromCell)
	if i < 0 || p.Stacks[from][i].Unit != unit || count < 1 || p.Stacks[from][i].Count < count {
		return fmt.Errorf("Stack %d doesn't have %d of %s there", from+1, count, unit)
	}
	limit := slotLimit(c, unit)
	moving := count
	switch j := p.Stacks[to].at(toCell); {
	case toCell < 0:
		if p.Stacks[to].room(unit, limit, slots) < count {
			return fmt.Errorf("Stack %d has no room for %d %s", to+1, count, unit)
		}
		p.Stacks[to] = p.Stacks[to].add(unit, count, limit)
	case j < 0: // an empty cell
		if limit > 0 && count > limit {
			return fmt.Errorf("a Unit Slot holds at most %d %s", limit, unit)
		}
		if from == to && count == p.Stacks[from][i].Count {
			p.Stacks[from][i].Cell = toCell
			return nil
		}
		p.Stacks[to] = append(p.Stacks[to], UnitSlot{Unit: unit, Count: count, Cell: toCell})
	case from == to && j == i:
		return nil
	case p.Stacks[to][j].Unit == unit: // merge, up to the limit
		if limit > 0 {
			moving = min(count, limit-p.Stacks[to][j].Count)
		}
		if moving < 1 {
			return errors.New("that Unit Slot is full")
		}
		p.Stacks[to][j].Count += moving
	case count == p.Stacks[from][i].Count: // whole slots swap places
		a, b := &p.Stacks[from][i], &p.Stacks[to][j]
		a.Unit, b.Unit = b.Unit, a.Unit
		a.Count, b.Count = b.Count, a.Count
		return nil
	default:
		return errors.New("that cell holds another unit")
	}
	src := p.Stacks[from] // after any append to the same Stack; i still points at the slot
	src[i].Count -= moving
	if src[i].Count == 0 {
		p.Stacks[from] = slices.Delete(src, i, i+1)
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

// slotLimit is the most of a unit one Unit Slot holds; 0 is no limit.
func slotLimit(c *cs.Content, unit string) int {
	if l := c.Units[unit].SlotLimit; l != nil {
		return *l
	}
	return 0
}

// addUnits puts units in the first Stack, then spills what doesn't fit
// into the Planet's other Stacks. It's all or nothing: it reports false,
// changing nothing, if they don't all fit.
func (p *Planet) addUnits(c *cs.Content, first int, unit string, count int) bool {
	slots, limit := c.Rulesets[RulesetID].UnitSlotsPerStack, slotLimit(c, unit)
	order := []int{first}
	for i := range StacksPerPlanet {
		if i != first {
			order = append(order, i)
		}
	}
	need := count
	for _, i := range order {
		need -= min(need, p.Stacks[i].room(unit, limit, slots))
	}
	if need > 0 {
		return false
	}
	for _, i := range order {
		if take := min(count, p.Stacks[i].room(unit, limit, slots)); take > 0 {
			p.Stacks[i] = p.Stacks[i].add(unit, take, limit)
			count -= take
		}
	}
	return true
}

// room is how many more of unit the Stack can take: what its slots of that
// unit have left under limit, plus its free cells. With no limit, any slot
// of the unit or a free cell takes any number.
func (st Stack) room(unit string, limit, slots int) int {
	same := slices.ContainsFunc(st, func(u UnitSlot) bool { return u.Unit == unit })
	if limit == 0 {
		if same || len(st) < slots {
			return math.MaxInt
		}
		return 0
	}
	n := (slots - len(st)) * limit
	for _, u := range st {
		if u.Unit == unit {
			n += max(0, limit-u.Count)
		}
	}
	return n
}

// add tops up the Stack's slots of unit to limit, in cell order, then puts
// the rest in new slots in the first free cells. Check room first. limit 0
// is no limit.
func (st Stack) add(unit string, count, limit int) Stack {
	byCell := slices.Clone(st)
	slices.SortFunc(byCell, func(a, b UnitSlot) int { return a.Cell - b.Cell })
	for _, u := range byCell {
		if u.Unit != unit || count == 0 {
			continue
		}
		i := st.at(u.Cell)
		take := count
		if limit > 0 {
			take = min(count, max(0, limit-st[i].Count))
		}
		st[i].Count += take
		count -= take
	}
	for count > 0 {
		take := count
		if limit > 0 {
			take = min(count, limit)
		}
		st = append(st, UnitSlot{Unit: unit, Count: take, Cell: st.free()})
		count -= take
	}
	return st
}

// addToCell puts one unit back in cell: a Battle's survivor returning to the
// slot it fought from.
func (st Stack) addToCell(unit string, cell int) Stack {
	if i := st.at(cell); i >= 0 {
		st[i].Count++
		return st
	}
	return append(st, UnitSlot{Unit: unit, Count: 1, Cell: cell})
}

// at is the index of the Unit Slot in cell, or -1.
func (st Stack) at(cell int) int {
	if cell < 0 {
		return -1
	}
	return slices.IndexFunc(st, func(u UnitSlot) bool { return u.Cell == cell })
}

// free is the first cell with no Unit Slot.
func (st Stack) free() int {
	cell := 0
	for st.at(cell) >= 0 {
		cell++
	}
	return cell
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
