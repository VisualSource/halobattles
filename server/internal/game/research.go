package game

import (
	"errors"
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Project is the research of one Tech, in the Lab in Building Slot Slot of
// Planet, where it reserves a Tech Slot. Its progress is Done as of Since,
// growing at Rate per second; Rate changes only when the split of Research
// does, so a View shows the bar without a change every tick.
type Project struct {
	Tech   string
	Planet string
	Slot   int
	Cost   int     // Research, fixed when it started
	Done   float64 // Research put in by Since
	Since  int64   // Match Time
	Rate   float64 // its share of Research per second; 0 while paused
}

// Saved is a guaranteed card, offered beside the hand until picked: a
// stopped Project with its progress and cost, or a lost Tech, which costs
// the Ruleset's recovery percentage of techCost when it's picked.
type Saved struct {
	Tech string
	Cost int
	Done float64
	Lost bool
}

// recoveryCost is what researching a lost tech again costs seat now.
func (s *State) recoveryCost(c *cs.Content, seat int, tech string) int {
	return (s.techCost(c, seat, tech)*c.Rulesets[RulesetID].Tech.RecoveryPercent + 50) / 100
}

// loseLab empties the Lab in slot of p: its owner gets each Tech it held
// back as a guaranteed card. Call it before the building leaves the slot.
func (s *State) loseLab(p *Planet, slot int) {
	techs := p.Techs[slot]
	delete(p.Techs, slot)
	if p.Owner == Neutral {
		return
	}
	pl := &s.Players[p.Owner]
	for _, t := range techs {
		pl.Saved = append(pl.Saved, Saved{Tech: t, Lost: true})
	}
}

// researchRate is seat's Research per second: its Capital's, plus each
// research building it owns, Locked or not.
func (s *State) researchRate(c *cs.Content, seat int) int {
	rate := 0
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		if p.Capital {
			rate += c.Rulesets[RulesetID].Tech.CapitalResearch
		}
		for _, b := range p.Buildings {
			if r := c.Buildings[b].Research; r != nil {
				rate += *r
			}
		}
	}
	return rate
}

// techCost is what a new Project for tech costs seat: its base cost, plus
// the Ruleset's percentage for each Tech seat holds.
func (s *State) techCost(c *cs.Content, seat int, tech string) int {
	held := len(s.heldTechs(c, seat))
	return (c.Techs[tech].Cost*(100+held*c.Rulesets[RulesetID].Tech.CostScalingPercent) + 50) / 100
}

// hasBuilding reports whether seat has the building standing on any of its Planets.
func (s *State) hasBuilding(seat int, building cs.ID) bool {
	for _, p := range s.Planets {
		if p.Owner == seat && slices.Contains(p.Buildings, string(building)) {
			return true
		}
	}
	return false
}

// requirementsMet: seat holds every Tech, and owns every building, tech requires.
func (s *State) requirementsMet(c *cs.Content, seat int, tech string, held map[string]bool) bool {
	r := c.Techs[tech].Requires
	if r == nil {
		return true
	}
	for _, t := range r.Techs {
		if !held[string(t)] {
			return false
		}
	}
	for _, b := range r.Buildings {
		if !s.hasBuilding(seat, b) {
			return false
		}
	}
	return true
}

// pool is every Tech seat could be offered: its Faction's or shared, not
// held, running or saved, with its requirements met, of a Rarity seat's
// Research rate has opened. Sorted, so draws replay.
func (s *State) pool(c *cs.Content, seat int) []string {
	pl := s.Players[seat]
	held := s.heldTechs(c, seat)
	rate := s.researchRate(c, seat)
	rarities := c.Rulesets[RulesetID].Tech.Rarities
	var out []string
	for _, id := range slices.Sorted(maps.Keys(c.Techs)) {
		t := c.Techs[id]
		switch {
		case t.Faction != nil && string(*t.Faction) != pl.Faction,
			held[id],
			slices.ContainsFunc(pl.Projects, func(p Project) bool { return p.Tech == id }),
			slices.ContainsFunc(pl.Saved, func(v Saved) bool { return v.Tech == id }),
			rate < rarities[string(t.Rarity)].From,
			!s.requirementsMet(c, seat, id, held):
			continue
		}
		out = append(out, id)
	}
	return out
}

// drawHand deals seat a new hand from its pool, weighted by Rarity and
// without repeats, from its own stream of the Match seed.
func (s *State) drawHand(c *cs.Content, seat int) {
	pl := &s.Players[seat]
	rules := c.Rulesets[RulesetID].Tech
	rng := rand.New(rand.NewPCG(s.Seed, uint64(seat)<<32|pl.Draws))
	pl.Draws++
	pool := s.pool(c, seat)
	pl.Hand = nil
	for len(pl.Hand) < rules.HandSize && len(pool) > 0 {
		total := 0
		for _, id := range pool {
			total += rules.Rarities[string(c.Techs[id].Rarity)].Weight
		}
		if total == 0 {
			break // only weightless Rarities are left
		}
		pick := rng.IntN(total)
		for i, id := range pool {
			if pick -= rules.Rarities[string(c.Techs[id].Rarity)].Weight; pick < 0 {
				pl.Hand = append(pl.Hand, id)
				pool = slices.Delete(pool, i, i+1)
				break
			}
		}
	}
}

