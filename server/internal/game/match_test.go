package game

import (
	"encoding/json"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// A line map: a - b - c - d - e, with starts at both ends and the middle.
//
//	a(start) — b — c(start) — d — e(start)
func lineContent() *cs.Content {
	planet := func(id, typ string) cs.MapPlanet {
		return cs.MapPlanet{ID: cs.LocalID(id), Name: cs.Name(id), Type: cs.ID(typ)}
	}
	lane := func(from, to string) cs.Lane {
		return cs.Lane{From: cs.LocalID(from), To: cs.LocalID(to), Type: "fast", Time: new(30.0)}
	}
	stacks := func(unit string, n int) cs.Stacks {
		return cs.Stacks{cs.Stack{{Unit: cs.ID(unit), Count: n}}}
	}
	return &cs.Content{
		Rulesets: map[string]cs.Ruleset{RulesetID: {
			PaydaySeconds: 90, CancelRefundPercent: 50, SellRefundPercent: 50, UnitSlotsPerStack: 10,
			Tiers: map[string]float64{"none": 0, "weak": 0.6, "average": 1, "strong": 1.4}, InitiativeDie: 20, RoundCap: 40, RoundSeconds: 3,
		}},
		WeaponTypes: battleContent().WeaponTypes,
		Resources:   map[string]cs.Resource{"base:credits": {Name: "Credits"}, "base:materials": {Name: "Materials"}},
		PlanetTypes: map[string]cs.PlanetType{
			"base:capital":  {BuildingSlots: 4, CommandPointBonus: 20, Income: map[string]int{"base:credits": 300, "base:materials": 100}},
			"base:standard": {BuildingSlots: 3, CommandPointBonus: 10, Income: map[string]int{"base:credits": 200, "base:materials": 50}},
		},
		Buildings: map[string]cs.Building{
			"base:barracks": {Faction: "base:unsc", BuildTime: 30, Cost: map[string]int{"base:credits": 150},
				Upkeep: map[string]int{"base:credits": 10}, Trains: []cs.ID{"base:marine", "base:odst", "base:spartan"}},
			"base:supply-pad": {Faction: "base:unsc", BuildTime: 30, Cost: map[string]int{"base:credits": 200},
				Yield: map[string]int{"base:credits": 100}},
			"base:air-pad": {Faction: "base:unsc", BuildTime: 60, Cost: map[string]int{"base:credits": 300, "base:materials": 150},
				Upkeep: map[string]int{"base:credits": 30}},
			"base:hall": {Faction: "base:covenant", BuildTime: 30, Cost: map[string]int{"base:credits": 150}},
		},
		Units: map[string]cs.Unit{
			"base:marine": {CommandPoints: 1, BuildTime: 15, Cost: map[string]int{"base:credits": 50},
				Combat: battleContent().Units["base:marine"].Combat},
			"base:odst": {CommandPoints: 2, BuildTime: 25, Cost: map[string]int{"base:credits": 100},
				Combat: battleContent().Units["base:marine"].Combat},
			"base:spartan": {Name: "Spartans", CommandPoints: 1, BuildTime: 60, Cost: map[string]int{"base:credits": 100}, MaxCount: new(1),
				Combat: battleContent().Units["base:marine"].Combat},
			"base:warthog": {CommandPoints: 3, Combat: battleContent().Units["base:warthog"].Combat},
			"base:grunt":   {CommandPoints: 1, Combat: battleContent().Units["base:grunt"].Combat},
		},
		Factions: map[string]cs.Faction{
			"base:unsc": {StartingKit: cs.StartingKit{
				Buildings: []cs.ID{"base:barracks", "base:supply-pad"},
				Stacks:    cs.Stacks{cs.Stack{{Unit: "base:marine", Count: 10}, {Unit: "base:warthog", Count: 2}}},
			}},
		},
		Maps: map[string]cs.GalaxyMap{"base:line": {
			Planets: []cs.MapPlanet{
				planet("a", "base:capital"), planet("b", "base:standard"), planet("c", "base:capital"),
				planet("d", "base:standard"), planet("e", "base:capital"),
			},
			Lanes: []cs.Lane{lane("a", "b"), lane("b", "c"), lane("c", "d"), lane("d", "e")},
			Garrisons: map[string]cs.Stacks{
				"a": stacks("base:odst", 4), "c": stacks("base:odst", 4), "e": stacks("base:odst", 4),
				"b": stacks("base:grunt", 6),
			},
			Starts: []cs.LocalID{"a", "c", "e"},
			Win:    cs.Win{PlanetShare: 0.6, HoldSeconds: 90},
		}},
	}
}

func twoPlayerMatch(t *testing.T, seed uint64) *State {
	t.Helper()
	s, err := StartMatch(lineContent(), "base:line",
		[]SeatSetup{{User: "u1", Faction: "base:unsc"}, {User: "u2", Faction: "base:unsc"}},
		map[string]int{"base:credits": 1000}, seed)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func capitalOf(s *State, seat int) *Planet {
	for _, p := range s.Planets {
		if p.Capital && p.Owner == seat {
			return p
		}
	}
	return nil
}

func TestStartPlacesEachSeatOnAStartWithItsKit(t *testing.T) {
	s := twoPlayerMatch(t, 1)

	seen := map[string]bool{}
	for seat := range 2 {
		c := capitalOf(s, seat)
		if c == nil {
			t.Fatalf("Seat %d has no Capital", seat)
		}
		if !slices.Contains([]string{"a", "c", "e"}, c.ID) || seen[c.ID] {
			t.Errorf("Seat %d's Capital %s isn't a distinct start", seat, c.ID)
		}
		seen[c.ID] = true
		if want := []string{"base:barracks", "base:supply-pad", "", ""}; !slices.Equal(c.Buildings, want) {
			t.Errorf("Capital buildings = %q, want %q (4 Building Slots)", c.Buildings, want)
		}
		if want := (Stack{{Unit: "base:marine", Count: 10}, {Unit: "base:warthog", Count: 2}}); !slices.Equal(c.Stacks[0], want) ||
			len(c.Stacks[1]) != 0 {
			t.Errorf("Capital Stacks = %+v, want the Starting Kit (not the garrison)", c.Stacks)
		}
	}
	if s.Players[0].Resources["base:credits"] != 1000 {
		t.Errorf("starting resources = %v", s.Players[0].Resources)
	}
}

func TestUnusedStartsAndNeutralsKeepTheirGarrisons(t *testing.T) {
	s := twoPlayerMatch(t, 1)

	for _, id := range []string{"a", "c", "e"} {
		p := s.Planets[id]
		if p.Owner != Neutral {
			continue
		}
		if p.Capital || len(p.Stacks[0]) != 1 || p.Stacks[0][0] != (UnitSlot{Unit: "base:odst", Count: 4}) {
			t.Errorf("unused start %s = %+v, want a neutral garrison and no Capital", id, p)
		}
	}
	if b := s.Planets["b"]; b.Owner != Neutral || b.Stacks[0][0] != (UnitSlot{Unit: "base:grunt", Count: 6}) || len(b.Buildings) != 3 {
		t.Errorf("neutral b = %+v", b)
	}
	if d := s.Planets["d"]; len(d.Stacks[0]) != 0 {
		t.Errorf("d has no garrison listed, got %+v", d.Stacks)
	}
}

func TestStartsAreShuffledByTheMatchSeed(t *testing.T) {
	capitals := func(seed uint64) [2]string {
		s := twoPlayerMatch(t, seed)
		return [2]string{capitalOf(s, 0).ID, capitalOf(s, 1).ID}
	}
	if capitals(7) != capitals(7) {
		t.Error("the same seed should give the same starts")
	}
	differs := false
	for seed := uint64(0); seed < 20; seed++ {
		if capitals(seed) != capitals(0) {
			differs = true
		}
	}
	if !differs {
		t.Error("20 seeds all gave the same starts; they aren't shuffled")
	}
}

func TestStateIsSerialisable(t *testing.T) {
	s := twoPlayerMatch(t, 3)

	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var back State
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatal(err)
	}
	if b2, _ := json.Marshal(&back); string(b2) != string(b) {
		t.Errorf("State doesn't survive a JSON round trip")
	}
}

// fixedMatch puts Seat 0 on a and Seat 1 on e, whatever the seed.
func fixedMatch(t *testing.T) *State {
	t.Helper()
	for seed := uint64(0); ; seed++ {
		s := twoPlayerMatch(t, seed)
		if capitalOf(s, 0).ID == "a" && capitalOf(s, 1).ID == "e" {
			return s
		}
	}
}

func planetIDs(v View) []string {
	var ids []string
	for _, p := range v.Planets {
		ids = append(ids, p.ID)
	}
	return ids
}

func TestViewShowsOwnedPlanetsAndTheirNeighbours(t *testing.T) {
	s := fixedMatch(t)

	v := s.View(lineContent(), 0)

	if got := planetIDs(v); !slices.Equal(got, []string{"a", "b"}) {
		t.Errorf("Seat 0 sees %v, want [a b] (its Capital and one Lane away)", got)
	}
	b := v.Planets[1]
	if b.Owner != Neutral || b.Stacks[0][0] != (UnitSlot{Unit: "base:grunt", Count: 6}) || len(b.Buildings) != 3 {
		t.Errorf("visible neutral b = %+v, want its owner, buildings and Stack contents", b)
	}
	if v.You != 0 || v.Players[1].PlanetCount != 1 {
		t.Errorf("public part: you %d, players %+v", v.You, v.Players)
	}
}

func TestAnotherPlayersCapitalIsHiddenOutsideVision(t *testing.T) {
	s := fixedMatch(t)

	if slices.Contains(planetIDs(s.View(lineContent(), 0)), "e") {
		t.Error("Seat 0 can see Seat 1's Capital e, two Lanes outside its vision")
	}

	// Seat 0 takes d, next to e: now e is in vision, flag and all.
	s.Planets["d"].Owner = 0
	v := s.View(lineContent(), 0)
	i := slices.Index(planetIDs(v), "e")
	if i < 0 || !v.Planets[i].Capital || v.Planets[i].Owner != 1 {
		t.Errorf("e next to an owned Planet should show its owner and Capital flag, view %+v", v.Planets)
	}
}
