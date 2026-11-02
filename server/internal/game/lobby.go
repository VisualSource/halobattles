package game

import (
	"errors"
	"fmt"
	"maps"
	"slices"
)

// ErrLobbyFull rejects a join once every Seat and Spectator place is taken.
var ErrLobbyFull = errors.New("every Seat is taken")

// MaxSpectators is how many can watch a Match, besides its eliminated players.
const MaxSpectators = 6

var errSpectatorsFull = errors.New("every Spectator place is taken")

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
	Bot         string // a Bot's difficulty id; "" for a player
	Team        int    // 1 to MaxTeams with Teams on; 0 with them off
}

// MaxTeams is how many Teams a lobby can split into.
const MaxTeams = 4

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
	StartingResources map[string]int      // the Ruleset's defaults
	Caps              map[string]int      // the Ruleset's Stockpile caps
	Difficulties      []string            // Bot difficulty ids
	BotNames          map[string][]string // per Faction, taken in order
}

// LobbySpectator is someone in the lobby who'll watch rather than play.
type LobbySpectator struct {
	User        string
	DisplayName string
}

// Lobby is a Match before Start.
type Lobby struct {
	Map               string
	StartingResources map[string]int
	Seats             []Seat           // longest held first
	Spectators        []LobbySpectator // longest here first
	Teams             bool             // each Seat picks a Team; off is a free-for-all
	content           LobbyContent
	bots              int      // Bots added so far, for their Seat user ids
	order             []string // players and Spectators, longest here first: the Host is the first
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

// Host is whoever has been in the lobby longest, seated or spectating, so
// the role passes on when the Host leaves, and stays with a Host who
// switches to spectating; a Bot is never Host. It is "" in a lobby with
// nobody in it.
func (l *Lobby) Host() string {
	if len(l.order) > 0 {
		return l.order[0]
	}
	return ""
}

// People counts everyone in the lobby but Bots: players and Spectators.
func (l *Lobby) People() int { return len(l.order) }

// Players counts the Seats held by players, not Bots.
func (l *Lobby) Players() int {
	n := 0
	for _, s := range l.Seats {
		if s.Bot == "" {
			n++
		}
	}
	return n
}

// AddBot is Host only: a Bot of faction at difficulty takes an empty Seat,
// always Ready, named by the next of its Faction's names no Seat has.
func (l *Lobby) AddBot(user, faction, difficulty string) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	switch {
	case len(l.Seats) >= l.MaxSeats():
		return ErrLobbyFull
	case !slices.Contains(l.content.Factions, faction):
		return fmt.Errorf("unknown Faction %s", faction)
	case !slices.Contains(l.content.Difficulties, difficulty):
		return fmt.Errorf("unknown difficulty %s", difficulty)
	}
	l.bots++
	name := fmt.Sprintf("Bot %d", len(l.Seats)+1)
	for _, n := range l.content.BotNames[faction] {
		if !slices.ContainsFunc(l.Seats, func(s Seat) bool { return s.DisplayName == n }) {
			name = n
			break
		}
	}
	l.Seats = append(l.Seats, Seat{User: fmt.Sprintf("bot:%d", l.bots), DisplayName: name, Faction: faction, Ready: true, Bot: difficulty, Team: l.openTeam()})
	return nil
}

// openTeam is the Team a new Seat joins: with Teams on, the smaller of
// Teams 1 and 2, Team 1 on a tie; 0 with them off.
func (l *Lobby) openTeam() int {
	if !l.Teams {
		return 0
	}
	n := map[int]int{}
	for _, s := range l.Seats {
		n[s.Team]++
	}
	if n[2] < n[1] {
		return 2
	}
	return 1
}

// SetTeams is Host only: on splits the Seats between Teams 1 and 2 in turn,
// off makes the Match a free-for-all.
func (l *Lobby) SetTeams(user string, on bool) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	l.Teams = on
	for i := range l.Seats {
		l.Seats[i].Team = 0
		if on {
			l.Seats[i].Team = i%2 + 1
		}
	}
	return nil
}

// SetTeam moves a Seat to team: user's own, or, for the Host, a Bot's.
// Changing a player's Team clears their ready flag.
func (l *Lobby) SetTeam(user, seat string, team int) error {
	i := l.seatIndex(seat)
	switch {
	case !l.Teams:
		return errors.New("Teams are off")
	case team < 1 || team > MaxTeams:
		return fmt.Errorf("pick a Team from 1 to %d", MaxTeams)
	case i < 0:
		return errors.New("no such Seat")
	case seat != user && l.Seats[i].Bot == "":
		return errors.New("you can only change your own Team")
	case seat != user:
		if err := l.mustBeHost(user); err != nil {
			return err
		}
	}
	if l.Seats[i].Team != team {
		l.Seats[i].Team = team
		l.Seats[i].Ready = l.Seats[i].Bot != ""
	}
	return nil
}

