package game

import (
	"slices"
	"strings"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// The line map a - b - c - d - e has 30 s Lanes. In fixedMatch, Seat 0 holds
// a with 10 Marines and 2 Warthogs in Stack 1, and Seat 1 holds e. b has 6
// Grunts, c 4 ODSTs, and d is empty.

func marines(n int) []ArmyUnits { return []ArmyUnits{{Stack: 0, Unit: "base:marine", Count: n}} }

func onlyArmy(t *testing.T, s *State) *Army {
	t.Helper()
	if len(s.Armies) != 1 {
		t.Fatalf("%d Armies, want 1", len(s.Armies))
	}
	for _, a := range s.Armies {
		return a
	}
	return nil
}

func TestAnArmyCapturesAnEmptyNeutralPlanet(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{}

	if err := s.OrderArmy(0, "a", marines(4), "b", 1); err != nil {
		t.Fatal(err)
	}
	if got := s.Planets["a"].Stacks[0][0].Count; got != 6 {
		t.Errorf("a has %d Marines left, want 6", got)
	}
	if used, _ := s.commandPoints(c, 0); used != 16 {
		t.Errorf("Command Points used = %d, want 16: an Army's units still count", used)
	}
	if a := onlyArmy(t, s); a.From != "a" || a.To != "b" || a.Arrives != 30_000 {
		t.Fatalf("Army = %+v, want a to b arriving at 30 s", a)
	}

	s.Advance(c, 29_800)
	if s.Planets["b"].Owner == 0 || len(s.Armies) != 1 {
		t.Fatal("arrived early")
	}
	ev := s.Advance(c, 30_000)

	b := s.Planets["b"]
	if b.Owner != 0 || b.Stacks[1][0] != (UnitSlot{Unit: "base:marine", Count: 4}) || len(s.Armies) != 0 {
		t.Errorf("b = %+v, Armies %d; want it captured with 4 Marines in Stack 2", b, len(s.Armies))
	}
	want := PlanetCaptured{Planet: "b", From: Neutral, To: 0, Viewers: []int{0}}
	if len(ev.Captures) != 1 || ev.Captures[0].Planet != want.Planet || ev.Captures[0].From != Neutral ||
		!slices.Equal(ev.Captures[0].Viewers, want.Viewers) {
		t.Errorf("captures = %+v, want %+v", ev.Captures, want)
	}
}

func TestAnArmyHopsOnThroughItsOwnersPlanets(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Owner = 0
	if err := s.OrderArmy(0, "a", marines(1), "c", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 30_200)
	if a := onlyArmy(t, s); a.From != "b" || a.To != "c" || a.Departed != 30_000 || a.Arrives != 60_000 {
		t.Errorf("Army = %+v, want it on b to c from 30 s, without drifting to the tick", a)
	}
}

func TestOrderArmyRejections(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(s *State)
		units   []ArmyUnits
		to      string
		toStack int
		want    string
	}{
		{"too many", nil, marines(11), "b", 0, "doesn't have"},
		{"none", nil, nil, "b", 0, "pick some units"},
		{"no such Stack", nil, []ArmyUnits{{Stack: 3, Unit: "base:marine", Count: 1}}, "b", 0, "pick units"},
		{"no such toStack", nil, marines(1), "b", 3, "no Stack 4"},
		{"to itself", nil, marines(1), "a", 0, "no route"},
		{"Locked", func(s *State) { s.Planets["a"].Locked = true }, marines(1), "b", 0, "Locked"},
		{"the same units twice", nil, []ArmyUnits{{0, "base:marine", 6}, {0, "base:marine", 6}}, "b", 0, "doesn't have"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := fixedMatch(t)
			if tc.setup != nil {
				tc.setup(s)
			}
			err := s.OrderArmy(0, "a", tc.units, tc.to, tc.toStack)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want %q", err, tc.want)
			}
			if len(s.Armies) != 0 || s.Planets["a"].Stacks[0][0].Count != 10 {
				t.Error("a rejected order still took units")
			}
		})
	}
}

func TestAnArmyArrivingHomeMergesOrWaitsForRoom(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	b := s.Planets["b"]
	b.Owner = 0
	b.Stacks = [StacksPerPlanet]Stack{}
	for i := range b.Stacks {
		fill(&b.Stacks[i], 10)
	}
	_ = s.OrderArmy(0, "a", marines(4), "b", 2)

	s.Advance(c, 30_000)
	if a := onlyArmy(t, s); !a.Waiting {
		t.Fatalf("Army = %+v, want it waiting in orbit with no room", a)
	}

	b.Stacks[0] = b.Stacks[0][:9]
	s.Advance(c, 30_200)
	if len(s.Armies) != 0 || b.Stacks[0][9] != (UnitSlot{Unit: "base:marine", Count: 4, Cell: 9}) {
		t.Errorf("after making room: Armies %d, Stack 1 %+v", len(s.Armies), b.Stacks[0])
	}
}

