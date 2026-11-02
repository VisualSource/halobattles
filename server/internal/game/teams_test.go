package game

import (
	"errors"
	"reflect"
	"testing"
)

// teamMatch is fixedMatch (a - b - c - d - e: Seat 0 at a, Seat 1 at e)
// with a third Seat on Seat 0's Team, holding c, and d emptied.
func teamMatch(t *testing.T) *State {
	t.Helper()
	s := fixedMatch(t)
	s.Players = append(s.Players, Player{Seat: 2, Team: 0, Resources: map[string]int{}})
	s.Planets["c"].Owner = 2
	s.Planets["d"].Stacks = [StacksPerPlanet]Stack{}
	return s
}

func TestAnArmyPassesThroughATeammatesPlanetButCantStopThere(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	if err := s.OrderArmy(0, "a", marines(4), "c", 0); !errors.Is(err, errAllyPlanet) {
		t.Errorf("ordering onto a Teammate's Planet: %v", err)
	}
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{}
	if err := s.OrderArmy(0, "a", marines(4), "d", 0); err != nil {
		t.Fatal(err)
	}
	for at := int64(30_000); at <= 90_000; at += 30_000 {
		s.Advance(c, at) // b captured on the way, c passed, d reached
	}
	if len(s.Battles) != 0 || s.Planets["c"].Owner != 2 || s.Planets["d"].Owner != 0 {
		t.Errorf("battles %d, c owner %d, d owner %d; want c passed and d taken", len(s.Battles), s.Planets["c"].Owner, s.Planets["d"].Owner)
	}
}

// A Teammate takes the target first: the Army can't land there, so it heads home.
func TestAnArmyWhoseTargetATeammateTookFirstHeadsHome(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	s.Planets["b"].Stacks = [StacksPerPlanet]Stack{}
	if err := s.OrderArmy(0, "a", marines(4), "b", 0); err != nil {
		t.Fatal(err)
	}
	s.Planets["b"].Owner = 2 // the Teammate gets there first
	s.Advance(c, 30_000)
	a := onlyArmy(t, s)
	if a.Waiting || !a.Retreating || a.destination() != "a" {
		t.Fatalf("Army %+v; want it heading home to a", a)
	}
	s.Advance(c, 60_000)
	if len(s.Armies) != 0 || s.Planets["a"].Stacks[0][0].Count != 10 {
		t.Errorf("armies %d, a's Marines %+v; want them home", len(s.Armies), s.Planets["a"].Stacks[0])
	}
}

func TestTeammatesShareVisionButNotQueues(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	s.Planets["c"].Queue = []QueueItem{{ID: 99, Building: "base:barracks"}}
	s.Planets["c"].Stacks[0] = Stack{{Unit: "base:marine", Count: 10}}
	if err := s.OrderArmy(2, "c", marines(2), "d", 0); err != nil {
		t.Fatal(err)
	}

	v := s.View(c, 0)
	seen := map[string]PlanetView{}
	for _, p := range v.Planets {
		seen[p.ID] = p
	}
	if _, ok := seen["d"]; !ok {
		t.Errorf("Seat 0 sees %v; want d, beside its Teammate's c", planetIDs(v))
	}
	if seen["c"].Queue != nil {
		t.Errorf("a Teammate's queue shown: %+v", seen["c"].Queue)
	}
	if len(v.Armies) != 1 || v.Armies[0].Destination != "d" {
		t.Errorf("Armies %+v; want the Teammate's, with where it's going", v.Armies)
	}
	if v.Players[2].Team != 0 || v.Players[1].Team != 1 {
		t.Errorf("Teams in the View: %+v", v.Players)
	}
}

// A Teammate watches an ally's Battle from the ally's side.
func TestATeammateSeesAnAllysBattleFromTheirSide(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	s.Planets["c"].Stacks[0] = Stack{{Unit: "base:marine", Count: 3}}
	if err := s.OrderArmy(1, "e", marines(5), "c", 0); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 30_000)
	s.Advance(c, 60_000) // through empty d, into c: a Battle with Seat 2

	ally, own := s.View(c, 0).Battles, s.View(c, 2).Battles
	if len(own) != 1 || !reflect.DeepEqual(ally, own) {
		t.Errorf("Seat 0 sees %+v; want Seat 2's own view of its Battle, %+v", ally, own)
	}
	if err := s.RetreatFromBattle(0, "c", false); err == nil {
		t.Error("a Teammate ordered a Retreat in an ally's Battle")
	}
}

func TestATeamWinsTogether(t *testing.T) {
	s, c := teamMatch(t), lineContent()
	s.eliminate(1, &Events{})
	if ev := s.Advance(c, 1_000); ev.MatchEnded == nil || *ev.MatchEnded != (Result{Winner: 0, Reason: ReasonLastStanding}) {
		t.Errorf("ended %+v; want Team 1 (0) last standing, two of its players still in", ev.MatchEnded)
	}

	// The hold: Seats 0 and 2 hold 4 of the 5 Planets between them.
	s = teamMatch(t)
	s.Planets["b"].Owner, s.Planets["d"].Owner = 0, 2
	s.Advance(c, 1_000)
	if s.HoldTeam != 0 {
		t.Errorf("hold %d; want Team 0's combined Planets to hold the share", s.HoldTeam)
	}
}

func TestStartMatchNumbersTeams(t *testing.T) {
	c := lineContent()
	s, err := StartMatch(c, "base:line", []SeatSetup{{User: "u1", Faction: "base:unsc", Team: 2}, {User: "u2", Faction: "base:unsc", Team: 2}}, nil, 1)
	if err != nil {
		t.Fatal(err)
	}
	if !s.Allied(0, 1) || s.Players[0].Team != 1 {
		t.Errorf("teams %d, %d; want both on Team 2 (1)", s.Players[0].Team, s.Players[1].Team)
	}
	s, _ = StartMatch(c, "base:line", []SeatSetup{{User: "u1", Faction: "base:unsc"}, {User: "u2", Faction: "base:unsc"}}, nil, 1)
	if s.Allied(0, 1) || s.Allied(0, Neutral) {
		t.Error("a free-for-all has allies")
	}
}