// RemoveBot is Host only, and frees a Bot's Seat.
func (l *Lobby) RemoveBot(user, bot string) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	i := l.seatIndex(bot)
	if i < 0 || l.Seats[i].Bot == "" {
		return errors.New("that Seat isn't a Bot's")
	}
	l.Seats = slices.Delete(l.Seats, i, i+1)
	return nil
}

func (l *Lobby) seatIndex(user string) int {
	return slices.IndexFunc(l.Seats, func(s Seat) bool { return s.User == user })
}

func (l *Lobby) HasSeat(user string) bool { return l.seatIndex(user) >= 0 }

func (l *Lobby) spectatorIndex(user string) int {
	return slices.IndexFunc(l.Spectators, func(s LobbySpectator) bool { return s.User == user })
}

// IsSpectator reports whether user is watching rather than playing.
func (l *Lobby) IsSpectator(user string) bool { return l.spectatorIndex(user) >= 0 }

// IsMember reports whether user is in the lobby, seated or spectating.
func (l *Lobby) IsMember(user string) bool { return l.HasSeat(user) || l.IsSpectator(user) }

// CanJoin reports whether user is already in the lobby, or a Seat or a
// Spectator place is free.
func (l *Lobby) CanJoin(user string) bool {
	return l.IsMember(user) || len(l.Seats) < l.MaxSeats() || len(l.Spectators) < MaxSpectators
}

// Join seats user on the first Faction by id, not ready, or with every
// Seat taken, makes them a Spectator. Someone already in keeps their place.
func (l *Lobby) Join(user, displayName string) error {
	switch {
	case l.IsMember(user):
		return nil
	case len(l.Seats) < l.MaxSeats():
		l.Seats = append(l.Seats, Seat{User: user, DisplayName: displayName, Faction: slices.Min(l.content.Factions), Team: l.openTeam()})
	case len(l.Spectators) < MaxSpectators:
		l.Spectators = append(l.Spectators, LobbySpectator{User: user, DisplayName: displayName})
	default:
		return ErrLobbyFull
	}
	l.order = append(l.order, user)
	return nil
}

// Leave frees user's Seat or Spectator place.
func (l *Lobby) Leave(user string) {
	if i := l.seatIndex(user); i >= 0 {
		l.Seats = slices.Delete(l.Seats, i, i+1)
	}
	if i := l.spectatorIndex(user); i >= 0 {
		l.Spectators = slices.Delete(l.Spectators, i, i+1)
	}
	l.order = slices.DeleteFunc(l.order, func(u string) bool { return u == user })
}

// Spectate gives up user's Seat to watch; a Host stays Host.
func (l *Lobby) Spectate(user string) error {
	i := l.seatIndex(user)
	switch {
	case i < 0:
		return errNoSeat
	case len(l.Spectators) >= MaxSpectators:
		return errSpectatorsFull
	}
	l.Spectators = append(l.Spectators, LobbySpectator{User: user, DisplayName: l.Seats[i].DisplayName})
	l.Seats = slices.Delete(l.Seats, i, i+1)
	return nil
}

// TakeSeat seats a Spectator in a free Seat, on the first Faction by id,
// not ready.
func (l *Lobby) TakeSeat(user string) error {
	i := l.spectatorIndex(user)
	switch {
	case i < 0:
		return errors.New("you aren't spectating")
	case len(l.Seats) >= l.MaxSeats():
		return ErrLobbyFull
	}
	l.Seats = append(l.Seats, Seat{User: user, DisplayName: l.Spectators[i].DisplayName, Faction: slices.Min(l.content.Factions), Team: l.openTeam()})
	l.Spectators = slices.Delete(l.Spectators, i, i+1)
	return nil
}

func (l *Lobby) mustBeHost(user string) error {
	if !l.IsMember(user) {
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
// minPlayers are seated, Bots counting. The Host's own flag doesn't count.
func (l *Lobby) Start(user string) error {
	if err := l.mustBeHost(user); err != nil {
		return err
	}
	if min := l.content.Maps[l.Map].MinPlayers; len(l.Seats) < min {
		return fmt.Errorf("%s needs at least %d players", l.Map, min)
	}
	if slices.ContainsFunc(l.Seats, func(s Seat) bool { return !s.Ready && s.User != user }) {
		return errors.New("not every Seat is ready")
	}
	if l.Teams {
		teams := map[int]bool{}
		for _, s := range l.Seats {
			teams[s.Team] = true
		}
		if len(teams) < 2 {
			return errors.New("Teams need players on at least 2 of them")
		}
	}
	return nil
}
