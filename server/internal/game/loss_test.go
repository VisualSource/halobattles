package game

import (
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

// Seat 0 holds Drill and Optics in the Lab in slot 2 of its Capital a.
func lostLabCase(t *testing.T) *State {
	t.Helper()
	s := fixedMatch(t)
	holdTech(s, "a", 2, "base:drill", "base:optics")
	return s
}

func wantLost(t *testing.T, s *State, techs ...string) {
	t.Helper()
	var lost []string
	for _, v := range s.Players[0].Saved {
		if v.Lost {
			lost = append(lost, v.Tech)
		}
	}
	if !slices.Equal(lost, techs) {
		t.Errorf("guaranteed cards for lost Techs %v, want %v", lost, techs)
	}
	if len(s.Planets["a"].Techs) != 0 {
		t.Errorf("a's Labs still hold %v", s.Planets["a"].Techs)
	}
}

func TestSellingALabLosesItsTechs(t *testing.T) {
	s, c := lostLabCase(t), researchContent()
	if err := s.SellBuilding(c, 0, "a", 2); err != nil {
		t.Fatal(err)
	}
	wantLost(t, s, "base:drill", "base:optics")
	if held := s.heldTechs(c, 0); len(held) != 0 {
		t.Errorf("held %v after selling the Lab", held)
	}
}

func TestCapturingAPlanetLosesItsLabsTechs(t *testing.T) {
	s := lostLabCase(t)
	var ev Events
	s.capture(s.Planets["a"], 1, &ev)
	wantLost(t, s, "base:drill", "base:optics")
}

func TestALabDestroyedInBattleLosesItsTechs(t *testing.T) {
	s, c := lostLabCase(t), researchContent()
	a := s.Planets["a"]
	s.LastID++
	army := &Army{ID: s.LastID, Owner: 1, Units: Stack{{Unit: "base:marine", Count: 1}}, To: "a"}
	s.Armies = map[uint32]*Army{army.ID: army}
	var ev Events
	s.startBattle(c, army, a, &ev)
	b := onlyBattle(t, s)
	for _, sq := range b.Sim.Squads {
		if sq.Building && sq.Slot == 2 || sq.Side == battle.Attacker {
			sq.Members = nil // the Lab and the attacker are dead
		}
	}
	b.Sim.Over, b.Sim.Winner = true, battle.Defender

	s.endBattle(c, b, &ev)

	if a.Owner != 0 || a.Buildings[2] != "" {
		t.Fatalf("a = %+v; want it held, without its Lab", a)
	}
	wantLost(t, s, "base:drill", "base:optics")
}

func TestALostTechComesBackAtItsRecoveryCost(t *testing.T) {
	s, c := lostLabCase(t), researchContent()
	r := c.Rulesets[RulesetID]
	r.Tech.RecoveryPercent = 50
	c.Rulesets[RulesetID] = r
	if err := s.SellBuilding(c, 0, "a", 2); err != nil {
		t.Fatal(err)
	}
	holdTech(s, "a", 3, "base:radar") // one Tech still held elsewhere: +10%

	// Optics is Uncommon, but a guaranteed card skips the Rarity threshold.
	if got := s.View(c, 0).Research.Saved; got[1].Tech != "base:optics" || got[1].Cost != 110 {
		t.Errorf("saved in the View %+v, want Optics at 50%% of 220", got)
	}
	if err := s.StartProject(c, 0, "base:optics", "a", 3); err != nil {
		t.Fatal(err)
	}
	if p := s.Players[0].Projects[0]; p.Cost != 110 || p.Done != 0 {
		t.Errorf("project %+v, want Optics at 110 from nothing", p)
	}
	if slices.ContainsFunc(s.Players[0].Saved, func(v Saved) bool { return v.Tech == "base:optics" }) {
		t.Error("Optics is still a guaranteed card after it was picked")
	}
}

func TestAGuaranteedCardStillNeedsItsRequirements(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	holdTech(s, "a", 2)
	s.Players[0].Saved = []Saved{{Tech: "base:tactics", Lost: true}} // needs Drill, which isn't held

	if err := s.StartProject(c, 0, "base:tactics", "a", 2); err == nil || err.Error() != "you no longer have what that Tech requires" {
		t.Errorf("err = %v", err)
	}
	holdTech(s, "a", 3, "base:drill")
	if err := s.StartProject(c, 0, "base:tactics", "a", 2); err != nil {
		t.Errorf("with Drill held: %v", err)
	}
}

func TestAnEliminatedPlayersLabsAreLeftEmpty(t *testing.T) {
	s := lostLabCase(t)
	var ev Events
	s.eliminate(0, &ev)

	a := s.Planets["a"]
	if a.Buildings[2] != "base:lab" || a.Techs != nil {
		t.Errorf("a = %+v; want the Lab standing, empty", a)
	}
	if len(s.Players[0].Saved) != 0 {
		t.Errorf("saved %+v; an eliminated player gets nothing back", s.Players[0].Saved)
	}
}

func TestOthersSeeALabsTechsInTheirVision(t *testing.T) {
	s, c := lostLabCase(t), researchContent()
	planetA := func(seat int) (PlanetView, bool) {
		for _, p := range s.View(c, seat).Planets {
			if p.ID == "a" {
				return p, true
			}
		}
		return PlanetView{}, false
	}
	if _, ok := planetA(1); ok {
		t.Fatal("Seat 1 sees a from e")
	}
	s.Planets["b"].Owner = 1 // b is one Lane from a
	p, ok := planetA(1)
	if !ok || !slices.Equal(p.Labs[2], []string{"base:drill", "base:optics"}) {
		t.Errorf("Seat 1 sees a's Labs as %v, want Drill and Optics in slot 2", p.Labs)
	}
}
