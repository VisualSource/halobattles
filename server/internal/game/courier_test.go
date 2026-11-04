package game

import (
	"maps"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// courierContent is researchContent with a transfer cost per Rarity.
func courierContent() *cs.Content {
	c := researchContent()
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) {
		r.TechTransferCost = map[string]map[string]int{
			"common":   {"base:credits": 100},
			"uncommon": {"base:credits": 200, "base:materials": 50},
		}
	})
	return c
}

// courierCase: Seat 0 holds Drill and Optics in the Lab in slot 2 of a, and
// has an empty Lab in slot 0 of c, two Lanes (60 s) away through neutral b.
func courierCase(t *testing.T) (*State, *cs.Content) {
	t.Helper()
	s, c := fixedMatch(t), courierContent()
	s.Players[0].Resources = map[string]int{"base:credits": 1000, "base:materials": 100}
	holdTech(s, "a", 2, "base:drill", "base:optics")
	s.Planets["c"].Owner = 0
	holdTech(s, "c", 0)
	return s, c
}

// sent sends Drill from a to c, and returns its Courier.
func sent(t *testing.T, s *State, c *cs.Content) *Army {
	t.Helper()
	if err := s.SendTech(c, 0, "base:drill", "c", 0); err != nil {
		t.Fatal(err)
	}
	return s.Armies[s.LastID]
}

func TestASentTechPaysAtOnceStopsCountingAndLandsAfterTheLanes(t *testing.T) {
	s, c := courierCase(t)
	a := sent(t, s, c)

	if got := s.Players[0].Resources; got["base:credits"] != 900 || got["base:materials"] != 100 {
		t.Errorf("Resources %v, want 100 Credits paid", got)
	}
	if !maps.Equal(s.heldTechs(c, 0), map[string]bool{"base:optics": true}) {
		t.Errorf("held %v while Drill travels", s.heldTechs(c, 0))
	}
	if len(a.Units) != 0 || a.To != "b" || a.Arrives != 30_000 {
		t.Errorf("Courier %+v, want no units on the Lane to b", a)
	}

	s.Advance(c, 59_000)
	if s.Armies[a.ID] == nil {
		t.Fatal("Courier gone early")
	}
	s.Advance(c, 60_000)
	if s.Armies[a.ID] != nil {
		t.Error("Courier still travelling after it landed")
	}
	if !slices.Equal(s.Planets["c"].Techs[0], []string{"base:drill"}) || slices.Contains(s.Planets["a"].Techs[2], "base:drill") {
		t.Errorf("Labs a %v, c %v after landing", s.Planets["a"].Techs, s.Planets["c"].Techs)
	}
	if !s.heldTechs(c, 0)["base:drill"] || len(s.Players[0].Saved) != 0 {
		t.Errorf("Drill not held after landing: saved %v", s.Players[0].Saved)
	}
}

func TestSendingIsRefusedWithoutAPaymentOrAMove(t *testing.T) {
	for name, tc := range map[string]struct {
		setup func(s *State, c *cs.Content)
		tech  string
		to    LabRef
	}{
		"a Tech not held":      {nil, "base:radar", LabRef{"c", 0}},
		"from a Locked Planet": {func(s *State, _ *cs.Content) { s.Planets["a"].Locked = true }, "base:drill", LabRef{"c", 0}},
		"to the same Lab":      {nil, "base:drill", LabRef{"a", 2}},
		"to no Lab":            {nil, "base:drill", LabRef{"c", 1}},
		"to another's Lab":     {func(s *State, _ *cs.Content) { s.Planets["c"].Owner = 1 }, "base:drill", LabRef{"c", 0}},
		"to a full Lab":        {func(s *State, _ *cs.Content) { s.Planets["c"].Techs[0] = []string{"base:radar", "base:sonar"} }, "base:drill", LabRef{"c", 0}},
		"to a Lab whose slots a Project and a Tech fill": {func(s *State, c *cs.Content) {
			s.Planets["c"].Techs[0] = []string{"base:radar"}
			deal(s, c, "base:sonar")
			if err := s.StartProject(c, 0, "base:sonar", "c", 0); err != nil {
				t.Fatal(err)
			}
		}, "base:drill", LabRef{"c", 0}},
		"without the Resources": {func(s *State, _ *cs.Content) { s.Players[0].Resources["base:credits"] = 99 }, "base:drill", LabRef{"c", 0}},
	} {
		t.Run(name, func(t *testing.T) {
			s, c := courierCase(t)
			if tc.setup != nil {
				tc.setup(s, c)
			}
			before := maps.Clone(s.Players[0].Resources)
			if err := s.SendTech(c, 0, tc.tech, tc.to.Planet, tc.to.Slot); err == nil {
				t.Error("sent")
			}
			if len(s.Armies) != 0 || !maps.Equal(s.Players[0].Resources, before) {
				t.Errorf("armies %v, Resources %v", s.Armies, s.Players[0].Resources)
			}
		})
	}
}