// labAt is the Lab in slot of planet, if seat owns it.
func (s *State) labAt(c *cs.Content, seat int, planet string, slot int) (*Planet, int, bool) {
	p := s.Planets[planet]
	if p == nil || p.Owner != seat || slot < 0 || slot >= len(p.Buildings) {
		return nil, 0, false
	}
	n := c.Buildings[p.Buildings[slot]].TechSlots
	if n == nil {
		return nil, 0, false
	}
	return p, *n, true
}

// StartProject starts researching tech, a card from seat's hand or a
// guaranteed card, in the Lab in slot of planet, reserving one of its Tech
// Slots. A card from the hand costs what techCost says now; a stopped
// Project keeps its cost and progress; a lost Tech costs recoveryCost. A
// guaranteed card still needs its requirements. Starting from the hand
// draws a new one.
func (s *State) StartProject(c *cs.Content, seat int, tech, planet string, slot int) error {
	pl, err := s.player(seat)
	if err != nil {
		return err
	}
	saved := slices.IndexFunc(pl.Saved, func(v Saved) bool { return v.Tech == tech })
	_, slots, isLab := s.labAt(c, seat, planet, slot)
	reserved := 0
	for _, p := range pl.Projects {
		if p.Planet == planet && p.Slot == slot {
			reserved++
		}
	}
	switch {
	case !slices.Contains(pl.Hand, tech) && saved < 0:
		return errors.New("that Tech isn't on offer")
	case saved >= 0 && !s.requirementsMet(c, seat, tech, s.heldTechs(c, seat)):
		return errors.New("you no longer have what that Tech requires")
	case !isLab:
		return fmt.Errorf("you have no Lab in Building Slot %d of %s", slot+1, planet)
	case len(s.Planets[planet].Techs[slot])+reserved >= slots:
		return errors.New("that Lab has no free Tech Slot")
	case len(pl.Projects) >= c.Rulesets[RulesetID].Tech.ProjectLimit:
		return fmt.Errorf("you can run at most %d Projects", c.Rulesets[RulesetID].Tech.ProjectLimit)
	}
	p := Project{Tech: tech, Planet: planet, Slot: slot, Since: s.Time}
	if saved >= 0 {
		p.Cost, p.Done = pl.Saved[saved].Cost, pl.Saved[saved].Done
		if pl.Saved[saved].Lost {
			p.Cost = s.recoveryCost(c, seat, tech)
		}
		pl.Saved = slices.Delete(pl.Saved, saved, saved+1)
	} else {
		p.Cost = s.techCost(c, seat, tech)
		pl.Hand = nil // the next tick draws a new one
	}
	pl.Projects = append(pl.Projects, p)
	return nil
}

// CancelProject stops seat's Project for tech, freeing its Tech Slot; it's
// saved with its progress.
func (s *State) CancelProject(seat int, tech string) error {
	pl, err := s.player(seat)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(pl.Projects, func(p Project) bool { return p.Tech == tech })
	if i < 0 {
		return errors.New("no Project for that Tech")
	}
	pl.stop(i, s.Time)
	return nil
}

// player is seat's Player, if it's still in the Match.
func (s *State) player(seat int) (*Player, error) {
	if seat < 0 || seat >= len(s.Players) || s.Players[seat].Eliminated {
		return nil, errors.New("you're not in this Match")
	}
	return &s.Players[seat], nil
}

// stop saves Project i with its progress up to now.
func (pl *Player) stop(i int, now int64) {
	p := pl.Projects[i]
	pl.Saved = append(pl.Saved, Saved{Tech: p.Tech, Cost: p.Cost, Done: p.done(now)})
	pl.Projects = slices.Delete(pl.Projects, i, i+1)
}

func (p Project) done(now int64) float64 { return p.Done + p.Rate*float64(now-p.Since)/1000 }

// research runs every player's Projects. Research is split evenly across
// the running ones; a Project pauses while its owner is in debt, its Lab's
// Planet is Locked, or a building it requires is missing. A Project whose
// Lab is gone stops and is saved. A finished one is held in its Lab. A
// player with no hand is dealt one.
func (s *State) research(c *cs.Content, now int64) {
	for seat := range s.Players {
		pl := &s.Players[seat]
		if pl.Eliminated {
			continue
		}
		for i := len(pl.Projects) - 1; i >= 0; i-- {
			if _, _, ok := s.labAt(c, seat, pl.Projects[i].Planet, pl.Projects[i].Slot); !ok {
				pl.stop(i, now)
			}
		}
		running := make([]bool, len(pl.Projects))
		n := 0
		for i, p := range pl.Projects {
			r := c.Techs[p.Tech].Requires
			running[i] = !pl.inDebt() && !s.Planets[p.Planet].Locked &&
				(r == nil || !slices.ContainsFunc(r.Buildings, func(b cs.ID) bool { return !s.hasBuilding(seat, b) }))
			if running[i] {
				n++
			}
		}
		share := 0.0
		if n > 0 {
			share = float64(s.researchRate(c, seat)) / float64(n)
		}
		for i := len(pl.Projects) - 1; i >= 0; i-- {
			p := &pl.Projects[i]
			rate := 0.0
			if running[i] {
				rate = share
			}
			if rate != p.Rate {
				p.Done, p.Since, p.Rate = p.done(now), now, rate
			}
			if p.done(now) >= float64(p.Cost) {
				lab := s.Planets[p.Planet]
				if lab.Techs == nil {
					lab.Techs = map[int][]string{}
				}
				lab.Techs[p.Slot] = append(lab.Techs[p.Slot], p.Tech)
				pl.Projects = slices.Delete(pl.Projects, i, i+1)
			}
		}
		if pl.Hand == nil {
			s.drawHand(c, seat)
		}
	}
}
