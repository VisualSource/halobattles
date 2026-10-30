package game

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// heldTechs is every Tech seat holds: those in the Labs on its Planets.
func (s *State) heldTechs(c *cs.Content, seat int) map[string]bool {
	held := map[string]bool{}
	for _, p := range s.Planets {
		if p.Owner != seat {
			continue
		}
		for slot, techs := range p.Techs {
			if c.Buildings[p.Buildings[slot]].TechSlots == nil {
				continue // its Lab is gone
			}
			for _, t := range techs {
				held[t] = true
			}
		}
	}
	return held
}

// mustUnlock refuses a unit (or, with unit false, a building) that some Tech
// unlocks while seat holds none of those Techs, naming them. Anything no
// Tech unlocks is free.
func (s *State) mustUnlock(c *cs.Content, seat int, id string, unit bool) error {
	var held map[string]bool
	var need []string
	for _, tid := range slices.Sorted(maps.Keys(c.Techs)) {
		t := c.Techs[tid]
		if t.Unlocks == nil {
			continue
		}
		list := t.Unlocks.Buildings
		if unit {
			list = t.Unlocks.Units
		}
		if !slices.Contains(list, cs.ID(id)) {
			continue
		}
		if held == nil {
			held = s.heldTechs(c, seat)
		}
		if held[tid] {
			return nil
		}
		need = append(need, string(t.Name))
	}
	if need == nil {
		return nil
	}
	return fmt.Errorf("research %s first", strings.Join(need, " or "))
}

// labs counts the Planet's Labs, built and queued.
func (p *Planet) labs(c *cs.Content) int {
	n := 0
	for _, b := range p.Buildings {
		if c.Buildings[b].TechSlots != nil {
			n++
		}
	}
	for _, q := range p.Queue {
		if c.Buildings[q.Building].TechSlots != nil {
			n++
		}
	}
	return n
}
