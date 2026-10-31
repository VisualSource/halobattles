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
// growing at Rate per second, its field's whole Research rate; Rate changes
// only when that rate does, so a View shows the bar without a change every
// tick.
type Project struct {
	Tech   string
	Planet string
	Slot   int
	Cost   int     // Research, fixed when it started
	Done   float64 // Research put in by Since
	Since  int64   // Match Time
	Rate   float64 // its field's Research per second; 0 while paused
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

// researchRates is seat's Research per second in each Research field: its
// Capital's in every field, plus what each research building it owns makes
// in the fields it names, Locked or not.
func (s *State) researchRates(c *cs.Content, seat int) map[string]int {
	rules := c.Rulesets[RulesetID].Tech
	rates := map[string]int{}
	for f := range rules.Fields {
		rates[f] = 0
	}
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		if p.Capital {
			for f := range rates {
				rates[f] += rules.CapitalResearch
			}
		}
		for _, b := range p.Buildings {
			for f, r := range c.Buildings[b].Research {
				rates[f] += r
			}
		}
	}
	e := s.effects(c, seat)
	for f, r := range rates {
		rates[f] = e.field("research", f).of(r)
	}
	return rates
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

// pool is every Tech of field seat could be offered: its Faction's or
// shared, not held, running or saved, with its requirements met, of a
// Rarity the field's Research rate has opened. Sorted, so draws replay.
func (s *State) pool(c *cs.Content, seat int, field string, rate int) []string {
	pl := s.Players[seat]
	held := s.heldTechs(c, seat)
	rarities := c.Rulesets[RulesetID].Tech.Rarities
	var out []string
	for _, id := range slices.Sorted(maps.Keys(c.Techs)) {
		t := c.Techs[id]
		switch {
		case string(t.Field) != field,
			t.Faction != nil && string(*t.Faction) != pl.Faction,
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

// drawHand deals seat a new hand for field from its pool, weighted by
// Rarity and without repeats, from seat's own stream of the Match seed. An
// empty pool deals nothing, so the next tick tries again.
func (s *State) drawHand(c *cs.Content, seat int, field string, rate int) {
	pl := &s.Players[seat]
	rules := c.Rulesets[RulesetID].Tech
	rng := rand.New(rand.NewPCG(s.Seed, uint64(seat)<<32|pl.Draws))
	pl.Draws++
	pool := s.pool(c, seat, field, rate)
	var hand []string
	for len(hand) < rules.HandSize && len(pool) > 0 {
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
				hand = append(hand, id)
				pool = slices.Delete(pool, i, i+1)
				break
			}
		}
	}
	if len(hand) > 0 {
		if pl.Hands == nil {
			pl.Hands = map[string][]string{}
		}
		pl.Hands[field] = hand
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
	return p, s.effects(c, seat).all("techSlots").of(*n), true
}

// StartProject starts researching tech, a card from its field's hand or a
// guaranteed card, in the Lab in slot of planet, reserving one of its Tech
// Slots; its field must have no Project already. A card from the hand
// costs what techCost says now; a stopped Project keeps its cost and
// progress; a lost Tech costs recoveryCost. A guaranteed card still needs
// its requirements. Starting puts the field's hand away; the field gets a
// new one once it's free again.
func (s *State) StartProject(c *cs.Content, seat int, tech, planet string, slot int) error {
	pl, err := s.player(seat)
	if err != nil {
		return err
	}
	field := string(c.Techs[tech].Field)
	saved := slices.IndexFunc(pl.Saved, func(v Saved) bool { return v.Tech == tech })
	_, slots, isLab := s.labAt(c, seat, planet, slot)
	reserved := 0
	for _, p := range pl.Projects {
		if p.Planet == planet && p.Slot == slot {
			reserved++
		}
	}
	switch {
	case !slices.Contains(pl.Hands[field], tech) && saved < 0:
		return errors.New("that Tech isn't on offer")
	case slices.ContainsFunc(pl.Projects, func(p Project) bool { return string(c.Techs[p.Tech].Field) == field }):
		return fmt.Errorf("%s already runs a Project", c.Rulesets[RulesetID].Tech.Fields[field].Name)
	case saved >= 0 && !s.requirementsMet(c, seat, tech, s.heldTechs(c, seat)):
		return errors.New("you no longer have what that Tech requires")
	case !isLab:
		return fmt.Errorf("you have no Lab in Building Slot %d of %s", slot+1, planet)
	case len(s.Planets[planet].Techs[slot])+reserved >= slots:
		return errors.New("that Lab has no free Tech Slot")
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
	}
	delete(pl.Hands, field)
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

// research runs every player's Projects, each at its field's whole rate. A
// Project pauses, leaving its field idle, while its Lab's Planet is Locked
// or a building it requires is missing. A Project
// whose Lab is gone stops and is saved. A finished one is held in its Lab.
// Each field with no Project and no hand is dealt one.
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
		rates := s.researchRates(c, seat)
		for i := len(pl.Projects) - 1; i >= 0; i-- {
			p := &pl.Projects[i]
			r := c.Techs[p.Tech].Requires
			rate := 0.0
			if !s.Planets[p.Planet].Locked &&
				(r == nil || !slices.ContainsFunc(r.Buildings, func(b cs.ID) bool { return !s.hasBuilding(seat, b) })) {
				rate = float64(rates[string(c.Techs[p.Tech].Field)])
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
		for _, f := range slices.Sorted(maps.Keys(rates)) {
			_, dealt := pl.Hands[f]
			busy := slices.ContainsFunc(pl.Projects, func(p Project) bool { return string(c.Techs[p.Tech].Field) == f })
			if !dealt && !busy {
				s.drawHand(c, seat, f, rates[f])
			}
		}
	}
}
