package game

import (
	"errors"
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Reinforcements (#57): an Army with Dropships that reaches a Planet Locked
// by a Battle its owner or a Teammate fights in joins it, each Dropship
// carrying its carry of Command Points of the Army's units. What doesn't fit
// waits in orbit, as an Army without a Dropship does.

// reinforce lands what it can of a waiting Army in the Battle on p. The Dropships and their troops leave the Army; an
// Army left empty is gone.
func (s *State) reinforce(c *cs.Content, a *Army, p *Planet) {
	if a.Retreating {
		return
	}
	var b *Battle
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		if s.Battles[id].Planet == p.ID {
			b = s.Battles[id]
		}
	}
	if b == nil {
		return
	}
	side := battle.NoSide
	switch {
	case s.Allied(a.Owner, b.Attacker) && !b.Sim.Raid: // raiders come as they are
		side = battle.Attacker
	case b.Defender != Neutral && s.Allied(a.Owner, b.Defender):
		side = battle.Defender
	}
	if side == battle.NoSide {
		return
	}
	var ships, troops Stack
	for _, u := range a.Units {
		if c.Units[u.Unit].Carry != nil {
			ships = append(ships, u)
		} else {
			troops = append(troops, u)
		}
	}
	for _, sh := range ships {
		for range sh.Count {
			room := *c.Units[sh.Unit].Carry
			var cargo []battle.Slot
			for i := range troops {
				cp := max(1, c.Units[troops[i].Unit].CommandPoints)
				n := min(troops[i].Count, room/cp)
				if n == 0 {
					continue
				}
				cargo = append(cargo, battle.Slot{Unit: troops[i].Unit, Count: n, Cell: len(cargo)})
				troops[i].Count -= n
				room -= n * cp
			}
			if len(cargo) == 0 {
				break // nothing left to carry: the rest of the Dropships wait with the Army
			}
			b.Sim.Command(side, battle.Order{Kind: battle.Arrive, Building: sh.Unit, Cargo: cargo, Owner: a.Owner})
			// Troops sent in against a Truce partner, in a Teammate's Battle too, end the Truce.
			if side == battle.Attacker {
				s.attacked(a.Owner, b.Defender)
			} else {
				s.attacked(a.Owner, b.Attacker)
			}
			a.Units = Stack(a.Units).take(sh.Unit, 1)
			for _, sl := range cargo {
				a.Units = Stack(a.Units).take(sl.Unit, sl.Count)
			}
		}
	}
	if len(a.Units) == 0 {
		delete(s.Armies, a.ID)
	}
}

// take is the Stack with n fewer of unit.
func (st Stack) take(unit string, n int) Stack {
	out := slices.Clone(st)
	for i := range out {
		if out[i].Unit == unit {
			k := min(n, out[i].Count)
			out[i].Count -= k
			n -= k
		}
	}
	return slices.DeleteFunc(out, func(u UnitSlot) bool { return u.Count == 0 })
}

// dropSurvivors is what came in by Dropship and is left, by owner: the
// troops on the field or still aboard, and the Dropships themselves.
func dropSurvivors(b *Battle) map[int]Stack {
	out := map[int]Stack{}
	for _, sq := range b.Sim.Squads {
		if sq.Drop > 0 && len(sq.Members) > 0 {
			o := b.Sim.Drops[sq.Drop-1].Owner
			out[o] = out[o].add(sq.Unit, len(sq.Members), 0)
		}
	}
	for _, d := range b.Sim.Drops {
		if d.State == battle.Orbit {
			out[d.Owner] = out[d.Owner].add(d.Unit, 1, 0) // never sent: its ship is in no squad
		}
		if !d.Landed {
			for _, sl := range d.Cargo {
				out[d.Owner] = out[d.Owner].add(sl.Unit, sl.Count, 0)
			}
		}
	}
	return out
}

// sendHome sends a Battle's Dropship survivors, by owner: the attacker's own
// join its survivors when it takes the Planet (done by the caller), the
// defender's own land again when it holds it, and everyone else's, a
// Teammate's always, Retreat home.
func (s *State) sendHome(c *cs.Content, p *Planet, by map[int]Stack) {
	for _, owner := range slices.Sorted(maps.Keys(by)) {
		if s.Players[owner].Eliminated {
			continue
		}
		s.LastID++
		a := &Army{ID: s.LastID, Owner: owner, Units: by[owner], From: p.ID, To: p.ID}
		s.Armies[a.ID] = a
		if p.Owner == owner {
			a.Waiting = true
			s.land(c, a, p) // with overflow; what doesn't fit waits in orbit
			continue
		}
		a.Retreating = true
		if !s.retreat(a, s.Time) {
			delete(s.Armies, a.ID)
		}
	}
}

// BattleLand sends one of seat's side's Dropships to a Landing Zone it holds,
// in a Battle they command.
func (s *State) BattleLand(seat int, planet string, drop, point int) error {
	b, side, err := s.sideIn(seat, planet)
	if err != nil {
		return err
	}
	if !b.commanded(side) {
		return errors.New("the AI fights this Battle for you")
	}
	// drop counts the side's own, as its view lists them.
	var own []int
	for k, d := range b.Sim.Drops {
		if d.Side == side {
			own = append(own, k)
		}
	}
	if drop < 0 || drop >= len(own) {
		return errors.New("no such Dropship")
	}
	drop = own[drop]
	if err := b.Sim.CanLand(side, drop, point); err != nil {
		return err
	}
	b.Sim.Command(side, battle.Order{Kind: battle.Land, Target: drop, Point: point})
	return nil
}