func TestACouriersRarityPicksItsCost(t *testing.T) {
	s, c := courierCase(t)
	if err := s.SendTech(c, 0, "base:optics", "c", 0); err != nil {
		t.Fatal(err)
	}
	if got := s.Players[0].Resources; got["base:credits"] != 800 || got["base:materials"] != 50 {
		t.Errorf("Resources %v, want 200 Credits and 50 Materials paid", got)
	}
}

func TestBothLabsKeepASlotReservedWhileItTravels(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["c"].Techs[0] = []string{"base:radar"} // one free, then taken by the Courier
	a := sent(t, s, c)
	deal(s, c, "base:sonar")
	for _, lab := range []LabRef{{"a", 2}, {"c", 0}} {
		if err := s.StartProject(c, 0, "base:sonar", lab.Planet, lab.Slot); err == nil {
			t.Errorf("Project started in %v, with its last slot reserved", lab)
		}
		if free, _ := s.freeSlots(c, 0, lab); free != 0 {
			t.Errorf("%v has %d free", lab, free)
		}
		if v := s.View(c, 0).Armies[0]; v.Home != (LabRef{"a", 2}) || v.Dest != (LabRef{"c", 0}) {
			t.Errorf("owner sees %+v", v)
		}
	}
	s.Advance(c, 60_000)
	if s.Armies[a.ID] != nil {
		t.Fatal("not landed")
	}
	if free, _ := s.freeSlots(c, 0, LabRef{"a", 2}); free != 1 {
		t.Errorf("the slot it left has %d free after landing, want 1", free)
	}
}

func TestATechInTransitIsNotOfferedAgain(t *testing.T) {
	s, c := courierCase(t)
	sent(t, s, c)
	s.Players[0].Hands = nil
	s.Advance(c, 1000)
	for f, hand := range s.Players[0].Hands {
		if slices.Contains(hand, "base:drill") {
			t.Errorf("hand for %s offers Drill: %v", f, hand)
		}
	}
	if len(s.Players[0].Saved) != 0 {
		t.Errorf("guaranteed cards %v while it travels", s.Players[0].Saved)
	}
	if slices.Contains(s.pool(c, 0, "base:industry", 9), "base:tactics") {
		t.Error("Tactics offered while the Drill it needs travels")
	}
}

