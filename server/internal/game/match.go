package game

import (
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Neutral owns every Planet that no Seat does.
const Neutral = -1

// RulesetID is the one Ruleset; later Mods Patch it.
const RulesetID = "base:rules"

const StacksPerPlanet = 3

// UnitSlot holds any number of one unit type, in one cell of its Stack's grid.
type UnitSlot struct {
	Unit  string
	Count int
	Cell  int // 0 to the Ruleset's unitSlotsPerStack-1; unique in its Stack
}

// Stack is a Planet's garrison group: its Unit Slots, each in its own cell.
// The slice's order means nothing; Cell places a slot.
type Stack []UnitSlot

type Planet struct {
	ID        string
	Owner     int // a Seat index, or Neutral
	Capital   bool
	Locked    bool
	Buildings []string // one per Building Slot; "" is empty
	Stacks    [StacksPerPlanet]Stack
	Queue     []QueueItem // construction, in order; only the first runs
	// UnitQueues has a queue per production building, by Building Slot.
	UnitQueues map[int][]QueueItem
	Rally      int // the Stack trained units join
	// Techs are what each Lab holds, by its Building Slot; they count only
	// while that slot still has a Lab.
	Techs map[int][]string
	// From its Planet Type and the map's overrides, fixed at Start.
	Income            map[string]int
	Richness          map[string]string // per Resource; missing is none
	CommandPointBonus int
}

type Player struct {
	Seat        int
	User        string
	DisplayName string
	Faction     string
	Resources   map[string]int
	Eliminated  bool
	// A disconnected player keeps their Seat until GraceEnds (Match Time).
	Disconnected bool
	GraceEnds    int64
	Forfeiting   bool // eliminated on the next tick
	// Planets seen through Armies, and the Match Time each sighting ends.
	Sighted map[string]int64
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
	Lanes       map[string]map[string]int64 // static: from, to, travel ms; both ways
	PaydayEvery int64                       // ms
	NextPayday  int64                       // Match Time
	LastID      uint32                      // Match entity ids come from this one counter
	Armies      map[uint32]*Army
	Battles     map[uint32]*Battle
	Fields      map[string]*battle.Field // each Planet's Battlefield, once it's had a Battle
	// The win-hold: the Seat holding more than the map's share of Planets
	// (-1 for none) and when its hold runs out.
	HoldSeat int
	HoldEnds int64
	Result   *Result // set once the Match is over
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
		Seed: seed, Map: mapID, Planets: map[string]*Planet{}, Lanes: map[string]map[string]int64{},
		PaydayEvery: payday, NextPayday: payday, HoldSeat: Neutral,
	}
	for _, mp := range m.Planets {
		pt := c.PlanetTypes[string(mp.Type)]
		slots, income, cp := pt.BuildingSlots, pt.Income, pt.CommandPointBonus
		rich := pt.Richness
		if o := mp.Overrides; o != nil {
			if o.Richness != nil {
				rich = o.Richness
			}
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
		richness := map[string]string{}
		for r, v := range rich {
			richness[r] = string(v)
		}
		p := &Planet{
			ID: string(mp.ID), Owner: Neutral, Buildings: make([]string, slots),
			Income: maps.Clone(income), Richness: richness, CommandPointBonus: cp,
		}
		p.Stacks = toStacks(c, m.Garrisons[string(mp.ID)])
		s.Planets[p.ID] = p
	}
	positions := map[string]cs.Position{}
	for _, mp := range m.Planets {
		positions[string(mp.ID)] = mp.Position
	}
	for _, l := range m.Lanes {
		from, to := string(l.From), string(l.To)
		ms := laneTime(l, positions[from], positions[to], c.Rulesets[RulesetID].LaneTypes)
		for _, end := range [][2]string{{from, to}, {to, from}} {
			if s.Lanes[end[0]] == nil {
				s.Lanes[end[0]] = map[string]int64{}
			}
			s.Lanes[end[0]][end[1]] = ms
		}
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
		p.Stacks = toStacks(c, kit.Stacks) // replaces the unused-start garrison
		s.Players = append(s.Players, Player{
			Seat: seat, User: setup.User, DisplayName: setup.DisplayName, Faction: setup.Faction,
			Resources: maps.Clone(startingResources),
		})
	}
	return s, nil
}

func toStacks(c *cs.Content, in cs.Stacks) [StacksPerPlanet]Stack {
	var out [StacksPerPlanet]Stack
	for i, st := range in {
		for _, e := range st {
			out[i] = out[i].add(string(e.Unit), e.Count, slotLimit(c, string(e.Unit)))
		}
	}
	return out
}
