package game

import (
	"slices"
	"strings"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// fixedMatch's line map a - b - c - d - e has 30 s Lanes and 3 s Rounds.
// Seat 0 holds a (10 Marines, 2 Warthogs), Seat 1 holds e. b has 6 Grunts.

func onlyBattle(t *testing.T, s *State) *Battle {
	t.Helper()
	if len(s.Battles) != 1 {
		t.Fatalf("%d Battles, want 1", len(s.Battles))
	}
	for _, b := range s.Battles {
		return b
	}
	return nil
}

func TestArrivingAtAGarrisonedPlanetStartsABattle(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)

	ev := s.Advance(c, 30_000)

	b := onlyBattle(t, s)
	if !s.Planets["b"].Locked || len(s.Armies) != 0 || b.Attacker != 0 || b.Defender != Neutral || b.Started != 30_000 {
		t.Fatalf("Battle %+v, b Locked %v, Armies %d", b, s.Planets["b"].Locked, len(s.Armies))
	}
	if len(ev.Started) != 1 || len(ev.Rounds) != 1 || ev.Rounds[0].Round != 0 {
		t.Errorf("events: %d started, rounds %+v; want the Battle and its first Round now", len(ev.Started), ev.Rounds)
	}
	if want := ResolveBattle(c, Force{Units: []UnitSlot{{Unit: "base:marine", Count: 10}}},
		Force{Units: []UnitSlot{{Unit: "base:grunt", Count: 6}}}, s.Seed+uint64(b.ID)); len(want.Rounds) != len(b.Result.Rounds) {
		t.Errorf("the Battle isn't seeded from the Match seed plus its id")
	}
	if used, _ := s.commandPoints(c, 0); used != 16 {
		t.Errorf("Command Points used = %d, want 16: attackers count until the Battle ends", used)
	}
}

func TestRoundsPlayOutOnePerRoundDuration(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	b := onlyBattle(t, s)
	n := len(b.Result.Rounds)
	if n < 2 {
		t.Fatalf("a %d-Round Battle is too short to test pacing", n)
	}

	if ev := s.Advance(c, 32_800); len(ev.Rounds) != 0 {
		t.Errorf("Round 2 came early")
	}
	if ev := s.Advance(c, 33_000); len(ev.Rounds) != 1 || ev.Rounds[0].Round != 1 {
		t.Errorf("Round 2 at 33 s: %+v", ev.Rounds)
	}
	end := int64(30_000 + 3_000*n)
	s.Advance(c, end-200)
	if len(s.Battles) != 1 {
		t.Fatal("the Battle ended before its last Round played out")
	}
	ev := s.Advance(c, end)
	if len(s.Battles) != 0 || len(ev.Ended) != 1 || s.Planets["b"].Locked {
		t.Errorf("at %d ms: Battles %d, ended %+v; want it over and b unlocked", end, len(s.Battles), ev.Ended)
	}
}

// fight runs the only Battle to its end and returns the end's events.
func fight(t *testing.T, s *State, c *cs.Content) Events {
	t.Helper()
	b := onlyBattle(t, s)
	return s.Advance(c, b.Started+int64(len(b.Result.Rounds))*b.RoundMs)
}

func TestAWinningAttackerCapturesAndMovesIn(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 1}}}
	s.Planets["b"].Buildings[0] = "base:barracks"
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)

	ev := fight(t, s, c)

	b := s.Planets["b"]
	if b.Owner != 0 || len(b.Stacks[0]) != 0 || b.Stacks[1][0].Unit != "base:marine" || b.Buildings[0] != "" {
		t.Errorf("b = %+v; want Seat 0's, its Marines in Stack 2, the Barracks destroyed", b)
	}
	if len(ev.Ended) != 1 || ev.Ended[0].Winner != 0 || len(ev.Captures) != 1 || len(s.Armies) != 0 {
		t.Errorf("ended %+v, captures %+v, Armies %d", ev.Ended, ev.Captures, len(s.Armies))
	}
}