func TestReorderFinishesTheCurrentHopFirst(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Owner = 0
	_ = s.OrderArmy(0, "a", marines(4), "c", 0)
	a := onlyArmy(t, s)

	s.Advance(c, 10_000)
	if err := s.ReorderArmy(0, a.ID, "a", 1); err != nil {
		t.Fatal(err)
	}
	if a.To != "b" || a.Arrives != 30_000 {
		t.Fatalf("Army turned back mid-Lane: %+v", a)
	}
	s.Advance(c, 30_000)
	if a.From != "b" || a.To != "a" || a.Arrives != 60_000 {
		t.Fatalf("Army = %+v, want it heading back from b", a)
	}
	s.Advance(c, 60_000)
	if len(s.Armies) != 0 || s.Planets["a"].Stacks[1][0].Count != 4 {
		t.Errorf("Army didn't land in a's Stack 2: %+v", s.Planets["a"].Stacks)
	}
}

func TestReorderMidLaneIntoAnEnemyPlanetMustStopThere(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Owner = 1
	_ = s.OrderArmy(0, "a", marines(4), "b", 0)
	a := onlyArmy(t, s)

	if err := s.ReorderArmy(0, a.ID, "a", 0); err == nil {
		t.Error("an Army entering enemy b was re-routed beyond it")
	}

	s.Planets["b"].Locked = true // as if another Battle were on
	s.Advance(c, 30_000)         // waiting in orbit at b
	if err := s.ReorderArmy(0, a.ID, "a", 0); err != nil {
		t.Fatalf("a waiting Army should be able to leave: %v", err)
	}
	if a.Waiting || a.From != "b" || a.To != "a" || a.Departed != 30_000 {
		t.Errorf("Army = %+v, want it leaving b now", a)
	}
	if err := s.ReorderArmy(1, a.ID, "a", 0); err == nil {
		t.Error("Seat 1 re-ordered Seat 0's Army")
	}
}

// In the line map, b and c are garrisoned neutral Planets, d an empty one,
// and every Lane takes 30 s.

func TestArmiesPassStraightThroughNeutralPlanets(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	if err := s.OrderArmy(0, "a", marines(4), "d", 0); err != nil {
		t.Fatal(err)
	}
	a := onlyArmy(t, s)

	s.Advance(c, 30_000) // through garrisoned b
	if len(s.Battles) != 0 || a.Waiting || a.To != "c" || s.Planets["b"].Owner != Neutral {
		t.Fatalf("at b: Army %+v, %d Battles; want it passing through", a, len(s.Battles))
	}
	if err := s.ReorderArmy(0, a.ID, "d", 0); err != nil {
		t.Errorf("mid-Lane into neutral c, a re-order can still go beyond it: %v", err)
	}

	s.Advance(c, 90_000) // through c to empty d, which it takes
	if len(s.Battles) != 0 || len(s.Armies) != 0 || s.Planets["d"].Owner != 0 {
		t.Errorf("at d: %d Battles, %d Armies, d's owner %d; want d captured", len(s.Battles), len(s.Armies), s.Planets["d"].Owner)
	}
}

func TestALockedPlanetOnTheWayIsWaitedOut(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	b := s.Planets["b"]
	b.Locked = true // as if another Battle were on
	_ = s.OrderArmy(0, "a", marines(4), "d", 0)
	a := onlyArmy(t, s)

	s.Advance(c, 30_000)
	if !a.Waiting || a.To != "b" || !slices.Equal(a.Path, []string{"c", "d"}) {
		t.Fatalf("Army = %+v, want it in orbit at b, keeping its route", a)
	}
	b.Locked = false
	s.Advance(c, 30_200)
	if a.Waiting || a.From != "b" || a.To != "c" || a.Departed != 30_200 {
		t.Errorf("Army = %+v, want it going on to c once the Battle is over", a)
	}
}

func TestAPlanetOnTheWayTakenByAnEnemyEndsTheMoveInABattle(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	b := s.Planets["b"]
	b.Locked = true
	_ = s.OrderArmy(0, "a", marines(4), "d", 0)
	s.Advance(c, 30_000) // waiting in orbit at b

	b.Owner, b.Locked = 1, false // Seat 1 won the Battle there
	ev := s.Advance(c, 30_200)
	if len(ev.Started) != 1 || ev.Started[0].Planet != "b" {
		t.Errorf("Battles started %+v, want one at b", ev.Started)
	}
}

