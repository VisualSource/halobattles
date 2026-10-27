package game

import (
	"errors"
	"fmt"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// QueueItem is a building under construction or a unit in training. Only
// the first item in a queue runs; it has EndsAt while running. Otherwise it
// holds the ms it still needs in Remaining.
type QueueItem struct {
	ID        uint32
	Slot      int    // the Building Slot it fills, or trains at
	Building  string // a construction item
	Unit      string // a unit item
	Started   bool
	Remaining int64
	EndsAt    int64 // Match Time; 0 unless running
}

var (
	errInDebt = errors.New("you can't queue anything while in debt")
	errLocked = errors.New("that Planet is Locked by a Battle")
)

// ownedPlanet finds a Planet seat can give orders on.
func (s *State) ownedPlanet(seat int, id string) (*Planet, error) {
	p := s.Planets[id]
	switch {
	case p == nil || p.Owner != seat:
		return nil, fmt.Errorf("you don't own %s", id)
	case p.Locked:
		return nil, errLocked
	}
	return p, nil
}

// QueueBuilding charges the building's full cost and adds it to the
// Planet's construction queue, reserving its slot.
func (s *State) QueueBuilding(c *cs.Content, seat int, planet string, slot int, building string) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	pl := &s.Players[seat]
	b, ok := c.Buildings[building]
	switch {
	case slot < 0 || slot >= len(p.Buildings):
		return fmt.Errorf("%s has no Building Slot %d", planet, slot+1)
	case p.Buildings[slot] != "" || slices.ContainsFunc(p.Queue, func(q QueueItem) bool { return q.Slot == slot }):
		return fmt.Errorf("Building Slot %d is taken", slot+1)
	case !ok || string(b.Faction) != pl.Faction:
		return fmt.Errorf("you can't build %s", building)
	case pl.inDebt():
		return errInDebt
	}
	for r, a := range b.Cost {
		if pl.Resources[r] < a {
			return fmt.Errorf("not enough %s", c.Resources[r].Name)
		}
	}
	for r, a := range b.Cost {
		pl.Resources[r] -= a
	}
	s.LastID++
	p.Queue = append(p.Queue, QueueItem{ID: s.LastID, Slot: slot, Building: building, Remaining: int64(b.BuildTime) * 1000})
	return nil
}

func (q QueueItem) cost(c *cs.Content) map[string]int {
	if q.Unit != "" {
		return c.Units[q.Unit].Cost
	}
	return c.Buildings[q.Building].Cost
}

// CancelQueueItem refunds an item in full if it hasn't started, or the
// Ruleset's cancel percentage if it has. A cancelled unit frees its Command
// Points, since only queued and living units hold them.
func (s *State) CancelQueueItem(c *cs.Content, seat int, id uint32) error {
	for _, p := range s.Planets {
		q, i := p.findItem(id)
		if i < 0 {
			continue
		}
		if _, err := s.ownedPlanet(seat, p.ID); err != nil {
			return err
		}
		item := q[i]
		percent := 100
		if item.Started {
			percent = c.Rulesets[RulesetID].CancelRefundPercent
		}
		s.Players[seat].refund(item.cost(c), percent)
		q = slices.Delete(q, i, i+1)
		if item.Unit != "" {
			p.setUnitQueue(item.Slot, q)
		} else {
			p.Queue = q
		}
		return nil
	}
	return fmt.Errorf("no queue item %d", id)
}

// findItem finds a queue item by id in any of the Planet's queues.
func (p *Planet) findItem(id uint32) ([]QueueItem, int) {
	is := func(q QueueItem) bool { return q.ID == id }
	if i := slices.IndexFunc(p.Queue, is); i >= 0 {
		return p.Queue, i
	}
	for _, q := range p.UnitQueues {
		if i := slices.IndexFunc(q, is); i >= 0 {
			return q, i
		}
	}
	return nil, -1
}

// SellBuilding empties a finished building's slot for the Ruleset's sell
// percentage. Its Upkeep stops at once, since Payday counts only buildings
// in slots.
func (s *State) SellBuilding(c *cs.Content, seat int, planet string, slot int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	switch {
	case slot < 0 || slot >= len(p.Buildings) || p.Buildings[slot] == "":
		return fmt.Errorf("no building in Building Slot %d", slot+1)
	case len(p.UnitQueues[slot]) > 0:
		return errors.New("cancel that building's unit queue before selling it")
	}
	s.Players[seat].refund(c.Buildings[p.Buildings[slot]].Cost, c.Rulesets[RulesetID].SellRefundPercent)
	p.Buildings[slot] = ""
	return nil
}

func (p *Player) refund(cost map[string]int, percent int) {
	for r, a := range cost {
		p.Resources[r] += a * percent / 100
	}
}

func (p *Player) inDebt() bool {
	for _, a := range p.Resources {
		if a < 0 {
			return true
		}
	}
	return false
}

// build runs every queue. Queues pause while their owner is in debt or the
// Planet is Locked.
func (s *State) build(c *cs.Content, now int64) {
	for _, p := range s.Planets {
		run := p.Owner != Neutral && !s.Players[p.Owner].inDebt() && !p.Locked
		p.Queue = runQueue(p.Queue, run, now, func(q QueueItem) bool {
			p.Buildings[q.Slot] = q.Building
			return true
		})
		for slot, q := range p.UnitQueues {
			p.setUnitQueue(slot, runQueue(q, run, now, func(q QueueItem) bool {
				return p.addUnits(c, p.Rally, q.Unit, 1)
			}))
		}
	}
}

// runQueue finishes the first item if it's due, then starts, pauses or
// resumes the new first item. An item that can't finish (a unit with no
// room) stays first, past its end, and blocks the queue.
func runQueue(q []QueueItem, run bool, now int64, finish func(QueueItem) bool) []QueueItem {
	if len(q) > 0 && q[0].EndsAt != 0 && q[0].EndsAt <= now && finish(q[0]) {
		q = q[1:]
	}
	if len(q) == 0 {
		return nil
	}
	head := &q[0]
	switch {
	case run && head.EndsAt == 0:
		head.Started, head.EndsAt = true, now+head.Remaining
	case !run && head.EndsAt != 0:
		head.Remaining, head.EndsAt = max(0, head.EndsAt-now), 0
	}
	return q
}
