package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/heroiclabs/nakama-common/runtime"
)

const (
	matchModule = "halobattles"
	tickRate    = 5
	// creatorGraceTicks is how long a new Match waits for its creator to join.
	creatorGraceTicks = 30 * tickRate
)

// match is the authoritative Match handler. Its methods are only ever called
// through safeMatch.
type match struct {
	content *content.Content
}

type matchState struct {
	lobby *game.Lobby
	// sessions maps each seated user to their current session. A reload can
	// join the new session before the old one's leave arrives, and that
	// stale leave must not free the Seat.
	sessions map[string]string
	joined   bool // someone has joined; an empty lobby after that closes
}

func (m *match) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	doc := m.content.Doc
	firstMap := slices.Min(slices.Collect(maps.Keys(doc.Maps)))
	s := &matchState{
		lobby: game.NewLobby(game.LobbyDefaults{
			Map:               firstMap,
			MaxSeats:          len(doc.Maps[firstMap].Starts),
			Faction:           slices.Min(slices.Collect(maps.Keys(doc.Factions))),
			StartingResources: doc.Rulesets["base:rules"].StartingResources,
		}),
		sessions: map[string]string{},
	}
	return s, tickRate, s.label()
}

func (m *match) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	s := state.(*matchState)
	if !s.lobby.CanJoin(presence.GetUserId()) {
		return s, false, game.ErrLobbyFull.Error()
	}
	return s, true, ""
}

func (m *match) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*matchState)
	names := displayNames(ctx, logger, nk, presences)
	var kick []runtime.Presence
	for _, p := range presences {
		// Two joins can be admitted for the last Seat; the second loses.
		if err := s.lobby.Join(p.GetUserId(), names[p.GetUserId()]); err != nil {
			kick = append(kick, p)
			continue
		}
		s.sessions[p.GetUserId()] = p.GetSessionId()
		s.joined = true
	}
	if len(kick) > 0 {
		_ = dispatcher.MatchKick(kick)
	}
	s.lobbyChanged(logger, dispatcher)
	return s
}

func (m *match) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*matchState)
	for _, p := range presences {
		if s.sessions[p.GetUserId()] == p.GetSessionId() {
			delete(s.sessions, p.GetUserId())
			s.lobby.Leave(p.GetUserId())
		}
	}
	s.lobbyChanged(logger, dispatcher)
	return s
}

func (m *match) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*matchState)
	if len(s.lobby.Seats) == 0 && (s.joined || tick > creatorGraceTicks) {
		return nil // returning nil ends the Match
	}
	return s
}

func (m *match) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (m *match) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

// lobbyChanged sends LobbyState whole to everyone and refreshes the label.
func (s *matchState) lobbyChanged(logger runtime.Logger, dispatcher runtime.MatchDispatcher) {
	if err := dispatcher.BroadcastMessage(int64(wire.OpLobbyState), encodeLobby(s.lobby), nil, nil, true); err != nil {
		logger.Error("broadcast LobbyState: %v", err)
	}
	if err := dispatcher.MatchLabelUpdate(s.label()); err != nil {
		logger.Error("update label: %v", err)
	}
}

// label is what the open list filters on.
func (s *matchState) label() string {
	b, _ := json.Marshal(struct {
		Phase string `json:"phase"`
		Map   string `json:"map"`
		Seats int    `json:"seats"`
		Max   int    `json:"max"`
	}{"lobby", s.lobby.Map, len(s.lobby.Seats), s.lobby.MaxSeats})
	return string(b)
}

func encodeLobby(l *game.Lobby) []byte {
	t := &wire.LobbyStateT{Phase: wire.PhaseLobby, Host: l.Host(), Map: l.Map}
	// Sorted, since the vector is keyed by resource.
	for _, r := range slices.Sorted(maps.Keys(l.StartingResources)) {
		t.StartingResources = append(t.StartingResources, &wire.AmountT{Resource: r, Amount: uint32(l.StartingResources[r])})
	}
	for _, s := range l.Seats {
		t.Seats = append(t.Seats, &wire.SeatT{User: s.User, DisplayName: s.DisplayName, Faction: s.Faction, Ready: s.Ready})
	}
	b := flatbuffers.NewBuilder(256)
	b.Finish(t.Pack(b))
	return b.FinishedBytes()
}

func displayNames(ctx context.Context, logger runtime.Logger, nk runtime.NakamaModule, presences []runtime.Presence) map[string]string {
	ids := make([]string, len(presences))
	for i, p := range presences {
		ids[i] = p.GetUserId()
	}
	names := map[string]string{}
	users, err := nk.UsersGetId(ctx, ids, nil)
	if err != nil {
		logger.Error("look up display names: %v", err)
	}
	for _, u := range users {
		names[u.Id] = u.DisplayName
	}
	return names
}
