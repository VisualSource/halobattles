package game

import (
	"cmp"
	"errors"
	"hash/fnv"
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Battle is a Battle running on a Locked Planet: a tactical sim, stepped
// once per sim tick of Match Time.
//
// shortcut: Sim holds live state, not plain data, so a State with Battles
// running isn't serialisable; save the input log and re-sim instead when
// Matches are saved.
type Battle struct {
	ID       uint32
	Planet   string
	Attacker int   // a Seat
	Defender int   // a Seat, or Neutral
	Started  int64 // Match Time of the first sim tick, after the start delay
	ToStack  int   // where the attackers go if they win
	Sim      *battle.Sim
}

// tickMs is one sim tick in Match Time.
const tickMs = 1000 / battle.TicksPerSecond

// BattleTick is one sim tick's volleys in a Battle.
type BattleTick struct {
	Battle  *Battle
	Volleys []battle.Volley
}

// BattleEnded tells Viewers who won a Battle.
type BattleEnded struct {
	Battle  uint32
	Planet  string
	Winner  int // a Seat, or Neutral
	Viewers []int
}

// field is a Planet's Battlefield, generated on its first Battle from the
// Match seed and the Planet id, and the same for the rest of the Match.
func (s *State) field(c *cs.Content, planet string) *battle.Field {
	if f := s.Fields[planet]; f != nil {
		return f
	}
	var override *cs.PlanetBattlefield
	for _, mp := range c.Maps[s.Map].Planets {
		if string(mp.ID) == planet {
			override = mp.Battlefield
		}
	}
	h := fnv.New64a()
	h.Write([]byte(planet))
	f := battle.Generate(c, c.Rulesets[RulesetID].Battlefield, override, s.Seed^h.Sum64())
	if s.Fields == nil {
		s.Fields = map[string]*battle.Field{}
	}
	s.Fields[planet] = f
	return f
}

// startBattle fights an Army against everything defending a Planet: every
// unit in its Stacks, each Stack a formation, and every building. The Planet
// Locks until the Battle ends. Both sides deploy now, and the fighting
// starts after the Ruleset's start delay.
func (s *State) startBattle(c *cs.Content, a *Army, p *Planet, ev *Events) {
	s.LastID++
	delay := int64(c.Rulesets[RulesetID].Battle.StartDelay) * 1000 // time to open the Battle before it starts
	b := &Battle{ID: s.LastID, Planet: p.ID, Attacker: a.Owner, Defender: p.Owner, Started: s.Time + delay, ToStack: a.ToStack}
	var attack, defend battle.Force
	per := max(1, c.Rulesets[RulesetID].UnitSlotsPerStack)
	for i, u := range a.Units { // an Army's slots, a Stack's worth at a time
		if i%per == 0 {
			attack.Formations = append(attack.Formations, nil)
		}
		attack.Formations[i/per] = append(attack.Formations[i/per], battle.Slot{Unit: u.Unit, Count: u.Count, Cell: i % per})
	}
	for _, st := range p.Stacks {
		var f []battle.Slot
		for _, u := range st {
			f = append(f, battle.Slot{Unit: u.Unit, Count: u.Count, Cell: u.Cell})
		}
		defend.Formations = append(defend.Formations, f)
	}
	defend.Buildings = slices.Clone(p.Buildings)
	// Seeded from the Match seed plus the Battle id, so it can be replayed.
	b.Sim = battle.New(c, c.Rulesets[RulesetID], s.field(c, p.ID), attack, defend, s.Seed+uint64(b.ID))
	b.Sim.Controllers = [2]battle.Controller{battle.NewAI(s.aiWeights(c, b.Attacker)), battle.NewAI(s.aiWeights(c, b.Defender))}
	if b.Defender == Neutral { // no economy: a budget for pad turrets instead
		b.Sim.Funds[battle.Defender] = maps.Clone(c.Rulesets[RulesetID].Battle.NeutralFunds)
	}
	p.Locked = true
	delete(s.Armies, a.ID)
	if s.Battles == nil {
		s.Battles = map[uint32]*Battle{}
	}
	s.Battles[b.ID] = b
	ev.Started = append(ev.Started, b)
}

// aiWeights is how a Seat's Faction plays its Battles; a neutral garrison
// plays the defaults.
func (s *State) aiWeights(c *cs.Content, seat int) battle.Weights {
	if seat == Neutral {
		return battle.WeightsOf(nil)
	}
	return battle.WeightsOf(c.Factions[s.Players[seat].Faction].Ai)
}

// fightBattles steps each Battle's sim once per tick that's due, and ends
// each Battle once its sim is over.
func (s *State) fightBattles(c *cs.Content, now int64, ev *Events) {
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		b := s.Battles[id]
		for !b.Sim.Over && b.Started+int64(b.Sim.Tick+1)*tickMs <= now {
			if vs := b.Sim.Step(); len(vs) > 0 {
				ev.Ticks = append(ev.Ticks, BattleTick{Battle: b, Volleys: vs})
			}
		}
		if b.Sim.Over {
			s.endBattle(c, b, ev)
		}
	}
}