func TestABeatenAttackerRetreatsToItsNearestPlanet(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	// One Round: the defender holds at the Round cap, and 10 Grunts can't get
	// through two Warthogs' Armor and HP in one Round, so both survive.
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.RoundCap = 1 })
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 10}}}
	a := s.Planets["a"]
	_ = s.OrderArmy(0, "a", []ArmyUnits{{0, "base:warthog", 2}}, "b", 0)
	s.Advance(c, 30_000)

	ev := fight(t, s, c)

	if len(ev.Ended) != 1 || ev.Ended[0].Winner != Neutral || s.Planets["b"].Owner != Neutral {
		t.Fatalf("ended %+v, want the neutral garrison to hold", ev.Ended)
	}
	if got := s.Planets["b"].Stacks[0][0]; got.Unit != "base:grunt" || got.Count > 10 {
		t.Errorf("b's garrison = %+v, want its surviving Grunts back", got)
	}
	r := onlyArmy(t, s)
	if !r.Retreating || r.From != "b" || r.To != "a" || r.Units[0] != (UnitSlot{Unit: "base:warthog", Count: 2}) {
		t.Fatalf("survivors %+v, want them Retreating from b to a", r)
	}
	if err := s.ReorderArmy(0, r.ID, "b", 0); err == nil || !strings.Contains(err.Error(), "Retreating") {
		t.Errorf("re-ordering a Retreat: err = %v", err)
	}
	s.Advance(c, r.Arrives)
	if len(s.Armies) != 0 || !slices.ContainsFunc(a.Stacks[0], func(u UnitSlot) bool { return u.Unit == "base:warthog" }) {
		t.Errorf("after the Retreat: Armies %d, a's Stack 1 %+v", len(s.Armies), a.Stacks[0])
	}
}

func TestARetreatRetargetsIfItsTargetFallsAndDiesWithNowhereToGo(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["c"].Owner = 0
	s.LastID++
	r := &Army{ID: s.LastID, Owner: 0, Units: Stack{{Unit: "base:marine", Count: 2}}, To: "d", Retreating: true}
	s.Armies = map[uint32]*Army{r.ID: r}
	s.retreat(r, 0) // d's nearest: c, one jump

	s.Planets["c"].Owner = 1 // c falls on the way
	s.Advance(c, 30_000)
	if r.From != "c" || r.To != "b" || !r.Retreating {
		t.Fatalf("Retreat = %+v, want it passing on from c toward a", r)
	}

	s.Planets["a"].Owner = 1 // Seat 0 now has nothing
	s.Advance(c, 60_000)
	if len(s.Armies) != 0 {
		t.Errorf("a Retreat with nowhere to go should be destroyed, got %+v", s.Armies)
	}
}

func TestRetreatRouteTieBreaks(t *testing.T) {
	s := &State{Lanes: map[string]map[string]int64{}, Planets: map[string]*Planet{}}
	lane := func(a, b string, ms int64) {
		for _, e := range [][2]string{{a, b}, {b, a}} {
			if s.Lanes[e[0]] == nil {
				s.Lanes[e[0]] = map[string]int64{}
			}
			s.Lanes[e[0]][e[1]] = ms
		}
	}
	own := func(ids ...string) {
		for _, id := range ids {
			s.Planets[id] = &Planet{ID: id, Owner: 0}
		}
	}
	for _, id := range []string{"x", "m", "n", "far", "y", "z"} {
		s.Planets[id] = &Planet{ID: id, Owner: 1}
	}
	lane("x", "m", 10_000)
	lane("m", "far", 10_000) // 2 jumps, 20 s
	lane("x", "y", 90_000)   // 1 jump, 90 s
	lane("x", "z", 90_000)   // 1 jump, 90 s
	own("far", "y", "z")

	if got := s.retreatRoute("x", 0); !slices.Equal(got, []string{"x", "y"}) {
		t.Errorf("route = %v, want [x y]: fewest jumps first, then the lowest id", got)
	}
	lane("x", "z", 60_000)
	if got := s.retreatRoute("x", 0); !slices.Equal(got, []string{"x", "z"}) {
		t.Errorf("route = %v, want [x z]: equal jumps go to the faster", got)
	}
}

