package game

import (
	"slices"
	"strings"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// fixedMatch's line map a - b - c - d - e has 30 s Lanes. Seat 0 holds a
// (10 Marines, 2 Warthogs), Seat 1 holds e. b has 6 Grunts.

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
	if !s.Planets["b"].Locked || len(s.Armies) != 0 || b.Attacker != 0 || b.Defender != Neutral || b.Started != 60_000 {
		t.Fatalf("Battle %+v, b Locked %v, Armies %d", b, s.Planets["b"].Locked, len(s.Armies))
	}
	if len(ev.Started) != 1 || b.Sim.Tick != 0 {
		t.Errorf("events: %d started, sim at tick %d; want the Battle, not yet stepped", len(ev.Started), b.Sim.Tick)
	}
	if b.Sim.Field != s.Fields["b"] || len(b.Sim.Squads) != 2 {
		t.Errorf("want b's cached Battlefield and 2 squads, got %d squads", len(b.Sim.Squads))
	}
	if used, _ := s.commandPoints(c, 0); used != 16 {
		t.Errorf("Command Points used = %d, want 16: attackers count until the Battle ends", used)
	}
}

func TestTheSimWaitsOutTheStartDelayThenStepsOncePerTick(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000) // arrives; the fighting starts 30 s later
	b := onlyBattle(t, s)

	s.Advance(c, 60_199)
	if b.Sim.Tick != 0 {
		t.Errorf("stepped early: tick %d", b.Sim.Tick)
	}
	s.Advance(c, 61_000) // a second in: five ticks, caught up at once
	if b.Sim.Tick != 5 {
		t.Errorf("tick %d after 1 s, want 5", b.Sim.Tick)
	}
}

