package game

import (
	"errors"
	"fmt"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// QueueItem is a building under construction. Only the first item in a
// Planet's queue runs; it has EndsAt while running. Otherwise it holds the
// ms it still needs in Remaining.
type QueueItem struct {
	ID        uint32
	Slot      int // the Building Slot it will fill
	Building  string
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

// CancelQueueItem refunds an item in full if it hasn't started, or the
// Ruleset's cancel percentage if it has.
func (s *State) CancelQueueItem(c *cs.Content, seat int, id uint32) error {
	for _, p := range s.Planets {
		i := slices.IndexFunc(p.Queue, func(q QueueItem) bool { return q.ID == id })
		if i < 0 {
			continue
		}
		if _, err := s.ownedPlanet(seat, p.ID); err != nil {
			return err
		}
		percent := 100
		if p.Queue[i].Started {
			percent = c.Rulesets[RulesetID].CancelRefundPercent
		}
		s.Players[seat].refund(c.Buildings[p.Queue[i].Building].Cost, percent)
		p.Queue = slices.Delete(p.Queue, i, i+1)
		return nil
	}
	return fmt.Errorf("no queue item %d", id)
}

// SellBuilding empties a finished building's slot for the Ruleset's sell
// percentage. Its Upkeep stops at once, since Payday counts only buildings
// in slots.
func (s *State) SellBuilding(c *cs.Content, seat int, planet string, slot int) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	if slot < 0 || slot >= len(p.Buildings) || p.Buildings[slot] == "" {
		return fmt.Errorf("no building in Building Slot %d", slot+1)
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

// build finishes every running item that's due, then starts, pauses or
// resumes the first item of each queue. Queues pause while their owner is
// in debt or the Planet is Locked.
func (s *State) build(now int64) {
	for _, p := range s.Planets {
		if len(p.Queue) == 0 {
			continue
		}
		if q := p.Queue[0]; q.EndsAt != 0 && q.EndsAt <= now {
			p.Buildings[q.Slot] = q.Building
			p.Queue = p.Queue[1:]
			if len(p.Queue) == 0 {
				continue
			}
		}
		q := &p.Queue[0]
		run := p.Owner != Neutral && !s.Players[p.Owner].inDebt() && !p.Locked
		switch {
		case run && q.EndsAt == 0:
			q.Started, q.EndsAt = true, now+q.Remaining
		case !run && q.EndsAt != 0:
			q.Remaining, q.EndsAt = q.EndsAt-now, 0
		}
	}
}
