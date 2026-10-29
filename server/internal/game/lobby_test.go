package game

import (
	"errors"
	"strings"
	"testing"
)

func newTestLobby() *Lobby {
	return NewLobby(LobbyContent{
		Maps: map[string]LobbyMap{
			"base:quadrant": {Starts: 3, MinPlayers: 2},
			"base:duel":     {Starts: 2, MinPlayers: 2},
			"base:solo":     {Starts: 1, MinPlayers: 1},
		},
		Factions:          []string{"base:unsc", "base:covenant"},
		Caps:              map[string]int{"base:credits": 3000, "base:materials": 1500},
		Resources:         []string{"base:credits", "base:materials"},
		StartingResources: map[string]int{"base:credits": 1000, "base:materials": 300},
	})
}

func seatUsers(l *Lobby) []string {
	var users []string
	for _, s := range l.Seats {
		users = append(users, s.User)
	}
	return users
}

func joined(t *testing.T, users ...string) *Lobby {
	t.Helper()
	l := newTestLobby()
	for _, u := range users {
		if err := l.Join(u, u); err != nil {
			t.Fatalf("join %s: %v", u, err)
		}
	}
	return l
}

func wantReject(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Errorf("got %v, want an error mentioning %q", err, want)
	}
}

func TestFirstJoinerIsHostWithDefaults(t *testing.T) {
	l := joined(t, "u1")

	if l.Host() != "u1" {
		t.Errorf("host = %q, want u1", l.Host())
	}
	// First Faction and first map by id.
	want := Seat{User: "u1", DisplayName: "u1", Faction: "base:covenant", Ready: false}
	if l.Seats[0] != want {
		t.Errorf("seat = %+v, want %+v", l.Seats[0], want)
	}
	if l.Map != "base:duel" || l.MaxSeats() != 2 || l.StartingResources["base:credits"] != 1000 {
		t.Errorf("lobby settings = %q (max %d) %v", l.Map, l.MaxSeats(), l.StartingResources)
	}
}

func TestJoinIsRejectedOnceEverySeatIsTaken(t *testing.T) {
	l := joined(t, "u1", "u2")

	if l.CanJoin("u3") {
		t.Error("CanJoin(u3) = true with every Seat taken")
	}
	if err := l.Join("u3", "u3"); !errors.Is(err, ErrLobbyFull) {
		t.Errorf("join u3 = %v, want ErrLobbyFull", err)
	}
	if !l.CanJoin("u2") || l.Join("u2", "u2") != nil || len(l.Seats) != 2 {
		t.Errorf("a seated player joining again should keep their one Seat, seats = %v", seatUsers(l))
	}
}

func TestLeavingFreesTheSeatAndHostPassesToLongestHeld(t *testing.T) {
	l := joined(t, "u1", "u2")
	_ = l.SetMap("u1", "base:quadrant")
	_ = l.Join("u3", "u3")

	l.Leave("u1")
	if l.Host() != "u2" {
		t.Errorf("host after Host leaves = %q, want u2 (longest held)", l.Host())
	}
	if !l.CanJoin("u4") || l.Join("u4", "u4") != nil {
		t.Error("a freed Seat should take a new player")
	}
	if got := seatUsers(l); len(got) != 3 || got[0] != "u2" || got[2] != "u4" {
		t.Errorf("seat order = %v, want [u2 u3 u4]", got)
	}

	for _, u := range []string{"u2", "u3", "u4", "nobody"} {
		l.Leave(u)
	}
	if len(l.Seats) != 0 || l.Host() != "" {
		t.Errorf("after everyone leaves: seats %v, host %q", seatUsers(l), l.Host())
	}
}

func TestPlayersPickTheirOwnFactionAndReady(t *testing.T) {
	l := joined(t, "u1", "u2")

	if err := l.SetFaction("u2", "base:covenant"); err != nil {
		t.Errorf("mirror match should be allowed: %v", err)
	}
	if err := l.SetFaction("u1", "base:unsc"); err != nil || l.Seats[0].Faction != "base:unsc" {
		t.Errorf("SetFaction: %v, seat %+v", err, l.Seats[0])
	}
	wantReject(t, l.SetFaction("u1", "base:flood"), "unknown Faction base:flood")
	wantReject(t, l.SetFaction("ghost", "base:unsc"), "no Seat")

	if err := l.SetReady("u2", true); err != nil || !l.Seats[1].Ready {
		t.Errorf("SetReady: %v, seat %+v", err, l.Seats[1])
	}
}

