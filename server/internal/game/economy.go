package game

import cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"

// PaydayPaid is what one player's Resources changed by at a Payday.
type PaydayPaid struct {
	Seat int
	Net  map[string]int
}

// Advance fires everything due by Match Time now, on the first tick after
// it's due, and returns the events for players.
func (s *State) Advance(c *cs.Content, now int64) Events {
	s.Time = now
	var ev Events
	if s.Result != nil {
		return ev // the Match is over
	}
	s.moveArmies(c, now, &ev)
	s.fightBattles(c, now, &ev)
	s.sightPlanets(c, now)
	s.checkWin(c, now, &ev)
	for s.NextPayday <= now {
		ev.Paydays = append(ev.Paydays, s.payday(c)...)
		s.NextPayday += s.PaydayEvery
	}
	s.build(c, now) // after Payday, so income that clears a debt resumes queues now
	return ev
}

// Events are what Advance tells players.
type Events struct {
	Paydays  []PaydayPaid
	Captures []PlanetCaptured
	Started  []*Battle
	Rounds   []BattleRound
	Ended    []BattleEnded
	// Eliminated are the Seats eliminated this tick.
	Eliminated []int
	MatchEnded *Result
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
// occupy theirs from queue to death. Planets and buildings raise the cap.
func (s *State) commandPoints(c *cs.Content, seat int) (used, cap int) {
	for unit, n := range s.units(seat) {
		used += n * c.Units[unit].CommandPoints
	}
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		cap += p.CommandPointBonus
		for _, id := range p.Buildings {
			cap += c.Buildings[id].CommandPointBonus
		}
	}
	return used, cap
}

// units counts a player's units by type, from queue to death: in their
// Planets' Stacks, their unit queues and their Armies.
func (s *State) units(seat int) map[string]int {
	n := map[string]int{}
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		for _, st := range p.Stacks {
			for _, u := range st {
				n[u.Unit] += u.Count
			}
		}
		for _, q := range p.UnitQueues {
			for _, item := range q {
				n[item.Unit]++
			}
		}
	}
	for _, a := range s.Armies {
		if a.Owner == seat {
			for _, u := range a.Units {
				n[u.Unit] += u.Count
			}
		}
	}
	for _, b := range s.Battles { // attackers count until the Battle ends
		if b.Attacker == seat {
			for _, cb := range b.Result.Roster {
				if cb.Side == Attacker {
					n[cb.Unit]++
				}
			}
		}
	}
	return n
}
