package game

import (
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

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
	Ticks    []BattleTick // only ticks with volleys
	Ended    []BattleEnded
	// Eliminated are the Seats eliminated this tick.
	Eliminated []int
	MatchEnded *Result
}

// Richness multiplies what a Planet's extractor buildings draw from it.
var richness = map[string]float64{"none": 0, "poor": 0.5, "normal": 1, "rich": 1.5}

// payday pays each player, per Resource, their Planets' income plus their
// buildings' yields (an extractor's scaled by its Planet's Richness), minus their buildings' Upkeep, as one lump sum. Debt is
// allowed: a Resource can go below zero. Then refining buildings convert
// what's left, and anything over a Stockpile cap is lost.
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
			for r, a := range b.Extracts {
				net[r] += int(float64(a) * richness[p.Richness[r]])
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
		s.refine(c, i, nets[i])
		for r, cap := range s.caps(c, i) {
			pl.Resources[r] = min(pl.Resources[r], cap)
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
			for _, sq := range b.Sim.Squads {
				if sq.Side == battle.Attacker {
					n[sq.Unit] += sq.Start
				}
			}
		}
	}
	return n
}

// refine runs each of seat's refining buildings, in Planet and slot order,
// on what they hold after income and Upkeep. Short of input, a building
// converts whole batches of its recipe at its smallest whole ratio (40
// Materials into 20 Alloys is 2 into 1), so nothing is wasted.
func (s *State) refine(c *cs.Content, seat int, net map[string]int) {
	res := s.Players[seat].Resources
	for _, id := range slices.Sorted(maps.Keys(s.Planets)) {
		p := s.Planets[id]
		if p.Owner != seat {
			continue
		}
		for _, b := range p.Buildings {
			r := c.Buildings[b].Refines
			if r == nil {
				continue
			}
			g := 0
			for _, a := range r.Input {
				g = gcd(g, a)
			}
			for _, a := range r.Output {
				g = gcd(g, a)
			}
			if g == 0 {
				continue // a recipe of all zeros does nothing
			}
			batches := g
			for in, a := range r.Input {
				batches = min(batches, max(0, res[in])/(a/g))
			}
			for in, a := range r.Input {
				res[in] -= batches * a / g
				net[in] -= batches * a / g
			}
			for out, a := range r.Output {
				res[out] += batches * a / g
				net[out] += batches * a / g
			}
		}
	}
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

// caps is seat's Stockpile cap per Resource: the Ruleset's, raised by
// their storage buildings.
func (s *State) caps(c *cs.Content, seat int) map[string]int {
	caps := maps.Clone(c.Rulesets[RulesetID].StockpileCaps)
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		for _, b := range p.Buildings {
			for r, a := range c.Buildings[b].Storage {
				if _, ok := caps[r]; ok {
					caps[r] += a
				}
			}
		}
	}
	return caps
}