func TestEffectsAndUnlocksStopInTransitButABattleKeepsItsOwn(t *testing.T) {
	s, c := withEffects(t, []cs.Effect{pct("hp", 50)})
	c.Techs["base:ta"] = cs.Tech{Name: "Armour", Rarity: "common", Effects: c.Techs["base:ta"].Effects,
		Unlocks: &cs.TechUnlocks{Buildings: []cs.ID{"base:air-pad"}}}
	s.Planets["c"].Owner = 0
	holdTech(s, "c", 0)
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:marine", Count: 1}}}
	s.Planets["d"].Owner = 1
	s.Planets["d"].Stacks = [StacksPerPlanet]Stack{}
	s.Planets["d"].Buildings[0] = "base:barracks"
	var ev Events
	army := &Army{ID: 900, Owner: 0, To: "d", Units: []UnitSlot{{Unit: "base:marine", Count: 1}}}
	s.startBattle(c, army, s.Planets["d"], &ev)
	b := onlyBattle(t, s)

	if err := s.SendTech(c, 0, "base:ta", "c", 0); err != nil {
		t.Fatal(err)
	}
	if got := s.boosts(c, 0); got != nil {
		t.Errorf("boosts %v in transit", got)
	}
	if err := s.mustUnlock(c, 0, "base:air-pad", false); err == nil {
		t.Error("unlocked in transit")
	}
	if got := b.Attack.Boosts["base:marine"].HP.Percent; got != 50 {
		t.Errorf("the Battle's boost is %d%%, want the 50%% it started with", got)
	}
	for at := int64(30_000); at <= 60_000; at += 30_000 {
		s.Advance(c, at)
	}
	if s.mustUnlock(c, 0, "base:air-pad", false) != nil || s.boosts(c, 0)["base:marine"].HP.Percent != 50 {
		t.Error("the Tech doesn't count again after landing")
	}
}

func TestReorderingACourierMovesItsReservationWithoutARefund(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["d"].Owner = 0
	holdTech(s, "d", 0)
	a := sent(t, s, c)

	s.Planets["d"].Techs[0] = []string{"base:radar", "base:sonar"}
	if err := s.ReorderCourier(c, 0, a.ID, "d", 0); err == nil {
		t.Error("re-ordered to a full Lab")
	}
	if err := s.ReorderCourier(c, 0, a.ID, "b", 0); err == nil {
		t.Error("re-ordered to no Lab")
	}
	if err := s.ReorderCourier(c, 1, a.ID, "c", 0); err == nil {
		t.Error("another player re-ordered it")
	}
	if err := s.ReorderArmy(0, a.ID, "c", 0); err == nil {
		t.Error("ReorderArmy took a Courier")
	}
	s.Planets["d"].Techs[0] = nil
	if err := s.ReorderCourier(c, 0, a.ID, "d", 0); err != nil {
		t.Fatal(err)
	}
	if free, _ := s.freeSlots(c, 0, LabRef{"c", 0}); free != 2 {
		t.Errorf("the old destination has %d free, want both", free)
	}
	if free, _ := s.freeSlots(c, 0, LabRef{"d", 0}); free != 1 {
		t.Errorf("the new one has %d free, want 1", free)
	}
	for at := int64(30_000); at <= 90_000; at += 30_000 {
		s.Advance(c, at)
	}
	if !slices.Equal(s.Planets["d"].Techs[0], []string{"base:drill"}) || s.Players[0].Resources["base:credits"] < 900 {
		t.Errorf("d holds %v, credits %d", s.Planets["d"].Techs[0], s.Players[0].Resources["base:credits"])
	}
}

func TestCallingACourierBackLandsItInTheLabItLeft(t *testing.T) {
	s, c := courierCase(t)
	a := sent(t, s, c)
	s.Advance(c, 10_000)
	if err := s.ReorderCourier(c, 0, a.ID, "a", 2); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 30_000) // finishes the hop to b, and only then turns back
	if a.To != "a" || a.From != "b" {
		t.Fatalf("Courier on %s to %s", a.From, a.To)
	}
	s.Advance(c, 60_000)
	if s.Armies[a.ID] != nil || !slices.Contains(s.Planets["a"].Techs[2], "base:drill") {
		t.Errorf("a holds %v", s.Planets["a"].Techs[2])
	}
	if got := s.Players[0].Resources["base:credits"]; got > 1000 || got < 900 {
		t.Errorf("credits %d", got)
	}
	if free, _ := s.freeSlots(c, 0, LabRef{"c", 0}); free != 2 {
		t.Errorf("c has %d free after the move was called off", free)
	}
}

func TestACourierWaitsInOrbitAtALockedPlanetAndGoesOn(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Locked = true
	a := sent(t, s, c)
	s.Advance(c, 30_000)
	if !a.Waiting || a.To != "b" {
		t.Fatalf("Courier %+v, want waiting at b", a)
	}
	s.Advance(c, 40_000)
	s.Planets["b"].Locked = false
	s.Advance(c, 41_000)
	if a.Waiting || a.To != "c" || a.Arrives != 71_000 {
		t.Errorf("Courier %+v, want on its way to c", a)
	}
}