func TestEachPlanetKeepsItsBattlefield(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	if s.field(c, "b") != s.field(c, "b") || s.field(c, "b").String() == s.field(c, "d").String() {
		t.Error("want one Battlefield per Planet, cached, and different Planets different")
	}
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
	// A 1 s cap: the defender holds before anyone is in range, so both survive.
	c.Rulesets[RulesetID] = withRuleset(c, func(r *cs.Ruleset) { r.Battle.TimeCap = 1 })
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{{{Unit: "base:grunt", Count: 10, Cell: 4}}} // survivors keep cell 4
	a := s.Planets["a"]
	_ = s.OrderArmy(0, "a", []ArmyUnits{{0, "base:warthog", 2}}, "b", 0)
	s.Advance(c, 30_000)

	ev := fight(t, s, c)

	if len(ev.Ended) != 1 || ev.Ended[0].Winner != Neutral || s.Planets["b"].Owner != Neutral {
		t.Fatalf("ended %+v, want the neutral garrison to hold", ev.Ended)
	}
	if got := s.Planets["b"].Stacks[0][0]; got != (UnitSlot{Unit: "base:grunt", Count: 10, Cell: 4}) {
		t.Errorf("b's garrison = %+v, want its 10 Grunts back in cell 4", got)
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

func TestDeadBuildingsAreDestroyedEvenWhenTheDefenderHolds(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	a := s.Planets["a"]
	s.LastID++
	army := &Army{ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:marine", Count: 1}}, To: "a"}
	s.Armies = map[uint32]*Army{army.ID: army}
	var ev Events
	s.startBattle(c, army, a, &ev)
	b := onlyBattle(t, s)
	for _, sq := range b.Sim.Squads {
		if sq.Building && sq.Slot == 0 || sq.Side == battle.Attacker {
			sq.Members = nil // the Barracks and the attacker are dead
		}
	}
	b.Sim.Over, b.Sim.Winner = true, battle.Defender

	s.endBattle(c, b, &ev)

	if a.Buildings[0] != "" || a.Buildings[1] != "base:supply-pad" || a.Locked || a.Owner != 0 {
		t.Errorf("a = %+v; want the Barracks gone, the Supply Pad kept and the Lock lifted", a)
	}
	if n := a.Stacks[0][0].Count + a.Stacks[0][1].Count; n != 12 {
		t.Errorf("a's Stack 1 = %+v, want all 12 defenders back", a.Stacks[0])
	}
	if !slices.Contains(ev.Ended[0].Viewers, 1) {
		t.Errorf("viewers %v, want the attacker told how it went", ev.Ended[0].Viewers)
	}
}

func TestOnlyTheTwoSidesSeeTheBattle(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["c"].Owner = 1 // Seat 1 sees b too
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)

	v := s.View(c, 0)
	if len(v.Battles) != 1 || v.Battles[0].Tick != 0 || v.Battles[0].Field == nil || len(v.Battles[0].Points) != 3 {
		t.Fatalf("Seat 0 sees %+v, want its Battle at tick 0 with its Battlefield and points", v.Battles)
	}
	if !slices.ContainsFunc(v.Battles[0].Squads, func(sq battle.SquadView) bool { return sq.Unit == "base:marine" && sq.Count == 10 }) {
		t.Errorf("squads %+v, want Seat 0's own Marines", v.Battles[0].Squads)
	}
	if len(s.View(c, 1).Battles) != 0 {
		t.Error("Seat 1 can see a Battle it isn't a side of")
	}

	s.Advance(c, 61_000)
	if got := s.View(c, 0).Battles[0].Tick; got != 5 {
		t.Errorf("tick %d after 1 s, want 5", got)
	}
}

func TestAnAttackerCanRetreatAndItsSurvivorsHeadHome(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)

	if err := s.RetreatFromBattle(1, "b", false); err == nil {
		t.Error("Seat 1 Retreated from a Battle it isn't in")
	}
	if err := s.RetreatFromBattle(0, "b", true); err == nil {
		t.Error("called off a Retreat that wasn't ordered")
	}
	if err := s.RetreatFromBattle(0, "b", false); err != nil {
		t.Fatal(err)
	}
	if err := s.RetreatFromBattle(0, "b", false); err == nil || !strings.Contains(err.Error(), "already") {
		t.Errorf("a second Retreat: err = %v", err)
	}

	ev := fight(t, s, c)

	if ev.Ended[0].Winner != Neutral || s.Planets["b"].Owner != Neutral {
		t.Fatalf("ended %+v, want the garrison to hold", ev.Ended)
	}
	r := onlyArmy(t, s)
	if !r.Retreating || r.To != "a" || r.Units[0].Unit != "base:marine" {
		t.Errorf("survivors %+v, want the Marines Retreating to a", r)
	}
}

func TestADefenderNeedsAPlanetToRetreatTo(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Planets["b"].Owner = 0
	s.LastID++
	army := &Army{ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:marine", Count: 1}}, To: "b"}
	s.Armies = map[uint32]*Army{army.ID: army}
	var ev Events
	s.startBattle(c, army, s.Planets["b"], &ev)

	s.Planets["a"].Owner = 1 // Seat 0's only other Planet falls
	if err := s.RetreatFromBattle(0, "b", false); err == nil || !strings.Contains(err.Error(), "no other Planet") {
		t.Errorf("Retreat with nowhere to go: err = %v", err)
	}
	s.Planets["a"].Owner = 0
	if err := s.RetreatFromBattle(0, "b", false); err != nil {
		t.Errorf("Retreat to a: %v", err)
	}
}

// Regression: an attacker that won on Control Points captured the Planet
// with the defender's survivors still in its Stacks, so it got them too.
func TestABeatenDefendersSurvivorsRetreatInsteadOfChangingSides(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	b := s.Planets["b"]
	b.Owner, b.Stacks = 0, [StacksPerPlanet]Stack{{{Unit: "base:marine", Count: 4}}}
	s.LastID++
	army := &Army{ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:grunt", Count: 2}}, To: "b"}
	s.Armies = map[uint32]*Army{army.ID: army}
	var ev Events
	s.startBattle(c, army, b, &ev)
	bt := onlyBattle(t, s)
	bt.Sim.Over, bt.Sim.Winner = true, battle.Attacker // as if it held the points

	s.endBattle(c, bt, &ev)

	if b.Owner != 1 || slices.ContainsFunc(b.Stacks[:], func(st Stack) bool {
		return slices.ContainsFunc(st, func(u UnitSlot) bool { return u.Unit == "base:marine" })
	}) {
		t.Errorf("b = %+v; want Seat 1's, with no Marines", b)
	}
	var fled *Army
	for _, a := range s.Armies {
		if a.Owner == 0 {
			fled = a
		}
	}
	if fled == nil || !fled.Retreating || fled.To != "a" || fled.Units[0] != (UnitSlot{Unit: "base:marine", Count: 4}) {
		t.Errorf("Seat 0's survivors = %+v, want 4 Marines Retreating to a", fled)
	}
}

func TestBuildingAPadTurretChecksTheSideFactionAndPurse(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Buildings["base:turret"] = baseMod().Buildings["base:turret"]
	c.Buildings["base:plasma-turret"] = baseMod().Buildings["base:plasma-turret"]
	s.Players[0].Resources = map[string]int{"base:credits": 1000, "base:materials": 60, "base:alloys": 20}
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	b := onlyBattle(t, s)
	if got := b.Sim.Funds[battle.Defender]; got["base:credits"] != 400 || got["base:materials"] != 100 || got["base:alloys"] != 40 {
		t.Errorf("the neutral garrison's funds %v; want the Ruleset's", got)
	}
	if len(b.Sim.Pads) == 0 {
		t.Fatal("no build pads")
	}

	if err := s.BuildTurret(c, 0, "b", 0, "base:turret"); err == nil || !strings.Contains(err.Error(), "don't hold") {
		t.Errorf("building on a pad it doesn't hold: err = %v", err)
	}
	b.Sim.Pads[0].Owner = battle.Attacker
	if err := s.BuildTurret(c, 0, "b", 0, "base:plasma-turret"); err == nil || !strings.Contains(err.Error(), "Faction") {
		t.Errorf("a Covenant turret for the UNSC: err = %v", err)
	}
	c.Techs = map[string]cs.Tech{"base:fortifications": {Name: "Fortifications", Unlocks: &cs.TechUnlocks{Buildings: []cs.ID{"base:turret"}}}}
	if err := s.BuildTurret(c, 0, "b", 0, "base:turret"); err == nil || !strings.Contains(err.Error(), "Fortifications") {
		t.Errorf("a locked Turret: err = %v", err)
	}
	holdTech(s, "a", 2, "base:fortifications")
	if err := s.BuildTurret(c, 0, "b", 0, "base:turret"); err != nil {
		t.Fatal(err)
	}
	if r := s.Players[0].Resources; r["base:credits"] != 800 || r["base:materials"] != 10 || r["base:alloys"] != 0 {
		t.Errorf("Resources %v; want the Turret's 200 Credits, 50 Materials and 20 Alloys paid", r)
	}
	if b.Sim.Pads[0].Building != "base:turret" {
		t.Errorf("pad %+v; want the Turret going up", b.Sim.Pads[0])
	}
	b.Sim.Pads[0].Building, b.Sim.Pads[0].ReadyAt = "", 0
	if err := s.BuildTurret(c, 0, "b", 0, "base:turret"); err == nil || !strings.Contains(err.Error(), "afford") {
		t.Errorf("a second Turret with 10 Materials left: err = %v", err)
	}
}

func TestPadTurretsAreGoneAfterTheBattle(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	c.Buildings["base:turret"] = baseMod().Buildings["base:turret"]
	s.Players[0].Resources = map[string]int{"base:credits": 1000, "base:materials": 100, "base:alloys": 20}
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	b := onlyBattle(t, s)
	b.Sim.Pads[0].Owner = battle.Attacker
	if err := s.BuildTurret(c, 0, "b", 0, "base:turret"); err != nil {
		t.Fatal(err)
	}
	before := slices.Clone(s.Planets["b"].Buildings)
	fight(t, s, c)
	if got := s.Planets["b"].Buildings; !slices.Equal(got, before) && s.Planets["b"].Owner == Neutral {
		t.Errorf("b's buildings %v, were %v; a pad turret isn't a Planet building", got, before)
	}
	for _, id := range s.Planets["b"].Buildings {
		if id == "base:turret" {
			t.Error("the pad turret became one of b's buildings")
		}
	}
}
