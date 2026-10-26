package game

import (
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Neutral owns every Planet that no Seat does.
const Neutral = -1

// RulesetID is the one Ruleset; later Mods Patch it.
const RulesetID = "base:rules"

const StacksPerPlanet = 3

// UnitSlot holds any number of one unit type.
type UnitSlot struct {
	Unit  string
	Count int
}

// Stack is a Planet's garrison group: its Unit Slots in order.
type Stack []UnitSlot

type Planet struct {
	ID        string
	Owner     int // a Seat index, or Neutral
	Capital   bool
	Locked    bool
	Buildings []string // one per Building Slot; "" is empty
	Stacks    [StacksPerPlanet]Stack
	// From its Planet Type and the map's overrides, fixed at Start.
	Income            map[string]int
	CommandPointBonus int
}

type Player struct {
	Seat        int
	User        string
	DisplayName string
	Faction     string
	Resources   map[string]int
}

// State is the full, authoritative state of a running Match. It is plain
// data, so it can be saved and restored. Time and randomness come in from
// outside: the adapter sets Time each tick, and every random choice draws
// from Seed.
type State struct {
	Seed        uint64
	Time        int64 // Match Time, in ms since Start
	Map         string
	Players     []Player // indexed by Seat
	Planets     map[string]*Planet
	Neighbours  map[string][]string // the static Lanes, both ways
	PaydayEvery int64               // ms
	NextPayday  int64               // Match Time
}

// SeatSetup is one Seat as the lobby left it.
type SeatSetup struct {
	User        string
	DisplayName string
	Faction     string
}

// StartMatch places each Seat on one of the map's starts, shuffled by seed,
// with its Faction's Starting Kit. Unused starts and every other Planet keep
// their neutral garrisons.
func StartMatch(c *cs.Content, mapID string, seats []SeatSetup, startingResources map[string]int, seed uint64) (*State, error) {
	m, ok := c.Maps[mapID]
	if !ok {
		return nil, fmt.Errorf("unknown map %s", mapID)
	}
	if len(seats) > len(m.Starts) {
		return nil, fmt.Errorf("%s has %d starts for %d Seats", mapID, len(m.Starts), len(seats))
	}

	payday := int64(c.Rulesets[RulesetID].PaydaySeconds) * 1000
	s := &State{
		Seed: seed, Map: mapID, Planets: map[string]*Planet{}, Neighbours: map[string][]string{},
		PaydayEvery: payday, NextPayday: payday,
	}
	for _, mp := range m.Planets {
		pt := c.PlanetTypes[string(mp.Type)]
		slots, income, cp := pt.BuildingSlots, pt.Income, pt.CommandPointBonus
		if o := mp.Overrides; o != nil {
			if o.BuildingSlots != nil {
				slots = *o.BuildingSlots
			}
			if o.Income != nil {
				income = o.Income
			}
			if o.CommandPointBonus != nil {
				cp = *o.CommandPointBonus
			}
		}
		p := &Planet{
			ID: string(mp.ID), Owner: Neutral, Buildings: make([]string, slots),
			Income: maps.Clone(income), CommandPointBonus: cp,
		}
		p.Stacks = toStacks(m.Garrisons[string(mp.ID)])
		s.Planets[p.ID] = p
	}
	for _, l := range m.Lanes {
		s.Neighbours[string(l.From)] = append(s.Neighbours[string(l.From)], string(l.To))
		s.Neighbours[string(l.To)] = append(s.Neighbours[string(l.To)], string(l.From))
	}

	starts := slices.Clone(m.Starts)
	rand.New(rand.NewPCG(seed, 0)).Shuffle(len(starts), func(i, j int) { starts[i], starts[j] = starts[j], starts[i] })

	for seat, setup := range seats {
		kit := c.Factions[setup.Faction].StartingKit
		p := s.Planets[string(starts[seat])]
		if len(kit.Buildings) > len(p.Buildings) {
			return nil, fmt.Errorf("%s's Starting Kit has %d buildings, but start %s has %d Building Slots",
				setup.Faction, len(kit.Buildings), p.ID, len(p.Buildings))
		}
		p.Owner, p.Capital = seat, true
		for i, b := range kit.Buildings {
			p.Buildings[i] = string(b)
		}
		p.Stacks = toStacks(kit.Stacks) // replaces the unused-start garrison
		s.Players = append(s.Players, Player{
			Seat: seat, User: setup.User, DisplayName: setup.DisplayName, Faction: setup.Faction,
			Resources: maps.Clone(startingResources),
		})
	}
	return s, nil
}

func toStacks(in cs.Stacks) [StacksPerPlanet]Stack {
	var out [StacksPerPlanet]Stack
	for i, st := range in {
		for _, e := range st {
			out[i] = append(out[i], UnitSlot{Unit: string(e.Unit), Count: e.Count})
		}
	}
	return out
}