func TestLaterArrivalsWaitThenResolveAgainstTheNewOwner(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 1}}}
	_ = s.OrderArmy(0, "a", marines(8), "b", 0)
	s.Advance(c, 200)
	_ = s.OrderArmy(0, "a", marines(2), "b", 2)
	s.Advance(c, 30_000)

	s.Advance(c, 30_200) // the second Army arrives at Locked b
	if second := onlyArmy(t, s); !second.Waiting || !s.Planets["b"].Locked {
		t.Fatalf("second Army %+v, want it waiting in orbit while b is Locked", second)
	}
	fight(t, s, c)
	s.Advance(c, s.Time+200)
	if len(s.Armies) != 0 || s.Planets["b"].Stacks[2][0].Count != 2 {
		t.Errorf("after the Battle: Armies %d, b's Stack 3 %+v; want the second Army landed at its new home",
			len(s.Armies), s.Planets["b"].Stacks[2])
	}
}

func TestTheLowerSeatAttacksWhenBothArriveTogether(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Owner, s.Planets["d"].Owner = 0, 1
	s.Planets["b"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	s.Planets["d"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	_ = s.OrderArmy(1, "d", marines(3), "c", 0)
	_ = s.OrderArmy(0, "b", marines(3), "c", 0)

	s.Advance(c, 30_000)

	if b := onlyBattle(t, s); b.Attacker != 0 || b.Planet != "c" {
		t.Errorf("Battle %+v, want Seat 0 attacking c", b)
	}
	if w := onlyArmy(t, s); w.Owner != 1 || !w.Waiting {
		t.Errorf("Army %+v, want Seat 1's waiting in orbit", w)
	}
}

func TestALockedPlanetStillPaysItsOwner(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["a"].Locked = true

	if paid := s.Advance(c, 90_000).Paydays; paid[0].Net["base:credits"] != 390 {
		t.Errorf("Payday net = %v, want a's income and Upkeep as usual", paid[0].Net)
	}
}

func TestDeadArmedBuildingsAreDestroyedEvenWhenTheDefenderHolds(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]
	a.Buildings[2] = "base:turret"
	b := &Battle{
		ID: 9, Planet: "a", Attacker: 1, Defender: 0, Origins: []Origin{{Stack: 0}, {Stack: -1, Slot: 2}},
		Result: BattleResult{
			Roster: []Combatant{
				{ID: "a0001", Side: Attacker, Unit: "base:marine"},
				{ID: "d0001", Side: Defender, Unit: "base:marine"},
				{ID: "d0002", Side: Defender, Unit: "base:turret"},
			},
			Winner: Defender, Survivors: []string{"d0001"},
		},
	}
	s.Battles = map[uint32]*Battle{9: b}
	a.Locked = true

	var ev Events
	s.endBattle(c, b, &ev)

	if a.Buildings[2] != "" || a.Stacks[0][0] != (UnitSlot{Unit: "base:marine", Count: 1}) || a.Locked {
		t.Errorf("a = %+v; want the Turret gone, 1 Marine left and the Lock lifted", a)
	}
	if !slices.Contains(ev.Ended[0].Viewers, 1) {
		t.Errorf("viewers %v, want the attacker told how it went", ev.Ended[0].Viewers)
	}
}

func TestOnlyTheTwoSidesSeeTheBattleAsItStandsAfterEachRound(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["c"].Owner = 1 // Seat 1 sees b too
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)

	v := s.View(c, 0)
	if len(v.Battles) != 1 || v.Battles[0].Round != 0 || v.Battles[0].Roster[0].HP != 100 {
		t.Fatalf("Seat 0 sees %+v, want its Battle before any Round completes", v.Battles)
	}
	if len(s.View(c, 1).Battles) != 0 {
		t.Error("Seat 1 can see a Battle it isn't a side of")
	}

	s.Advance(c, 33_000)
	after := s.View(c, 0).Battles[0]
	hurt := slices.ContainsFunc(after.Roster, func(cb Combatant) bool { return cb.Side == Defender && cb.HP < 70 })
	if after.Round != 1 || !hurt {
		t.Errorf("after Round 1: round %d, want 1 and some Grunt hurt", after.Round)
	}
}