func TestACourierWaitsAtItsLockedDestinationThenLands(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["c"].Locked = true
	a := sent(t, s, c)
	s.Advance(c, 60_000)
	s.Advance(c, 70_000)
	if !a.Waiting || len(s.Planets["c"].Techs[0]) != 0 {
		t.Fatalf("Courier %+v, c holds %v", a, s.Planets["c"].Techs)
	}
	s.Planets["c"].Locked = false
	s.Advance(c, 71_000)
	if s.Armies[a.ID] != nil || !slices.Equal(s.Planets["c"].Techs[0], []string{"base:drill"}) {
		t.Errorf("not landed: %v", s.Planets["c"].Techs)
	}
}

func TestACourierPassesATeammatesPlanet(t *testing.T) {
	s, c := teamMatch(t), courierContent()
	s.Players[0].Resources = map[string]int{"base:credits": 1000}
	holdTech(s, "a", 2, "base:drill")
	s.Planets["d"].Owner = 0
	holdTech(s, "d", 0)
	if err := s.SendTech(c, 0, "base:drill", "d", 0); err != nil {
		t.Fatal(err)
	}
	for at := int64(30_000); at <= 90_000; at += 30_000 {
		s.Advance(c, at)
	}
	if len(s.Armies) != 0 || !s.heldTechs(c, 0)["base:drill"] {
		t.Errorf("armies %v, c owner %d", s.Armies, s.Planets["c"].Owner)
	}
}

func wantDrillLost(t *testing.T, s *State) {
	t.Helper()
	if want := []Saved{{Tech: "base:drill", Lost: true}}; !slices.Equal(s.Players[0].Saved, want) {
		t.Errorf("guaranteed cards %v, want Drill lost", s.Players[0].Saved)
	}
	if len(s.Armies) != 0 {
		t.Errorf("armies %v", s.Armies)
	}
}

func wantDrillHome(t *testing.T, s *State, a *Army) {
	t.Helper()
	if s.Armies[a.ID] != nil || !slices.Contains(s.Planets["a"].Techs[2], "base:drill") {
		t.Errorf("Courier %+v, a holds %v", s.Armies[a.ID], s.Planets["a"].Techs[2])
	}
	if len(s.Players[0].Saved) != 0 {
		t.Errorf("guaranteed cards %v", s.Players[0].Saved)
	}
}

func TestACourierReachingAnEnemyPlanetIsDestroyedWithoutABattleOrACapture(t *testing.T) {
	s, c := courierCase(t)
	sent(t, s, c)
	b := s.Planets["b"]
	b.Owner, b.Stacks = 1, [StacksPerPlanet]Stack{} // became an enemy's, and empty
	ev := s.Advance(c, 30_000)
	wantDrillLost(t, s)
	if len(s.Battles) != 0 || len(ev.Captures) != 0 || b.Owner != 1 {
		t.Errorf("battles %d, captures %v, b owner %d", len(s.Battles), ev.Captures, b.Owner)
	}
}

func TestACourierWaitingWhileItsPlanetIsTakenIsDestroyed(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Locked = true
	sent(t, s, c)
	s.Advance(c, 30_000)
	s.Planets["b"].Owner, s.Planets["b"].Locked = 1, false
	s.Advance(c, 31_000)
	wantDrillLost(t, s)
}

func TestACourierInOrbitWhenItsDestinationIsCapturedTurnsBack(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["c"].Locked = true
	a := sent(t, s, c)
	s.Advance(c, 60_000)
	s.capture(s.Planets["c"], 1, &Events{})
	s.Advance(c, 61_000) // still Locked, but no longer yours: it leaves
	if a.Waiting || a.From != "c" || a.To != "b" {
		t.Fatalf("Courier %+v, want it leaving c for b", a)
	}
	s.Advance(c, 91_000)
	s.Advance(c, 121_000)
	wantDrillHome(t, s, a)
}

