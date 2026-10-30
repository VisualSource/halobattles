package game

import (
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// researchContent adds Techs to the line map: two Common, an Uncommon, one
// needing Drill, one needing a Mine, and a Covenant one. Seat 0 (UNSC) makes
// 2 Research from its Capital a, so only Commons are offered to start.
func researchContent() *cs.Content {
	c := lineContent()
	unsc, cov := cs.ID("base:unsc"), cs.ID("base:covenant")
	c.Techs = map[string]cs.Tech{
		"base:drill":    {Name: "Drill", Rarity: "common", Cost: 100, Faction: &unsc},
		"base:radar":    {Name: "Radar", Rarity: "common", Cost: 100},
		"base:optics":   {Name: "Optics", Rarity: "uncommon", Cost: 200},
		"base:tactics":  {Name: "Tactics", Rarity: "common", Cost: 100, Requires: &cs.TechRequirements{Techs: []cs.ID{"base:drill"}}},
		"base:geology":  {Name: "Geology", Rarity: "common", Cost: 100, Requires: &cs.TechRequirements{Buildings: []cs.ID{"base:mine"}}},
		"base:prophecy": {Name: "Prophecy", Rarity: "common", Cost: 100, Faction: &cov},
	}
	c.Buildings["base:station"] = cs.Building{Faction: "base:unsc", BuildTime: 30, Research: new(2)}
	return c
}

// researching gives Seat 0 an empty Lab in its Capital's slot 2 and starts
// each tech there, as if each had been dealt.
func researching(t *testing.T, s *State, c *cs.Content, techs ...string) {
	t.Helper()
	holdTech(s, "a", 2)
	for _, tech := range techs {
		s.Players[0].Hand = []string{tech}
		if err := s.StartProject(c, 0, tech, "a", 2); err != nil {
			t.Fatalf("start %s: %v", tech, err)
		}
	}
}

func TestResearchComesFromTheCapitalAndResearchBuildings(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	if got := s.researchRate(c, 0); got != 2 {
		t.Errorf("rate %d, want the Capital's 2", got)
	}
	b := s.Planets["b"]
	b.Owner, b.Locked = 0, true
	b.Buildings[0] = "base:station"
	if got := s.researchRate(c, 0); got != 4 {
		t.Errorf("rate %d, want 4 with a research building on a Locked Planet", got)
	}
}

func TestTheHandDealsOpenTechsByRarityAndReplays(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	s.Advance(c, 0)

	// Rate 2 opens only Commons; Tactics and Geology lack their
	// requirements; Prophecy is Covenant's.
	hand := s.Players[0].Hand
	if want := []string{"base:drill", "base:radar"}; !slices.Equal(slices.Sorted(slices.Values(hand)), want) {
		t.Errorf("hand %v, want %v", hand, want)
	}
	again := fixedMatch(t)
	again.Advance(c, 0)
	if !slices.Equal(again.Players[0].Hand, hand) {
		t.Errorf("hand %v from the same seed, want %v", again.Players[0].Hand, hand)
	}

	s.Planets["b"].Owner = 0
	s.Planets["b"].Buildings[0] = "base:station" // rate 4 opens Uncommons
	s.Planets["b"].Buildings[1] = "base:mine"
	s.Advance(c, 1000)
	if !slices.Equal(s.Players[0].Hand, hand) {
		t.Errorf("hand changed to %v without a pick; it stays until one", s.Players[0].Hand)
	}
	s.Players[0].Hand = nil
	s.Advance(c, 2000)
	if got := slices.Sorted(slices.Values(s.Players[0].Hand)); len(got) != 3 || slices.Contains(got, "base:tactics") || slices.Contains(got, "base:prophecy") {
		t.Errorf("redrawn hand %v; want 3 of Drill, Radar, Optics, Geology", got)
	}
}

func TestProjectsSplitResearchAndFinishInTheirLab(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	researching(t, s, c, "base:drill", "base:radar")

	s.Advance(c, 0) // 2 Research split: 1 each, so 100 s each
	s.Advance(c, 99_000)
	if held := s.heldTechs(c, 0); len(held) != 0 {
		t.Fatalf("held %v after 99 s, want nothing yet", held)
	}
	s.Advance(c, 100_000)
	if got := s.Planets["a"].Techs[2]; !slices.Equal(slices.Sorted(slices.Values(got)), []string{"base:drill", "base:radar"}) {
		t.Errorf("Lab holds %v, want Drill and Radar", got)
	}
	if len(s.Players[0].Projects) != 0 {
		t.Errorf("projects %+v, want none left", s.Players[0].Projects)
	}
	if got := s.techCost(c, 0, "base:optics"); got != 240 {
		t.Errorf("Optics costs %d with 2 Techs held, want 200 + 20%%", got)
	}
}

func TestAPausedProjectGivesItsShareToTheOthers(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	s.Planets["b"].Owner = 0
	s.Planets["b"].Buildings[1] = "base:lab"
	researching(t, s, c, "base:drill")
	s.Players[0].Hand = []string{"base:radar"}
	if err := s.StartProject(c, 0, "base:radar", "b", 1); err != nil {
		t.Fatal(err)
	}

	s.Planets["b"].Locked = true
	s.Advance(c, 0)
	p := s.Players[0].Projects
	if p[0].Rate != 2 || p[1].Rate != 0 {
		t.Errorf("rates %v and %v, want 2 for Drill and 0 for Radar, whose Lab's Planet is Locked", p[0].Rate, p[1].Rate)
	}
	s.Players[0].Resources["base:credits"] = -1
	s.Advance(c, 10_000)
	if r := s.Players[0].Projects[0]; r.Rate != 0 || r.Done != 20 {
		t.Errorf("in debt: Drill %+v, want paused with 20 done", r)
	}
}

func TestAProjectNeedingAMissingBuildingPauses(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	s.Planets["a"].Buildings[3] = "base:mine"
	researching(t, s, c, "base:geology")
	s.Advance(c, 0)
	s.Planets["a"].Buildings[3] = ""
	s.Advance(c, 1000)
	if r := s.Players[0].Projects[0].Rate; r != 0 {
		t.Errorf("rate %v without the Mine, want 0", r)
	}
}

func TestStartingAProjectNeedsAnOfferedTechAndAFreeTechSlot(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	holdTech(s, "a", 2, "base:optics")
	pl := &s.Players[0]
	pl.Hand = []string{"base:drill", "base:radar"}

	for _, tc := range []struct {
		tech, planet string
		slot         int
		want         string
	}{
		{"base:optics", "a", 2, "that Tech isn't on offer"},
		{"base:drill", "a", 0, "you have no Lab in Building Slot 1 of a"},
		{"base:drill", "e", 2, "you have no Lab in Building Slot 3 of e"},
	} {
		if err := s.StartProject(c, 0, tc.tech, tc.planet, tc.slot); err == nil || err.Error() != tc.want {
			t.Errorf("%s at %s %d: err = %v, want %q", tc.tech, tc.planet, tc.slot, err, tc.want)
		}
	}
	if err := s.StartProject(c, 0, "base:drill", "a", 2); err != nil {
		t.Fatal(err)
	}
	if pl.Hand != nil {
		t.Errorf("hand %v after a pick, want it cleared for a new draw", pl.Hand)
	}
	pl.Hand = []string{"base:radar"}
	if err := s.StartProject(c, 0, "base:radar", "a", 2); err == nil || err.Error() != "that Lab has no free Tech Slot" {
		t.Errorf("a third Tech in a 2-slot Lab holding one and researching one: err = %v", err)
	}
	pl.Projects = append(pl.Projects, Project{Tech: "x"}, Project{Tech: "y"})
	holdTech(s, "a", 3)
	if err := s.StartProject(c, 0, "base:radar", "a", 3); err == nil || err.Error() != "you can run at most 3 Projects" {
		t.Errorf("a fourth Project: err = %v", err)
	}
}

func TestACancelledProjectKeepsItsProgress(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	researching(t, s, c, "base:drill")
	s.Advance(c, 0)
	s.Advance(c, 10_000) // 20 of 100 done

	if err := s.CancelProject(0, "base:drill"); err != nil {
		t.Fatal(err)
	}
	pl := &s.Players[0]
	if want := []Saved{{Tech: "base:drill", Cost: 100, Done: 20}}; !slices.Equal(pl.Saved, want) || len(pl.Projects) != 0 {
		t.Fatalf("saved %+v, projects %+v; want Drill saved at 20 of 100", pl.Saved, pl.Projects)
	}
	s.Advance(c, 20_000)
	if slices.Contains(pl.Hand, "base:drill") {
		t.Errorf("hand %v offers Drill, which is saved", pl.Hand)
	}

	if err := s.StartProject(c, 0, "base:drill", "a", 2); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 20_000)
	s.Advance(c, 60_000) // 80 more at 2 a second
	if !s.heldTechs(c, 0)["base:drill"] {
		t.Errorf("Drill not held after resuming at 20 for 40 s")
	}
}

func TestAProjectWhoseLabIsLostIsSaved(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	researching(t, s, c, "base:drill")
	s.Advance(c, 0)
	s.Advance(c, 10_000)

	s.Planets["a"].Buildings[2] = ""
	s.Advance(c, 15_000)
	if want := []Saved{{Tech: "base:drill", Cost: 100, Done: 30}}; !slices.Equal(s.Players[0].Saved, want) {
		t.Errorf("saved %+v, want Drill at 30", s.Players[0].Saved)
	}
}