func TestOnlyTheHostChangesMapAndResources(t *testing.T) {
	l := joined(t, "u1", "u2")

	wantReject(t, l.SetMap("u2", "base:quadrant"), "only the Host")
	wantReject(t, l.SetStartingResources("u2", map[string]int{"base:credits": 1, "base:materials": 1}), "only the Host")
	wantReject(t, l.Start("u2"), "only the Host")

	if err := l.SetMap("u1", "base:quadrant"); err != nil || l.Map != "base:quadrant" || l.MaxSeats() != 3 {
		t.Errorf("SetMap: %v, map %q max %d", err, l.Map, l.MaxSeats())
	}
	wantReject(t, l.SetMap("u1", "base:nowhere"), "unknown map base:nowhere")
	wantReject(t, l.SetMap("u1", "base:solo"), "base:solo has 1 start, but 2 players are seated")
}

func TestStartingResourcesMustNameEveryResourceInRange(t *testing.T) {
	l := joined(t, "u1")

	if err := l.SetStartingResources("u1", map[string]int{"base:credits": 0, "base:materials": 1500}); err != nil {
		t.Errorf("valid amounts rejected: %v", err)
	}
	wantReject(t, l.SetStartingResources("u1", map[string]int{"base:credits": 5}), "missing base:materials")
	wantReject(t, l.SetStartingResources("u1", map[string]int{"base:credits": 5, "base:materials": 5, "base:gold": 5}), "unknown Resource base:gold")
	wantReject(t, l.SetStartingResources("u1", map[string]int{"base:credits": 3001, "base:materials": 5}), "base:credits must be a whole number from 0 to its Stockpile cap, 3000")
	if l.StartingResources["base:materials"] != 1500 {
		t.Errorf("a rejected change must not apply, got %v", l.StartingResources)
	}
}

func TestOnlyAFactionChangeClearsAReadyFlagAndOnlyTheChangers(t *testing.T) {
	l := joined(t, "u1", "u2")
	_ = l.SetReady("u2", true)
	if err := l.SetMap("u1", "base:quadrant"); err != nil {
		t.Fatal(err)
	}
	_ = l.Join("u3", "u3")
	_ = l.SetReady("u3", true)

	_ = l.SetStartingResources("u1", map[string]int{"base:credits": 1, "base:materials": 2})
	_ = l.SetFaction("u2", "base:covenant") // the current value
	if !l.Seats[1].Ready || !l.Seats[2].Ready {
		t.Errorf("a game setting or no-op change cleared ready flags: %+v", l.Seats)
	}

	if err := l.SetFaction("u2", "base:unsc"); err != nil {
		t.Fatal(err)
	}
	if l.Seats[1].Ready || !l.Seats[2].Ready {
		t.Errorf("u2's Faction change should clear only u2: %+v", l.Seats)
	}
}

func TestStartNeedsEveryoneButTheHostReadyAndMinPlayers(t *testing.T) {
	l := joined(t, "u1")
	wantReject(t, l.Start("u1"), "needs at least 2 players")

	_ = l.Join("u2", "u2")
	wantReject(t, l.Start("u1"), "not every Seat is ready")

	_ = l.SetReady("u2", true)
	if err := l.Start("u1"); err != nil {
		t.Errorf("Start with everyone but the unready Host ready: %v", err)
	}

	// The role passes on, and the new Host's flag stops counting.
	_ = l.SetMap("u1", "base:quadrant")
	_ = l.Join("u3", "u3")
	_ = l.SetReady("u3", true)
	_ = l.SetReady("u2", false)
	l.Leave("u1")
	if err := l.Start("u2"); err != nil {
		t.Errorf("Start by an unready new Host: %v", err)
	}
}