func TestACourierOnTheLastHopIntoACapturedDestinationGoesBack(t *testing.T) {
	s, c := courierCase(t) // Drill in a; the only Lane to b is the last hop
	s.Planets["b"].Owner = 0
	holdTech(s, "b", 0)
	if err := s.SendTech(c, 0, "base:drill", "b", 0); err != nil {
		t.Fatal(err)
	}
	a := s.Armies[s.LastID]
	s.Advance(c, 10_000)
	s.capture(s.Planets["b"], 1, &Events{})
	s.Advance(c, 11_000)
	s.Advance(c, 30_000) // finishes the hop, unharmed
	if s.Armies[a.ID] == nil || a.From != "b" || a.To != "a" || a.Arrives != 60_000 {
		t.Fatalf("Courier %+v, want it on its way back to a", a)
	}
	s.Advance(c, 60_000)
	wantDrillHome(t, s, a)
}

func TestACourierReorderedOnTheLastHopIntoACapturedDestinationStillGetsThrough(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Owner = 0
	holdTech(s, "b", 0)
	if err := s.SendTech(c, 0, "base:drill", "b", 0); err != nil {
		t.Fatal(err)
	}
	a := s.Armies[s.LastID]
	s.Advance(c, 10_000)
	s.capture(s.Planets["b"], 1, &Events{})
	s.Advance(c, 11_000)
	if err := s.ReorderCourier(c, 0, a.ID, "c", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 30_000)
	s.Advance(c, 60_000)
	if s.Armies[a.ID] != nil || !slices.Equal(s.Planets["c"].Techs[0], []string{"base:drill"}) {
		t.Errorf("Courier %+v, c holds %v", s.Armies[a.ID], s.Planets["c"].Techs[0])
	}
}

func TestCallingACourierBackTheTickItsDestinationIsCapturedStillGetsItHome(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Owner = 0
	holdTech(s, "b", 0)
	if err := s.SendTech(c, 0, "base:drill", "b", 0); err != nil {
		t.Fatal(err)
	}
	a := s.Armies[s.LastID]
	s.Advance(c, 10_000)
	s.capture(s.Planets["b"], 1, &Events{})
	if err := s.ReorderCourier(c, 0, a.ID, "a", 2); err != nil { // before the next tick
		t.Fatal(err)
	}
	s.Advance(c, 30_000)
	s.Advance(c, 60_000)
	wantDrillHome(t, s, a)
}

func TestACourierIsRefusedARouteThroughAnEnemyPlanet(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Owner = 1
	before := s.Players[0].Resources["base:credits"]
	if err := s.SendTech(c, 0, "base:drill", "c", 0); err == nil {
		t.Fatal("sent through an enemy Planet")
	}
	if got := s.Players[0].Resources["base:credits"]; got != before || len(s.Armies) != 0 {
		t.Errorf("Credits %d, want %d; Armies %v", got, before, s.Armies)
	}

	s.Planets["b"].Owner = Neutral
	a := sent(t, s, c)
	s.Advance(c, 31_000) // on its way from b to c
	s.Planets["b"].Owner = 1
	if err := s.ReorderCourier(c, 0, a.ID, "a", 2); err == nil {
		t.Error("re-ordered back through an enemy Planet")
	}
	if a.Courier.Dest != (LabRef{"c", 0}) {
		t.Errorf("Dest %+v, want it still c", a.Courier.Dest)
	}
}

func TestACourierOnTheLastHopHomeWhenItsCapturedLosesTheTech(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["a"].Techs[2] = []string{"base:drill"}
	s.Planets["b"].Owner = 0
	holdTech(s, "b", 0)
	if err := s.SendTech(c, 0, "base:drill", "b", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 10_000)
	s.capture(s.Planets["b"], 1, &Events{})
	s.Advance(c, 11_000)
	s.Advance(c, 30_000)
	s.capture(s.Planets["a"], 1, &Events{}) // the Lab it left
	wantDrillLost(t, s)
}

