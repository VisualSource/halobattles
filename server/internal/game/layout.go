package game

import (
	"errors"
	"fmt"

	"github.com/VisualSource/halobattles/server/internal/battle"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// DefenceLayout is a Planet's defence layout as its owner edits it: the
// Battlefield they'd defend it on, where its buildings (by Building Slot) and
// Stacks start there, and the layout as set.
type DefenceLayout struct {
	Planet        string
	Field         *battle.Field
	Reach         float64
	BuildingSites []int // per Building Slot: an index into Field.Sites, or -1
	StackStarts   []battle.Cell
	Layout        battle.Layout
}

// DefenceLayout is seat's own Planet's layout.
func (s *State) DefenceLayout(c *cs.Content, seat int, planet string) (DefenceLayout, error) {
	p := s.Planets[planet]
	if p == nil || p.Owner != seat || seat < 0 {
		return DefenceLayout{}, fmt.Errorf("you don't own %s", planet)
	}
	f := s.field(c, p.ID, s.Players[seat].Faction)
	reach := c.Rulesets[RulesetID].Battle.StartReach
	sites, starts := f.Deploy(p.Buildings, StacksPerPlanet, p.Layout, reach)
	return DefenceLayout{Planet: p.ID, Field: f, Reach: reach, BuildingSites: sites, StackStarts: starts, Layout: p.Layout}, nil
}

// SetDefenceLayout replaces seat's own Planet's layout: each Building Slot's
// site, and each Stack's start. A start out of reach of the Command Post and
// the buildings is dropped, as Deploy would: a building moved or sold away
// from a Stack never blocks the change. Changes apply to the next Battle there.
func (s *State) SetDefenceLayout(c *cs.Content, seat int, planet string, l battle.Layout) error {
	p, err := s.ownedPlanet(seat, planet)
	if err != nil {
		return err
	}
	f := s.field(c, p.ID, s.Players[seat].Faction)
	used := map[int]bool{}
	for slot, k := range l.Sites {
		switch {
		case slot < 0 || slot >= len(p.Buildings) || k < 0 || k >= len(f.Sites):
			return errors.New("no such building site")
		case used[k]:
			return errors.New("two buildings on one site")
		}
		used[k] = true
	}
	reach := c.Rulesets[RulesetID].Battle.StartReach
	_, starts := f.Deploy(p.Buildings, StacksPerPlanet, l, reach)
	for k, at := range l.Starts {
		switch {
		case k < 0 || k >= StacksPerPlanet:
			return errors.New("no such Stack")
		case starts[k] != at:
			delete(l.Starts, k)
		}
	}
	p.Layout = l
	return nil
}