func TestTheLowerSeatTakesAPlanetBothReachTogether(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["c"].Owner = 0
	s.Planets["c"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	s.Planets["e"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	if err := s.OrderArmy(1, "e", marines(3), "d", 0); err != nil {
		t.Fatal(err)
	}
	if err := s.OrderArmy(0, "c", marines(3), "d", 0); err != nil {
		t.Fatal(err)
	}

	s.Advance(c, 30_000)

	if d := s.Planets["d"]; d.Owner != 0 {
		t.Fatalf("d's owner = %d, want Seat 0", d.Owner)
	}
	for _, a := range s.Armies {
		if a.Owner != 1 || !a.Waiting {
			t.Errorf("Army %+v, want only Seat 1's, waiting at d", a)
		}
	}
}

func TestHostileArmiesPassOnALane(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["c"].Owner, s.Planets["d"].Owner = 0, 1
	s.Planets["c"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	s.Planets["d"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	_ = s.OrderArmy(0, "c", marines(3), "d", 0)
	_ = s.OrderArmy(1, "d", marines(3), "c", 0)

	s.Advance(c, 29_800)
	if len(s.Armies) != 2 || len(s.Battles) != 0 {
		t.Fatalf("%d Armies and %d Battles mid-Lane, want both Armies and no Battle", len(s.Armies), len(s.Battles))
	}

	// Each found the other's Planet empty: a Battle with no defenders.
	ev := s.Advance(c, 30_000)
	got := []string{}
	for _, e := range ev.Ended {
		got = append(got, e.Planet)
	}
	slices.Sort(got)
	if !slices.Equal(got, []string{"c", "d"}) || s.Planets["c"].Owner != 1 || s.Planets["d"].Owner != 0 {
		t.Errorf("Battles ended at %v; c is Seat %d's, d is Seat %d's; want a Battle at each end and the Planets swapped",
			got, s.Planets["c"].Owner, s.Planets["d"].Owner)
	}
}

func TestCaptureCancelsTheLosersQueuesAndDestroysTheirBuildings(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.QueueBuilding(c, 0, "a", 2, "base:barracks")
	_ = s.QueueUnit(c, 0, "a", 0, "base:marine", 2)
	credits := s.Players[0].Resources["base:credits"]
	a := s.Planets["a"]
	a.Stacks = [StacksPerPlanet]Stack{}

	var ev Events
	s.capture(a, 1, &ev)

	if a.Owner != 1 || len(a.Queue) != 0 || len(a.UnitQueues) != 0 || slices.ContainsFunc(a.Buildings, func(b string) bool { return b != "" }) {
		t.Errorf("a = %+v, want Seat 1's with no queues or buildings", a)
	}
	if used, _ := s.commandPoints(c, 0); used != 0 || s.Players[0].Resources["base:credits"] != credits {
		t.Errorf("Seat 0: %d Command Points used, Credits %d; want 0 and no refund", used, s.Players[0].Resources["base:credits"])
	}
	if !slices.Contains(ev.Captures[0].Viewers, 0) {
		t.Errorf("viewers %v, want the previous owner to hear of it", ev.Captures[0].Viewers)
	}
}

func TestOthersSeeOnlyTheCurrentHopOfArmiesInVision(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["d"].Owner = 1
	s.Planets["e"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	_ = s.OrderArmy(1, "e", marines(3), "c", 0)

	if v := s.View(c, 0); len(v.Armies) != 0 {
		t.Fatalf("Seat 0 sees %+v on e to d, which is outside its vision", v.Armies)
	}
	s.Planets["c"].Owner = 0 // d is now in vision
	v := s.View(c, 0)
	if len(v.Armies) != 1 || v.Armies[0].To != "d" || v.Armies[0].Destination != "" {
		t.Errorf("Seat 0 sees %+v, want the e-to-d hop and no destination", v.Armies)
	}
	if own := s.View(c, 1).Armies; len(own) != 1 || own[0].Destination != "c" {
		t.Errorf("Seat 1 sees its own Army as %+v, want destination c", own)
	}
}

func TestArmiesSightThePlanetsTheyReach(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ArmyVisionSeconds = 15 })
	s.Planets["c"].Stacks = [StacksPerPlanet]Stack{} // empty: passed straight through
	if s.sees(0, "c") || s.sees(0, "d") {
		t.Fatal("c and d start out of Seat 0's vision")
	}
	s.Planets["d"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 6}}}
	_ = s.OrderArmy(0, "a", marines(4), "d", 0)

	s.Advance(c, 60_000) // passing through c
	s.Advance(c, 70_000) // on the Lane to d
	if !s.sees(0, "c") || s.sees(0, "d") {
		t.Errorf("10 s after passing c: sees c %v, d %v; want c only, not its neighbours", s.sees(0, "c"), s.sees(0, "d"))
	}
	s.Advance(c, 76_000)
	if s.sees(0, "c") {
		t.Error("c is still seen 16 s after the Army left it")
	}
	s.Advance(c, 90_000) // attacking d
	if len(s.Battles) != 1 || !s.sees(0, "d") {
		t.Errorf("attacking d: %d Battles, sees d %v; want it seen", len(s.Battles), s.sees(0, "d"))
	}
}

func TestRetreatingArmiesSightNothing(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.ArmyVisionSeconds = 15 })
	s.LastID++
	s.Armies = map[uint32]*Army{s.LastID: {
		ID: s.LastID, Owner: 0, Units: Stack{{Unit: "base:marine", Count: 1}},
		From: "d", To: "c", Arrives: 30_000, Path: []string{"b", "a"}, Retreating: true,
	}}

	s.Advance(c, 30_000) // through c on the way home
	if s.sees(0, "c") {
		t.Error("a Retreating Army sighted c")
	}
}
