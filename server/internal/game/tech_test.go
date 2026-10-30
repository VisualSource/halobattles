package game

import (
	"strings"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// Seat 0's Capital a has the Barracks and Supply Pad in Building Slots 0
// and 1; slots 2 and 3 are empty.

// withLockingTechs adds Techs unlocking the Air Pad (Air Wing, or Shared
// Hangars) and ODSTs (Helljumpers).
func withLockingTechs(c *cs.Content) *cs.Content {
	c.Techs = map[string]cs.Tech{
		"base:air-wing":       {Name: "Air Wing", Unlocks: &cs.TechUnlocks{Buildings: []cs.ID{"base:air-pad"}}},
		"base:shared-hangars": {Name: "Shared Hangars", Unlocks: &cs.TechUnlocks{Buildings: []cs.ID{"base:air-pad"}}},
		"base:helljumpers":    {Name: "Helljumpers", Unlocks: &cs.TechUnlocks{Units: []cs.ID{"base:odst"}}},
	}
	return c
}

// holdTech gives seat a Lab in slot of planet, holding techs.
func holdTech(s *State, planet string, slot int, techs ...string) {
	p := s.Planets[planet]
	p.Buildings[slot] = "base:lab"
	if p.Techs == nil {
		p.Techs = map[int][]string{}
	}
	p.Techs[slot] = techs
}

func TestALockedBuildingNeedsATechUnlockingIt(t *testing.T) {
	s, c := fixedMatch(t), withLockingTechs(lineContent())
	s.Players[0].Resources = map[string]int{"base:credits": 1000, "base:materials": 1000}

	err := s.QueueBuilding(c, 0, "a", 3, "base:air-pad")
	if err == nil || err.Error() != "research Air Wing or Shared Hangars first" {
		t.Fatalf("err = %v, want it to name both Techs", err)
	}
	if s.Players[0].Resources["base:credits"] != 1000 {
		t.Error("a refused building was charged")
	}
	if err := s.QueueBuilding(c, 0, "a", 3, "base:mine"); err != nil {
		t.Errorf("a building no Tech unlocks: %v", err)
	}

	holdTech(s, "a", 2, "base:shared-hangars")
	if err := s.QueueBuilding(c, 0, "b", 0, "base:air-pad"); err == nil {
		t.Error("queued on a Planet Seat 0 doesn't own") // still refused for the usual reason
	}
	s.Planets["b"].Owner = 0
	if err := s.QueueBuilding(c, 0, "b", 0, "base:air-pad"); err != nil {
		t.Errorf("with Shared Hangars held in the Capital's Lab, on another Planet: %v", err)
	}
}

func TestALockedUnitNeedsATechUnlockingIt(t *testing.T) {
	s, c := fixedMatch(t), withLockingTechs(lineContent())

	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 1); err == nil || !strings.Contains(err.Error(), "Helljumpers") {
		t.Errorf("err = %v, want it to name Helljumpers", err)
	}
	if err := s.QueueUnit(c, 0, "a", 0, "base:marine", 1); err != nil {
		t.Errorf("a unit no Tech unlocks: %v", err)
	}
	holdTech(s, "a", 2, "base:helljumpers")
	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 1); err != nil {
		t.Errorf("with Helljumpers held: %v", err)
	}
}

func TestATechCountsOnlyWhileItsLabStands(t *testing.T) {
	s, c := fixedMatch(t), withLockingTechs(lineContent())
	holdTech(s, "a", 2, "base:helljumpers")
	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 1); err != nil {
		t.Fatal(err)
	}

	s.Planets["a"].Buildings[2] = "" // the Lab is destroyed
	if err := s.QueueUnit(c, 0, "a", 0, "base:odst", 1); err == nil {
		t.Error("an ODST queued after the Lab holding Helljumpers was lost")
	}
	if got := len(s.Planets["a"].UnitQueues[0]); got != 1 {
		t.Errorf("unit queue has %d items; the ODST queued before the loss should stay", got)
	}

	// A new Lab in the same slot doesn't bring the lost Techs back.
	s.Players[0].Resources["base:credits"] = 1000
	if err := s.QueueBuilding(c, 0, "a", 2, "base:lab"); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 0) // the Lab starts
	s.Advance(c, 45_000)
	if s.Planets["a"].Buildings[2] != "base:lab" {
		t.Fatalf("buildings %v; want the new Lab built", s.Planets["a"].Buildings)
	}
	if held := s.heldTechs(c, 0); len(held) != 0 {
		t.Errorf("the new Lab holds %v; want nothing", held)
	}
}

func TestAPlanetHoldsAtMostThreeLabs(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Players[0].Resources = map[string]int{"base:credits": 1000}
	a := s.Planets["a"]
	a.Buildings = []string{"base:lab", "base:lab", "", ""}

	if err := s.QueueBuilding(c, 0, "a", 2, "base:lab"); err != nil {
		t.Fatalf("the third Lab: %v", err)
	}
	if err := s.QueueBuilding(c, 0, "a", 3, "base:lab"); err == nil || err.Error() != "a Planet holds at most 3 Labs" {
		t.Errorf("a fourth Lab, counting the one queued: err = %v", err)
	}
}
