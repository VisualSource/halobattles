package game

import (
	"errors"
	"fmt"
	"maps"
	"slices"
)

// ErrLobbyFull rejects a join once every Seat is taken.
var ErrLobbyFull = errors.New("every Seat is taken")

var (
	errNoSeat  = errors.New("you have no Seat in this Match")
	errNotHost = errors.New("only the Host can do that")
)

// Seat is a player's place in a Match.
type Seat struct {
	User        string
	DisplayName string
	Faction     string
	Ready       bool
}

// LobbyMap is what the lobby needs to know about a map.
type LobbyMap struct {
	Starts     int // the Seat cap
	MinPlayers int
}

// LobbyContent is the content a lobby checks its settings against.
type LobbyContent struct {
	Maps              map[string]LobbyMap
	Factions          []string
	Resources         []string
	StartingResources map[string]int // the Ruleset's defaults
	Caps              map[string]int // the Ruleset's Stockpile caps
}

// Lobby is a Match before Start.
type Lobby struct {
	Map               string
	StartingResources map[string]int
	Seats             []Seat // longest held first
	content           LobbyContent
}

// NewLobby starts on the first map by id and the Ruleset's
// startingResources; joiners start on the first Faction by id.
func NewLobby(c LobbyContent) *Lobby {
	return &Lobby{
		Map:               slices.Min(slices.Collect(maps.Keys(c.Maps))),
		StartingResources: maps.Clone(c.StartingResources),
		content:           c,
	}
}

// MaxSeats is the selected map's number of starts.
func (l *Lobby) MaxSeats() int { return l.content.Maps[l.Map].Starts }

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

func (l *Lobby) HasSeat(user string) bool { return l.seatIndex(user) >= 0 }

// CanJoin reports whether user already has a Seat or one is free.
func (l *Lobby) CanJoin(user string) bool {
	return l.HasSeat(user) || len(l.Seats) < l.MaxSeats()
}

// Join seats user on the first Faction by id, not ready. A seated user
// keeps their Seat.
func (l *Lobby) Join(user, displayName string) error {
	if l.HasSeat(user) {
		return nil
	}
	if len(l.Seats) >= l.MaxSeats() {
		return ErrLobbyFull
	}
	l.Seats = append(l.Seats, Seat{User: user, DisplayName: displayName, Faction: slices.Min(l.content.Factions)})
	return nil
}

// Leave frees user's Seat, if they have one.
func (l *Lobby) Leave(user string) {
	if i := l.seatIndex(user); i >= 0 {
		l.Seats = slices.Delete(l.Seats, i, i+1)
	}
}

func (l *Lobby) mustBeHost(user string) error {
	if l.seatIndex(user) < 0 {
		return errNoSeat
	}
	if user != l.Host() {
		return errNotHost
	}
	return nil
}

// SetFaction picks user's own Faction and clears only their ready flag.
// Mirror matches are allowed.
func (l *Lobby) SetFaction(user, faction string) error {
	i := l.seatIndex(user)
	if i < 0 {
		return errNoSeat
	}
	if !slices.Contains(l.content.Factions, faction) {
		return fmt.Errorf("unknown Faction %s", faction)
	}
	if l.Seats[i].Faction != faction {
		l.Seats[i].Faction = faction
		l.Seats[i].Ready = false
	}
	return nil
}

func (l *Lobby) SetReady(user string, ready bool) error {
	i := l.seatIndex(user)
	if i < 0 {
		return errNoSeat
	}
	l.Seats[i].Ready = ready
	return nil
}

// SetMap is Host only, and the map must have a start for every seated
// player.
func (l *Lobby) SetMap(user, id string) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	m, ok := l.content.Maps[id]
	if !ok {
		return fmt.Errorf("unknown map %s", id)
	}
	if m.Starts < len(l.Seats) {
		starts := "starts"
		if m.Starts == 1 {
			starts = "start"
		}
		return fmt.Errorf("%s has %d %s, but %d players are seated", id, m.Starts, starts, len(l.Seats))
	}
	l.Map = id
	return nil
}

// SetStartingResources is Host only, and must name every Resource with a
// whole number from 0 to its Stockpile cap.
func (l *Lobby) SetStartingResources(user string, amounts map[string]int) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	for _, r := range slices.Sorted(maps.Keys(amounts)) {
		if !slices.Contains(l.content.Resources, r) {
			return fmt.Errorf("unknown Resource %s", r)
		}
		if a, cap := amounts[r], l.content.Caps[r]; a < 0 || a > cap {
			return fmt.Errorf("%s must be a whole number from 0 to its Stockpile cap, %d", r, cap)
		}
	}
	for _, r := range l.content.Resources {
		if _, ok := amounts[r]; !ok {
			return fmt.Errorf("starting resources are missing %s", r)
		}
	}
	l.StartingResources = maps.Clone(amounts)
	return nil
}

// Start is Host only, once every other Seat is ready and the map's
// minPlayers are seated. The Host's own flag doesn't count.
func (l *Lobby) Start(user string) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	if min := l.content.Maps[l.Map].MinPlayers; len(l.Seats) < min {
		return fmt.Errorf("%s needs at least %d players", l.Map, min)
	}
	if slices.ContainsFunc(l.Seats[1:], func(s Seat) bool { return !s.Ready }) {
		return errors.New("not every Seat is ready")
	}
	return nil
}