func TestAnEnemyPlanetPassedOnTheWayBackIsStillFatal(t *testing.T) {
	s, c := courierCase(t)
	sent(t, s, c)
	s.Advance(c, 30_000) // on the Lane b to c
	s.capture(s.Planets["c"], 1, &Events{})
	s.Advance(c, 31_000)
	s.Planets["b"].Owner = 1
	s.Advance(c, 60_000) // reaches c, turns for b
	s.Advance(c, 90_000)
	wantDrillLost(t, s)
}

func TestATurnedBackCourierWaitsOutItsLockedPlanet(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Locked = true
	a := sent(t, s, c)
	s.Advance(c, 30_000)
	if err := s.SellBuilding(c, 0, "c", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 31_000)
	if !a.Waiting || a.To != "b" {
		t.Fatalf("Courier %+v, want it still waiting at b", a)
	}
	s.Planets["b"].Locked = false
	s.Advance(c, 32_000)
	if a.Waiting || a.To != "a" {
		t.Errorf("Courier %+v, want it gone for a", a)
	}
}

func TestACourierNeverTakesAnEmptyNeutralPlanetOrAStack(t *testing.T) {
	s, c := courierCase(t)
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{}
	s.Planets["c"].Stacks = [StacksPerPlanet]Stack{}
	sent(t, s, c)
	s.Advance(c, 60_000)
	if s.Planets["b"].Owner != Neutral || !s.Planets["c"].empty() {
		t.Errorf("b owner %d, c stacks %v", s.Planets["b"].Owner, s.Planets["c"].Stacks)
	}
}

func TestACourierTurnsBackWhenItsDestinationIsLost(t *testing.T) {
	for name, lose := range map[string]func(s *State, c *cs.Content){
		"sold": func(s *State, c *cs.Content) {
			if err := s.SellBuilding(c, 0, "c", 0); err != nil {
				t.Fatal(err)
			}
		},
		"captured": func(s *State, c *cs.Content) { s.capture(s.Planets["c"], 1, &Events{}) },
	} {
		t.Run(name, func(t *testing.T) {
			s, c := courierCase(t)
			a := sent(t, s, c)
			s.Advance(c, 10_000)
			lose(s, c)
			s.Advance(c, 11_000)
			if a.To != "b" || len(a.Path) != 1 || a.Path[0] != "a" {
				t.Fatalf("Courier %+v, want it to finish its hop and head for a", a)
			}
			s.Advance(c, 30_000)
			s.Advance(c, 60_000)
			if s.Armies[a.ID] != nil || !slices.Contains(s.Planets["a"].Techs[2], "base:drill") {
				t.Errorf("a holds %v", s.Planets["a"].Techs[2])
			}
			if len(s.Players[0].Saved) != 0 {
				t.Errorf("guaranteed cards %v", s.Players[0].Saved)
			}
		})
	}
}

func TestLosingBothLabsLosesTheTechWhicheverGoesFirst(t *testing.T) {
	for name, order := range map[string][]LabRef{
		"destination first": {{"c", 0}, {"a", 2}},
		"origin first":      {{"a", 2}, {"c", 0}},
	} {
		t.Run(name, func(t *testing.T) {
			s, c := courierCase(t)
			s.Planets["a"].Techs[2] = []string{"base:drill"}
			sent(t, s, c)
			for _, lab := range order {
				if err := s.SellBuilding(c, 0, lab.Planet, lab.Slot); err != nil {
					t.Fatal(err)
				}
			}
			wantDrillLost(t, s)
		})
	}
}

