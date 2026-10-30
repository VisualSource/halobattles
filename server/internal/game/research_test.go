package game

import (
	"maps"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// researchContent adds Techs to the line map, in two Research fields.
// Industry: Drill and Tactics (needing Drill) are Common, Geology needs a
// Mine, Optics is Uncommon, Prophecy is Covenant's. Military: Radar is
// Common, Sonar Uncommon. Seat 0 (UNSC) makes 2 Research in each field
// from its Capital a, so only Commons are offered to start.
func researchContent() *cs.Content {
	c := lineContent()
	unsc, cov := cs.ID("base:unsc"), cs.ID("base:covenant")
	c.Techs = map[string]cs.Tech{
		"base:drill":    {Name: "Drill", Field: "base:industry", Rarity: "common", Cost: 100, Faction: &unsc},
		"base:tactics":  {Name: "Tactics", Field: "base:industry", Rarity: "common", Cost: 100, Requires: &cs.TechRequirements{Techs: []cs.ID{"base:drill"}}},
		"base:geology":  {Name: "Geology", Field: "base:industry", Rarity: "common", Cost: 100, Requires: &cs.TechRequirements{Buildings: []cs.ID{"base:mine"}}},
		"base:optics":   {Name: "Optics", Field: "base:industry", Rarity: "uncommon", Cost: 200},
		"base:prophecy": {Name: "Prophecy", Field: "base:industry", Rarity: "common", Cost: 100, Faction: &cov},
		"base:radar":    {Name: "Radar", Field: "base:military", Rarity: "common", Cost: 100},
		"base:sonar":    {Name: "Sonar", Field: "base:military", Rarity: "uncommon", Cost: 200},
	}
	c.Buildings["base:station"] = cs.Building{Faction: "base:unsc", BuildTime: 30, Research: map[string]int{"base:industry": 2}}
	return c
}

// researching gives Seat 0 an empty Lab in its Capital's slot 2 and starts
// each tech there, as if each had been dealt.
func researching(t *testing.T, s *State, c *cs.Content, techs ...string) {
	t.Helper()
	holdTech(s, "a", 2)
	for _, tech := range techs {
		deal(s, c, tech)
		if err := s.StartProject(c, 0, tech, "a", 2); err != nil {
			t.Fatalf("start %s: %v", tech, err)
		}
	}
}

// deal puts tech in Seat 0's hand for its field.
func deal(s *State, c *cs.Content, techs ...string) {
	pl := &s.Players[0]
	if pl.Hands == nil {
		pl.Hands = map[string][]string{}
	}
	for _, tech := range techs {
		f := string(c.Techs[tech].Field)
		pl.Hands[f] = append(pl.Hands[f], tech)
	}
}

func TestEachFieldGetsTheCapitalsResearchPlusItsBuildings(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	if got := s.View(c, 0).Research.Rates; !maps.Equal(got, map[string]int{"base:military": 2, "base:industry": 2}) {
		t.Errorf("rates %v, want the Capital's 2 in each field", got)
	}
	b := s.Planets["b"]
	b.Owner, b.Locked = 0, true
	b.Buildings[0] = "base:station"
	if got := s.View(c, 0).Research.Rates; !maps.Equal(got, map[string]int{"base:military": 2, "base:industry": 4}) {
		t.Errorf("rates %v, want Industry 4 with a research building on a Locked Planet", got)
	}
}

func TestEachIdleFieldIsDealtAHandOfItsOwnOpenTechs(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	s.Advance(c, 0)

	// Rate 2 opens only Commons; Tactics and Geology lack their
	// requirements; Prophecy is Covenant's.
	hands := s.View(c, 0).Research.Hands
	if want := map[string][]string{"base:industry": {"base:drill"}, "base:military": {"base:radar"}}; !maps.EqualFunc(hands, want, slices.Equal) {
		t.Errorf("hands %v, want %v", hands, want)
	}
	again := fixedMatch(t)
	again.Advance(c, 0)
	if got := again.View(c, 0).Research.Hands; !maps.EqualFunc(got, hands, slices.Equal) {
		t.Errorf("hands %v from the same seed, want %v", got, hands)
	}

	s.Planets["b"].Owner = 0
	s.Planets["b"].Buildings[0] = "base:station" // Industry 4 opens its Uncommons, not Military's
	s.Planets["b"].Buildings[1] = "base:mine"
	s.Advance(c, 1000)
	if got := s.View(c, 0).Research.Hands; !maps.EqualFunc(got, hands, slices.Equal) {
		t.Errorf("hands changed to %v without a pick; they stay until one", got)
	}
	s.Players[0].Hands = nil
	s.Advance(c, 2000)
	got := s.View(c, 0).Research.Hands
	if ind := slices.Sorted(slices.Values(got["base:industry"])); !slices.Equal(ind, []string{"base:drill", "base:geology", "base:optics"}) {
		t.Errorf("redrawn Industry hand %v; want Drill, Geology and Optics", ind)
	}
	if mil := got["base:military"]; !slices.Equal(mil, []string{"base:radar"}) {
		t.Errorf("redrawn Military hand %v; want only Radar, since Military is still at 2", mil)
	}
}

func TestEachFieldRunsOneProjectWithItsWholeRate(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	researching(t, s, c, "base:drill", "base:radar")
	if got := s.View(c, 0).Research.Hands; len(got) != 0 {
		t.Errorf("hands %v while both fields run a Project, want none", got)
	}

	s.Advance(c, 0) // 2 Research a field: 50 s each
	s.Advance(c, 49_000)
	if held := s.heldTechs(c, 0); len(held) != 0 {
		t.Fatalf("held %v after 49 s, want nothing yet", held)
	}
	s.Advance(c, 50_000)
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

func TestAPausedProjectLeavesItsFieldIdle(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	s.Planets["b"].Owner = 0
	s.Planets["b"].Buildings[1] = "base:lab"
	researching(t, s, c, "base:drill")
	deal(s, c, "base:radar")
	if err := s.StartProject(c, 0, "base:radar", "b", 1); err != nil {
		t.Fatal(err)
	}

	s.Planets["b"].Locked = true
	s.Advance(c, 0)
	p := s.Players[0].Projects
	if p[0].Rate != 2 || p[1].Rate != 0 {
		t.Errorf("rates %v and %v, want 2 for Drill and 0 for Radar, whose Lab's Planet is Locked", p[0].Rate, p[1].Rate)
	}
	if got := s.View(c, 0).Research.Hands; len(got) != 0 {
		t.Errorf("hands %v; a paused Project still holds its field", got)
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

func TestStartingAProjectNeedsAnOfferedTechAFreeFieldAndAFreeTechSlot(t *testing.T) {
	s, c := fixedMatch(t), researchContent()
	holdTech(s, "a", 2, "base:optics")
	deal(s, c, "base:drill", "base:geology", "base:radar")

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
	pl := &s.Players[0]
	if _, ok := pl.Hands["base:industry"]; ok {
		t.Errorf("Industry hand %v after a pick, want it gone while its Project runs", pl.Hands["base:industry"])
	}
	pl.Saved = append(pl.Saved, Saved{Tech: "base:tactics", Cost: 100})
	if err := s.StartProject(c, 0, "base:tactics", "a", 2); err == nil || err.Error() != "Industry already runs a Project" {
		t.Errorf("a second Industry Project: err = %v", err)
	}
	if err := s.StartProject(c, 0, "base:radar", "a", 2); err == nil || err.Error() != "that Lab has no free Tech Slot" {
		t.Errorf("a third Tech in a 2-slot Lab holding one and researching one: err = %v", err)
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
	if slices.Contains(pl.Hands["base:industry"], "base:drill") {
		t.Errorf("hand %v offers Drill, which is saved", pl.Hands["base:industry"])
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
