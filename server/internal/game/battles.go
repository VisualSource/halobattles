package game

import (
	"cmp"
	"maps"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Battle is a Battle running on a Locked Planet. It's resolved in full when
// it starts, then played out one Round per Round duration.
type Battle struct {
	ID       uint32
	Planet   string
	Attacker int // a Seat
	Defender int // a Seat, or Neutral
	Started  int64
	RoundMs  int64
	Sent     int // Rounds played out so far
	ToStack  int // where the attackers go if they win
	Result   BattleResult
	// Origins says where each defending combatant came from, by roster
	// order: a Stack, or a Building Slot when Stack is -1.
	Origins []Origin
}

type Origin struct{ Stack, Slot int }

// BattleRound is one Round being played out.
type BattleRound struct {
	Battle *Battle
	Round  int // index into Result.Rounds
}

// BattleEnded tells Viewers who won a Battle.
type BattleEnded struct {
	Battle  uint32
	Planet  string
	Winner  int // a Seat, or Neutral
	Viewers []int
}

// startBattle fights an Army against everything defending a Planet: every
// unit in its Stacks and its armed buildings. The Planet Locks until the
// Battle ends.
func (s *State) startBattle(c *cs.Content, a *Army, p *Planet, ev *Events) {
	s.LastID++
	b := &Battle{
		ID: s.LastID, Planet: p.ID, Attacker: a.Owner, Defender: p.Owner, Started: s.Time,
		RoundMs: int64(c.Rulesets[RulesetID].RoundSeconds) * 1000, ToStack: a.ToStack,
	}
	var units []UnitSlot
	for i, st := range p.Stacks {
		for _, u := range st {
			units = append(units, u)
			for range u.Count {
				b.Origins = append(b.Origins, Origin{Stack: i})
			}
		}
	}
	for slot, id := range p.Buildings {
		if c.Buildings[id].Combat != nil {
			b.Origins = append(b.Origins, Origin{Stack: -1, Slot: slot})
		}
	}
	// Seeded from the Match seed plus the Battle id, so it can be replayed.
	b.Result = ResolveBattle(c, Force{Units: a.Units}, Force{Units: units, Buildings: p.Buildings}, s.Seed+uint64(b.ID))
	p.Locked = true
	delete(s.Armies, a.ID)
	if s.Battles == nil {
		s.Battles = map[uint32]*Battle{}
	}
	s.Battles[b.ID] = b
	ev.Started = append(ev.Started, b)
}

// fightBattles plays out each Round when it's due, and ends each Battle one
// Round duration after its last Round.
func (s *State) fightBattles(c *cs.Content, now int64, ev *Events) {
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		b := s.Battles[id]
		for b.Sent < len(b.Result.Rounds) && b.Started+int64(b.Sent)*b.RoundMs <= now {
			ev.Rounds = append(ev.Rounds, BattleRound{Battle: b, Round: b.Sent})
			b.Sent++
		}
		if b.Sent == len(b.Result.Rounds) && b.Started+int64(b.Sent)*b.RoundMs <= now {
			s.endBattle(c, b, ev)
		}
	}
}

// endBattle puts the survivors back, back to full Shield, Armor and HP:
// only unit counts carry over. Armed buildings that died are destroyed. A
// winning attacker captures the Planet and moves in; a beaten one Retreats.
func (s *State) endBattle(c *cs.Content, b *Battle, ev *Events) {
	p := s.Planets[b.Planet]
	alive := map[string]bool{}
	for _, id := range b.Result.Survivors {
		alive[id] = true
	}
	var attackers Stack
	var stacks [StacksPerPlanet]Stack
	d := 0 // index into Origins
	for _, cb := range b.Result.Roster {
		if cb.Side == Attacker {
			if alive[cb.ID] {
				attackers = attackers.add(cb.Unit, 1)
			}
			continue
		}
		o := b.Origins[d]
		d++
		switch {
		case o.Stack >= 0 && alive[cb.ID]:
			stacks[o.Stack] = stacks[o.Stack].add(cb.Unit, 1)
		case o.Stack < 0 && !alive[cb.ID]:
			p.Buildings[o.Slot] = ""
		}
	}
	p.Stacks, p.Locked = stacks, false
	delete(s.Battles, b.ID)

	winner := b.Defender
	if b.Result.Winner == Attacker {
		winner = b.Attacker
	}
	if s.Players[b.Attacker].Eliminated {
		attackers = nil // eliminated mid-Battle: their Armies are gone
	}
	viewers := []int{}
	for seat := range s.Players {
		if seat == b.Attacker || seat == b.Defender || s.sees(seat, p.ID) {
			viewers = append(viewers, seat)
		}
	}
	ev.Ended = append(ev.Ended, BattleEnded{Battle: b.ID, Planet: p.ID, Winner: winner, Viewers: viewers})
	if len(attackers) == 0 {
		return // a winning attacker always has survivors, unless eliminated mid-Battle
	}

	s.LastID++
	a := &Army{ID: s.LastID, Owner: b.Attacker, Units: attackers, From: p.ID, To: p.ID, ToStack: b.ToStack}
	if winner == b.Attacker {
		s.capture(p, b.Attacker, ev)
		a.Waiting = true
		s.Armies[a.ID] = a
		s.land(c, a, p) // with overflow; what doesn't fit waits in orbit
		return
	}
	a.Retreating = true
	if s.retreat(a, s.Time) {
		s.Armies[a.ID] = a
	}
}

// retreat sends an Army from where it is now to its owner's nearest Planet,
// and reports false if they have none.
func (s *State) retreat(a *Army, at int64) bool {
	path := s.retreatRoute(a.To, a.Owner)
	if path == nil {
		return false
	}
	a.Path = path[1:]
	a.hop(s.Lanes, at)
	return true
}

// retreatRoute is the route to the owner's Planet that is the fewest Lane
// jumps away, passing through any Planet. Ties go to the shorter travel
// time, then the lowest Planet id, all byte-wise.
func (s *State) retreatRoute(from string, seat int) []string {
	type label struct {
		jumps int
		ms    int64
		path  []string
	}
	better := func(a, b label) bool {
		return cmp.Or(cmp.Compare(a.jumps, b.jumps), cmp.Compare(a.ms, b.ms), slices.Compare(a.path, b.path)) < 0
	}
	best := map[string]label{from: {0, 0, []string{from}}}
	done := map[string]bool{}
	var found *label
	for {
		cur, ok := "", false
		for id, l := range best {
			if !done[id] && (!ok || better(l, best[cur])) {
				cur, ok = id, true
			}
		}
		if !ok {
			break
		}
		done[cur] = true
		l := best[cur]
		if cur != from && s.owns(seat)(cur) {
			// Settled in (jumps, time, path) order, so the first owned Planet
			// wins every tie but the lowest-id one among equals; check that.
			if found == nil || cmp.Or(cmp.Compare(l.jumps, found.jumps), cmp.Compare(l.ms, found.ms), cmp.Compare(cur, found.path[len(found.path)-1])) < 0 {
				found = &l
			}
			continue
		}
		for next, t := range s.Lanes[cur] {
			nl := label{l.jumps + 1, l.ms + t, append(slices.Clone(l.path), next)}
			if old, seen := best[next]; !done[next] && (!seen || better(nl, old)) {
				best[next] = nl
			}
		}
	}
	if found == nil {
		return nil
	}
	return found.path
}