// endBattle settles a Battle; only unit counts carry over, back to full
// Shield, Armor and HP. Buildings that died are destroyed, whoever won. A
// winning attacker captures the Planet and moves in; a beaten one Retreats,
// with any squads that escaped the field. A beaten defender's survivors
// Retreat too, on the field or escaped, unless it's a neutral garrison, which
// has nowhere to go; a holding defender's go back to their slots.
func (s *State) endBattle(c *cs.Content, b *Battle, ev *Events) {
	p := s.Planets[b.Planet]
	// Eliminated mid-Battle: their Armies are gone, and the Planet holds.
	attackerWins := b.Sim.Winner == battle.Attacker && !s.Players[b.Attacker].Eliminated
	var attackers, defenders Stack
	var stacks [StacksPerPlanet]Stack
	for _, sq := range b.Sim.Squads {
		n := len(sq.Members)
		switch {
		case sq.OnPad > 0: // a pad turret lasts only the Battle
		case sq.Building:
			if n == 0 {
				s.loseLab(p, sq.Slot)
				p.Buildings[sq.Slot] = ""
			}
		case n == 0:
		case sq.Side == battle.Attacker:
			attackers = attackers.add(sq.Unit, n, 0)
		case attackerWins:
			defenders = defenders.add(sq.Unit, n, 0)
		default:
			for range n {
				stacks[sq.Formation] = stacks[sq.Formation].addToCell(sq.Unit, sq.Slot) // back to its own slot
			}
		}
	}
	p.Stacks, p.Locked = stacks, false
	delete(s.Battles, b.ID)

	winner := b.Defender
	if attackerWins {
		winner = b.Attacker
	}
	viewers := []int{}
	for seat := range s.Players {
		if seat == b.Attacker || seat == b.Defender || s.sees(seat, p.ID) {
			viewers = append(viewers, seat)
		}
	}
	ev.Ended = append(ev.Ended, BattleEnded{Battle: b.ID, Planet: p.ID, Winner: winner, Viewers: viewers})

	if len(attackers) > 0 && !s.Players[b.Attacker].Eliminated {
		s.LastID++
		a := &Army{ID: s.LastID, Owner: b.Attacker, Units: attackers, From: p.ID, To: p.ID, ToStack: b.ToStack}
		if attackerWins {
			s.capture(p, b.Attacker, ev)
			a.Waiting = true
			s.Armies[a.ID] = a
			s.land(c, a, p) // with overflow; what doesn't fit waits in orbit
		} else {
			a.Retreating = true
			if s.retreat(a, s.Time) {
				s.Armies[a.ID] = a
			}
		}
	}
	// After the capture: losing a Capital can eliminate the defender.
	if len(defenders) > 0 && b.Defender != Neutral && !s.Players[b.Defender].Eliminated {
		s.LastID++
		d := &Army{ID: s.LastID, Owner: b.Defender, Units: defenders, From: p.ID, To: p.ID, Retreating: true}
		if s.retreat(d, s.Time) {
			s.Armies[d.ID] = d
		}
	}
}

// RetreatFromBattle orders seat's side of the Battle on planet to Retreat,
// or with cancel calls off a Retreat still counting down. A defender needs
// another Planet to Retreat to.
func (s *State) RetreatFromBattle(seat int, planet string, cancel bool) error {
	b, side, err := s.sideIn(seat, planet)
	if err != nil {
		return err
	}
	switch {
	case cancel && (b.Sim.Retreating[side] || b.Sim.RetreatAt[side] == 0):
		return errors.New("there's no Retreat to call off")
	case cancel:
		b.Sim.Command(side, battle.Order{Kind: battle.CancelRetreat})
		return nil
	case b.Sim.RetreatAt[side] != 0:
		return errors.New("you're already Retreating")
	case side == battle.Defender && s.retreatRoute(planet, seat) == nil:
		return errors.New("you have no other Planet to Retreat to")
	}
	b.Sim.Command(side, battle.Order{Kind: battle.Retreat})
	return nil
}

// sideIn is the Battle on planet that seat is fighting, and its side there.
func (s *State) sideIn(seat int, planet string) (*Battle, battle.Side, error) {
	for _, id := range slices.Sorted(maps.Keys(s.Battles)) {
		if b := s.Battles[id]; b.Planet == planet && (b.Attacker == seat || b.Defender == seat) {
			if seat == b.Attacker {
				return b, battle.Attacker, nil
			}
			return b, battle.Defender, nil
		}
	}
	return nil, 0, errors.New("you aren't fighting a Battle there")
}

// BuildTurret builds a pad turret of seat's Faction on a build pad its side
// holds in the Battle on planet, paying its cost from seat's Resources now.
func (s *State) BuildTurret(c *cs.Content, seat int, planet string, pad int, building string) error {
	b, side, err := s.sideIn(seat, planet)
	if err != nil {
		return err
	}
	if string(c.Buildings[building].Faction) != s.Players[seat].Faction {
		return errors.New("that isn't your Faction's")
	}
	if err := s.mustUnlock(c, seat, building, false); err != nil {
		return err
	}
	if err := b.Sim.CanBuild(side, pad, building); err != nil {
		return err
	}
	res := s.Players[seat].Resources
	cost := c.Buildings[building].Cost
	for r, n := range cost {
		if res[r] < n {
			return errors.New("you can't afford that")
		}
	}
	for r, n := range cost {
		res[r] -= n
	}
	b.Sim.Command(side, battle.Order{Kind: battle.Build, Target: pad, Building: building})
	return nil
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