func TestOnlyTheOriginLostTheCourierStillLands(t *testing.T) {
	s, c := courierCase(t)
	a := sent(t, s, c)
	if err := s.SellBuilding(c, 0, "a", 2); err != nil {
		t.Fatal(err)
	}
	if want := []Saved{{Tech: "base:optics", Lost: true}}; !slices.Equal(s.Players[0].Saved, want) {
		t.Errorf("guaranteed cards %v, want only the Tech still in the Lab", s.Players[0].Saved)
	}
	if v := s.View(c, 0).Armies[0]; v.Home.Planet != "" {
		t.Errorf("Home %+v after it's lost", v.Home)
	}
	// A new Lab in the slot isn't the one it left.
	holdTech(s, "a", 2)
	if free, _ := s.freeSlots(c, 0, LabRef{"a", 2}); free != 2 {
		t.Errorf("a new Lab has %d free: it inherited the reservation", free)
	}
	if err := s.ReorderCourier(c, 0, a.ID, "a", 2); err != nil {
		t.Errorf("a new Lab with room is a normal destination: %v", err)
	}
	if err := s.ReorderCourier(c, 0, a.ID, "c", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 60_000)
	if !slices.Equal(s.Planets["c"].Techs[0], []string{"base:drill"}) {
		t.Errorf("c holds %v", s.Planets["c"].Techs[0])
	}
}

func TestLostCouriersComeBackInIDOrder(t *testing.T) {
	s, c := courierCase(t)
	if err := s.SendTech(c, 0, "base:drill", "c", 0); err != nil {
		t.Fatal(err)
	}
	if err := s.SendTech(c, 0, "base:optics", "c", 0); err != nil {
		t.Fatal(err)
	}
	s.SellBuilding(c, 0, "a", 2)
	s.SellBuilding(c, 0, "c", 0)
	want := []Saved{{Tech: "base:drill", Lost: true}, {Tech: "base:optics", Lost: true}}
	if !slices.Equal(s.Players[0].Saved, want) {
		t.Errorf("guaranteed cards %v, want %v", s.Players[0].Saved, want)
	}
}

func TestEliminationTakesCouriersAndTheirTechs(t *testing.T) {
	s, c := courierCase(t)
	sent(t, s, c)
	s.Forfeit(0)
	s.Advance(c, 1000)
	if len(s.Armies) != 0 || len(s.Players[0].Saved) != 0 {
		t.Errorf("armies %v, cards %v", s.Armies, s.Players[0].Saved)
	}
	s, c = courierCase(t)
	sent(t, s, c)
	s.capture(s.Planets["a"], 1, &Events{}) // the Capital: Home is lost, then its owner
	if len(s.Armies) != 0 {
		t.Errorf("armies %v after the Capital fell", s.Armies)
	}
}

func TestACouriersTechIsSeenInVisionAndNotItsDestination(t *testing.T) {
	s, c := courierCase(t)
	a := sent(t, s, c)
	if got := s.View(c, 1).Armies; len(got) != 0 {
		t.Errorf("out of Vision, Seat 1 sees %+v", got)
	}
	s.Planets["d"].Owner = 1 // c and d are in its Vision now
	s.Advance(c, 30_000)     // on the Lane b to c
	got := s.View(c, 1).Armies
	if len(got) != 1 || got[0].Tech != "base:drill" || got[0].ID != a.ID || len(got[0].Units) != 0 {
		t.Fatalf("Seat 1 sees %+v", got)
	}
	if got[0].Destination != "" || got[0].Dest != (LabRef{}) || got[0].Home != (LabRef{}) {
		t.Errorf("Seat 1 sees where it's going: %+v", got[0])
	}
	own := s.View(c, 0)
	for _, p := range own.Planets {
		if slices.Contains(p.Labs[2], "base:drill") {
			t.Error("the Lab still shows the Tech in transit")
		}
	}
}

func TestAMoveBetweenLabsOnOnePlanetLandsNextTick(t *testing.T) {
	s, c := courierCase(t)
	holdTech(s, "a", 3)
	if err := s.SendTech(c, 0, "base:drill", "a", 3); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 200)
	if len(s.Armies) != 0 || !slices.Equal(s.Planets["a"].Techs[3], []string{"base:drill"}) {
		t.Errorf("armies %v, Labs %v", s.Armies, s.Planets["a"].Techs)
	}
}

func TestARaidOrderToACourierNamesTheCourier(t *testing.T) {
	s, c := courierCase(t)
	a := sent(t, s, c)
	if err := s.ReorderRaid(c, 0, a.ID, "a", 0); err == nil || err.Error() != "a Courier goes to a Lab" {
		t.Errorf("err %v", err)
	}
}
