package game

import (
	"slices"
	"strings"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// raidMatch is fixedMatch with a's Warthogs able to Raid, 3 Command Points each.
func raidMatch(t *testing.T) (*State, *cs.Content) {
	t.Helper()
	s, c := fixedMatch(t), lineContent()
	u := c.Units["base:warthog"]
	u.Name, u.Roles, u.CommandPoints = "Warthog", []cs.UnitRolesElem{cs.UnitRolesElemScout}, 3
	c.Units["base:warthog"] = u
	return s, c
}

var warthogs = []ArmyUnits{{0, "base:warthog", 2}}

func TestOnlyRaidersWithinTheCapCanRaid(t *testing.T) {
	s, c := raidMatch(t)
	for _, tc := range []struct {
		units []ArmyUnits
		to    string
		want  string
	}{
		{marines(2), "b", "can't Raid"},
		{warthogs, "a", "your own Planet"},
	} {
		if err := s.OrderRaid(c, 0, "a", tc.units, tc.to, 0); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("Raid of %v on %s: err %v, want %q", tc.units, tc.to, err, tc.want)
		}
	}
	u := c.Units["base:warthog"]
	u.CommandPoints = 6
	c.Units["base:warthog"] = u
	if err := s.OrderRaid(c, 0, "a", warthogs, "b", 0); err == nil || !strings.Contains(err.Error(), "at most 10") {
		t.Errorf("a 12 Command Point Raid: err %v", err)
	}
	if len(s.Armies) != 0 {
		t.Fatalf("a refused Raid left %d Armies", len(s.Armies))
	}
	u.CommandPoints = 3
	c.Units["base:warthog"] = u
	if err := s.OrderRaid(c, 0, "a", warthogs, "b", 0); err != nil || !onlyArmy(t, s).Raid {
		t.Fatalf("err %v; want a Raid under way", err)
	}
	id := onlyArmy(t, s).ID
	if err := s.ReorderArmy(0, id, "c", 0); err != nil || onlyArmy(t, s).Raid {
		t.Errorf("err %v; re-ordered as an Attack, want it no longer a Raid", err)
	}
	if err := s.ReorderRaid(c, 0, id, "a", 0); err == nil || !strings.Contains(err.Error(), "your own Planet") {
		t.Errorf("re-ordered to Raid its own Planet: err %v", err)
	}
	if err := s.ReorderRaid(c, 0, id, "c", 0); err != nil || !onlyArmy(t, s).Raid {
		t.Errorf("err %v; re-ordered as a Raid, want it one again", err)
	}
}

func TestARaidIsHiddenFromEveryoneButItsOwner(t *testing.T) {
	s, c := raidMatch(t)
	if err := s.OrderRaid(c, 0, "a", warthogs, "e", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 75_000) // on the c - d hop: d is in Seat 1's vision
	if vs := s.View(c, 1).Armies; len(vs) != 0 {
		t.Errorf("Seat 1 sees %+v; a Raid is hidden", vs)
	}
	if vs := s.View(c, 0).Armies; len(vs) != 1 || !vs[0].Raid {
		t.Errorf("its owner sees %+v; want the Raid, marked", vs)
	}
	a := onlyArmy(t, s)
	a.Raid = false
	if len(s.View(c, 1).Armies) != 1 {
		t.Fatal("Seat 1 can't see an Attack there either: the test proves nothing")
	}
}

func TestARaidDestroysBuildingsTakesNothingAndGoesHome(t *testing.T) {
	s, c := raidMatch(t)
	b := s.Planets["b"]
	b.Stacks = [StacksPerPlanet]Stack{}
	b.Buildings[0] = "base:barracks"
	_ = s.OrderRaid(c, 0, "a", warthogs, "b", 0)
	s.Advance(c, 30_000)
	if !onlyBattle(t, s).Sim.Raid {
		t.Fatal("want the Battle a Raid")
	}

	ev := fight(t, s, c)

	if ev.Ended[0].Winner != 0 || b.Owner != Neutral || b.Buildings[0] != "" {
		t.Errorf("winner %d, b's owner %d, buildings %v; want the raiders' win, the Barracks gone and b still neutral",
			ev.Ended[0].Winner, b.Owner, b.Buildings)
	}
	if r := onlyArmy(t, s); !r.Retreating || r.Raid || r.To != "a" {
		t.Errorf("raiders %+v; want them going home to a, seen", r)
	}
}

func TestARaidWithNothingToRaidGoesHome(t *testing.T) {
	s, c := raidMatch(t)
	_ = s.OrderRaid(c, 0, "a", warthogs, "b", 0) // 6 Grunts, no buildings
	ev := s.Advance(c, 30_000)
	if len(s.Battles) != 0 {
		t.Fatal("a Battle at a Planet with no buildings")
	}
	if want := []RaidTurnedBack{{Seat: 0, Planet: "b"}}; !slices.Equal(ev.TurnedBack, want) {
		t.Errorf("events %+v; want its owner told it turned back", ev.TurnedBack)
	}
	if r := onlyArmy(t, s); !r.Retreating || r.Raid || r.To != "a" {
		t.Errorf("raiders %+v; want them going home to a", r)
	}
}
