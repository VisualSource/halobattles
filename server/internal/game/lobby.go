package game

import (
	"errors"
	"maps"
	"slices"
)

// ErrLobbyFull rejects a join once every Seat is taken.
var ErrLobbyFull = errors.New("every Seat is taken")

// Seat is a player's place in a Match.
type Seat struct {
	User        string
	DisplayName string
	Faction     string
	Ready       bool
}

// LobbyDefaults are the settings a new lobby starts with: the first map by
// id, the Ruleset's startingResources and the first Faction by id.
type LobbyDefaults struct {
	Map               string
	MaxSeats          int // the map's number of starts
	Faction           string
	StartingResources map[string]int
}

// Lobby is a Match before Start.
type Lobby struct {
	Map               string
	MaxSeats          int
	StartingResources map[string]int
	Seats             []Seat // longest held first
	defaultFaction    string
}

func NewLobby(d LobbyDefaults) *Lobby {
	return &Lobby{
		Map:               d.Map,
		MaxSeats:          d.MaxSeats,
		StartingResources: maps.Clone(d.StartingResources),
		defaultFaction:    d.Faction,
	}
}

// Host is the longest-held Seat, so the role passes on when the Host
// leaves. It is "" in an empty lobby.
func (l *Lobby) Host() string {
	if len(l.Seats) == 0 {
		return ""
	}
	return l.Seats[0].User
}

func (l *Lobby) seatIndex(user string) int {
	return slices.IndexFunc(l.Seats, func(s Seat) bool { return s.User == user })
}

// CanJoin reports whether user already has a Seat or one is free.
func (l *Lobby) CanJoin(user string) bool {
	return l.seatIndex(user) >= 0 || len(l.Seats) < l.MaxSeats
}

// Join seats user on the default Faction, not ready. A seated user keeps
// their Seat.
func (l *Lobby) Join(user, displayName string) error {
	if l.seatIndex(user) >= 0 {
		return nil
	}
	if len(l.Seats) >= l.MaxSeats {
		return ErrLobbyFull
	}
	l.Seats = append(l.Seats, Seat{User: user, DisplayName: displayName, Faction: l.defaultFaction})
	return nil
}

// Leave frees user's Seat, if they have one.
func (l *Lobby) Leave(user string) {
	if i := l.seatIndex(user); i >= 0 {
		l.Seats = slices.Delete(l.Seats, i, i+1)
	}
}
