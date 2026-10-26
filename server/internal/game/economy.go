package game

import cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"

// PaydayPaid is what one player's Resources changed by at a Payday.
type PaydayPaid struct {
	Seat int
	Net  map[string]int
}

// Advance fires everything due by Match Time now, on the first tick after
// it's due, and returns the events for players.
func (s *State) Advance(c *cs.Content, now int64) []PaydayPaid {
	s.Time = now
	var paid []PaydayPaid
	for s.NextPayday <= now {
		paid = append(paid, s.payday(c)...)
		s.NextPayday += s.PaydayEvery
	}
	return paid
}

// payday pays each player, per Resource, their Planets' income plus their
// buildings' yields, minus their buildings' Upkeep, as one lump sum. Debt is
// allowed: a Resource can go below zero.
func (s *State) payday(c *cs.Content) []PaydayPaid {
	nets := make([]map[string]int, len(s.Players))
	for i := range nets {
		nets[i] = map[string]int{}
	}
	for _, p := range s.Planets {
		if p.Owner == Neutral {
			continue
		}
		net := nets[p.Owner]
		for r, a := range p.Income {
			net[r] += a
		}
		for _, id := range p.Buildings {
			b := c.Buildings[id] // "" is an empty slot, with no yield or Upkeep
			for r, a := range b.Yield {
				net[r] += a
			}
			for r, a := range b.Upkeep {
				net[r] -= a
			}
		}
	}
	paid := make([]PaydayPaid, len(s.Players))
	for i := range s.Players {
		pl := &s.Players[i]
		if pl.Resources == nil {
			pl.Resources = map[string]int{}
		}
		for r, a := range nets[i] {
			pl.Resources[r] += a
		}
		paid[i] = PaydayPaid{Seat: i, Net: nets[i]}
	}
	return paid
}

// commandPoints is a player's Command Points in use and their cap. Units
// occupy theirs from queue to death; for now that's every unit in their
// Planets' Stacks. Planets and buildings raise the cap.
func (s *State) commandPoints(c *cs.Content, seat int) (used, cap int) {
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		cap += p.CommandPointBonus
		for _, id := range p.Buildings {
			cap += c.Buildings[id].CommandPointBonus
		}
		for _, st := range p.Stacks {
			for _, u := range st {
				used += u.Count * c.Units[u.Unit].CommandPoints
			}
		}
	}
	return used, cap
}
