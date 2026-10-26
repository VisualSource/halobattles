package game

import (
	"errors"
	"testing"
)

func newTestLobby() *Lobby {
	return NewLobby(LobbyDefaults{
		Map:               "base:quadrant",
		MaxSeats:          3,
		Faction:           "base:covenant",
		StartingResources: map[string]int{"base:credits": 1000},
	})
}

func seatUsers(l *Lobby) []string {
	var users []string
	for _, s := range l.Seats {
		users = append(users, s.User)
	}
	return users
}

func TestFirstJoinerIsHostWithDefaults(t *testing.T) {
	l := newTestLobby()

	if err := l.Join("u1", "Chief"); err != nil {
		t.Fatal(err)
	}

	if l.Host() != "u1" {
		t.Errorf("host = %q, want u1", l.Host())
	}
	want := Seat{User: "u1", DisplayName: "Chief", Faction: "base:covenant", Ready: false}
	if l.Seats[0] != want {
		t.Errorf("seat = %+v, want %+v", l.Seats[0], want)
	}
	if l.Map != "base:quadrant" || l.StartingResources["base:credits"] != 1000 {
		t.Errorf("lobby settings = %q %v", l.Map, l.StartingResources)
	}
}

func TestJoinIsRejectedOnceEverySeatIsTaken(t *testing.T) {
	l := newTestLobby()
	for _, u := range []string{"u1", "u2", "u3"} {
		if err := l.Join(u, u); err != nil {
			t.Fatalf("join %s: %v", u, err)
		}
	}

	if l.CanJoin("u4") {
		t.Error("CanJoin(u4) = true with every Seat taken")
	}
	if err := l.Join("u4", "u4"); !errors.Is(err, ErrLobbyFull) {
		t.Errorf("join u4 = %v, want ErrLobbyFull", err)
	}
	if !l.CanJoin("u2") || l.Join("u2", "u2") != nil || len(l.Seats) != 3 {
		t.Errorf("a seated player joining again should keep their one Seat, seats = %v", seatUsers(l))
	}
}

func TestLeavingFreesTheSeatAndHostPassesToLongestHeld(t *testing.T) {
	l := newTestLobby()
	for _, u := range []string{"u1", "u2", "u3"} {
		_ = l.Join(u, u)
	}

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
