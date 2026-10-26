package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"maps"
	"math/rand/v2"
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
	content *content.Content
	phase   wire.Phase
	lobby   *game.Lobby
	seed    uint64      // every random choice in the Match draws from this
	play    *game.State // the running Match, from Start on
	// startTick is the tick of Start, Match Time 0.
	startTick int64
	// presences maps each seated user to their current presence. A reload
	// can join the new session before the old one's leave arrives, and that
	// stale leave must not free the Seat.
	presences map[string]runtime.Presence
	lastSeq   map[string]uint32    // the last command seq processed per user
	sent      map[string]game.View // the last View sent per user, to diff against
	joined    bool                 // someone has joined; an empty lobby after that closes
}

func (m *match) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	doc := m.content.Doc
	lc := game.LobbyContent{
		Maps:              map[string]game.LobbyMap{},
		Factions:          slices.Collect(maps.Keys(doc.Factions)),
		Resources:         slices.Collect(maps.Keys(doc.Resources)),
		StartingResources: doc.Rulesets[game.RulesetID].StartingResources,
	}
	for id, gm := range doc.Maps {
		lc.Maps[id] = game.LobbyMap{Starts: len(gm.Starts), MinPlayers: gm.MinPlayers}
	}
	s := &matchState{
		phase:     wire.PhaseLobby,
		lobby:     game.NewLobby(lc),
		content:   m.content,
		seed:      rand.Uint64(),
		presences: map[string]runtime.Presence{},
		lastSeq:   map[string]uint32{},
		sent:      map[string]game.View{},
	}
	return s, tickRate, s.label()
}

func (m *match) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	s := state.(*matchState)
	switch {
	case s.phase != wire.PhaseLobby && !s.lobby.HasSeat(presence.GetUserId()):
		return s, false, "this Match has started"
	case !s.lobby.CanJoin(presence.GetUserId()):
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
		// After Start only seated users get this far, and Join keeps them.
		if err := s.lobby.Join(p.GetUserId(), names[p.GetUserId()]); err != nil {
			kick = append(kick, p)
			continue
		}
		s.presences[p.GetUserId()] = p
		s.lastSeq[p.GetUserId()] = 0 // a new session numbers its commands from 1
		s.joined = true
	}
	if len(kick) > 0 {
		_ = dispatcher.MatchKick(kick)
	}
	s.lobbyChanged(logger, dispatcher)
	if s.play != nil {
		s.setTime(tick)
		s.sendViews(logger, dispatcher, presences)
	}
	return s
}

func (m *match) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*matchState)
	for _, p := range presences {
		if !s.isCurrent(p) {
			continue
		}
		delete(s.presences, p.GetUserId())
		// After Start a player keeps their Seat; Forfeits come later.
		if s.phase == wire.PhaseLobby {
			s.lobby.Leave(p.GetUserId())
		}
	}
	s.lobbyChanged(logger, dispatcher)
	return s
}

func (m *match) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*matchState)
	if s.phase == wire.PhaseLobby && len(s.lobby.Seats) == 0 && (s.joined || tick > creatorGraceTicks) {
		return nil // returning nil ends the Match
	}
	if s.play != nil {
		s.setTime(tick)
	}
	wasLobby := s.play == nil
	if s.handleCommands(logger, dispatcher, tick, messages) {
		s.lobbyChanged(logger, dispatcher)
	}
	if wasLobby && s.play != nil {
		s.sendViews(logger, dispatcher, slices.Collect(maps.Values(s.presences)))
	}
	if s.play != nil {
		s.advance(logger, dispatcher)
	}
	return s
}

// advance fires what's due, then sends each connected player a ViewDelta
// if their View changed since the last one they were sent.
// sides are a Battle's players: a neutral defender has nobody to tell.
func sides(b *game.Battle) []int {
	if b.Defender == game.Neutral {
		return []int{b.Attacker}
	}
	return []int{b.Attacker, b.Defender}
}

// sendTo sends an event to the connected players among seats. Anyone
// disconnected catches up from their ViewFull.
func (s *matchState) sendTo(logger runtime.Logger, dispatcher runtime.MatchDispatcher, op wire.Op, data []byte, seats ...int) {
	var to []runtime.Presence
	for _, seat := range seats {
		if p := s.presences[s.play.Players[seat].User]; p != nil {
			to = append(to, p)
		}
	}
	if len(to) == 0 {
		return
	}
	if err := dispatcher.BroadcastMessage(int64(op), data, to, nil, true); err != nil {
		logger.Error("send %s: %v", op, err)
	}
}

func (s *matchState) advance(logger runtime.Logger, dispatcher runtime.MatchDispatcher) {
	ev := s.play.Advance(&s.content.Doc, s.play.Time)
	for _, c := range ev.Captures {
		t := &wire.PlanetCapturedT{MatchTime: s.play.Time, Planet: c.Planet, From: int8(c.From), To: int8(c.To)}
		s.sendTo(logger, dispatcher, wire.OpPlanetCaptured, finish(t), c.Viewers...)
	}
	for _, b := range ev.Started {
		t := &wire.BattleStartedT{
			MatchTime: s.play.Time, Battle: b.ID, Planet: b.Planet, Attacker: int8(b.Attacker), Defender: int8(b.Defender),
			Started: b.Started, RoundMs: uint32(b.RoundMs), Roster: roster(b.Result.Roster),
		}
		s.sendTo(logger, dispatcher, wire.OpBattleStarted, finish(t), sides(b)...)
	}
	for _, r := range ev.Rounds {
		var actions []*wire.BattleActionT
		for _, a := range r.Battle.Result.Rounds[r.Round] {
			actions = append(actions, &wire.BattleActionT{
				Actor: a.Actor, Target: a.Target, Weapon: a.Weapon, ShieldDmg: float32(a.ShieldDmg),
				ArmorDmg: float32(a.ArmorDmg), HpDmg: float32(a.HPDmg), Killed: a.Killed,
			})
		}
		t := &wire.BattleRoundT{MatchTime: s.play.Time, Battle: r.Battle.ID, Planet: r.Battle.Planet, Round: uint16(r.Round + 1), Actions: actions}
		s.sendTo(logger, dispatcher, wire.OpBattleRound, finish(t), sides(r.Battle)...)
	}
	for _, e := range ev.Ended {
		t := &wire.BattleEndedT{MatchTime: s.play.Time, Battle: e.Battle, Planet: e.Planet, Winner: int8(e.Winner)}
		s.sendTo(logger, dispatcher, wire.OpBattleEnded, finish(t), e.Viewers...)
	}
	for _, paid := range ev.Paydays {
		t := &wire.PaydayPaidT{MatchTime: s.play.Time, Net: amounts(paid.Net)}
		s.sendTo(logger, dispatcher, wire.OpPaydayPaid, finish(t), paid.Seat)
	}
	for seat, pl := range s.play.Players {
		p := s.presences[pl.User]
		if p == nil {
			continue
		}
		v := s.play.View(&s.content.Doc, seat)
		d, changed := game.Diff(s.sent[pl.User], v)
		if !changed {
			continue
		}
		s.sent[pl.User] = v
		if err := dispatcher.BroadcastMessage(int64(wire.OpViewDelta), encodeDelta(d), []runtime.Presence{p}, nil, true); err != nil {
			logger.Error("send ViewDelta: %v", err)
		}
	}
}

func (s *matchState) setTime(tick int64) {
	s.play.Time = (tick - s.startTick) * 1000 / tickRate
}

// start builds the Match from the lobby: Match Time 0 is this tick.
func (s *matchState) start(tick int64) error {
	var seats []game.SeatSetup
	for _, seat := range s.lobby.Seats {
		seats = append(seats, game.SeatSetup{User: seat.User, DisplayName: seat.DisplayName, Faction: seat.Faction})
	}
	g, err := game.StartMatch(&s.content.Doc, s.lobby.Map, seats, s.lobby.StartingResources, s.seed)
	if err != nil {
		return err
	}
	s.play, s.phase, s.startTick = g, wire.PhasePlay, tick
	return nil
}

// isCurrent reports whether p is its user's current session.
func (s *matchState) isCurrent(p runtime.Presence) bool {
	cur := s.presences[p.GetUserId()]
	return cur != nil && cur.GetSessionId() == p.GetSessionId()
}

// sendViews sends each of presences their own ViewFull.
func (s *matchState) sendViews(logger runtime.Logger, dispatcher runtime.MatchDispatcher, presences []runtime.Presence) {
	for _, p := range presences {
		seat := s.seat(p.GetUserId())
		if seat < 0 {
			continue
		}
		v := s.play.View(&s.content.Doc, seat)
		s.sent[p.GetUserId()] = v
		data := encodeView(v, s.content.Hash)
		if err := dispatcher.BroadcastMessage(int64(wire.OpViewFull), data, []runtime.Presence{p}, nil, true); err != nil {
			logger.Error("send ViewFull: %v", err)
		}
	}
}

func (m *match) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (m *match) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

// lobbyChanged sends LobbyState whole to everyone and refreshes the label.
func (s *matchState) lobbyChanged(logger runtime.Logger, dispatcher runtime.MatchDispatcher) {
	if err := dispatcher.BroadcastMessage(int64(wire.OpLobbyState), s.encodeLobby(), nil, nil, true); err != nil {
		logger.Error("broadcast LobbyState: %v", err)
	}
	if err := dispatcher.MatchLabelUpdate(s.label()); err != nil {
		logger.Error("update label: %v", err)
	}
}

var phaseNames = map[wire.Phase]string{wire.PhaseLobby: "lobby", wire.PhasePlay: "play", wire.PhaseResults: "results"}

// label is what the open list filters on.
func (s *matchState) label() string {
	b, _ := json.Marshal(struct {
		Phase string `json:"phase"`
		Map   string `json:"map"`
		Seats int    `json:"seats"`
		Max   int    `json:"max"`
	}{phaseNames[s.phase], s.lobby.Map, len(s.lobby.Seats), s.lobby.MaxSeats()})
	return string(b)
}

func (s *matchState) encodeLobby() []byte {
	l := s.lobby
	t := &wire.LobbyStateT{Phase: s.phase, Host: l.Host(), Map: l.Map}
	t.StartingResources = amounts(l.StartingResources)
	for _, seat := range l.Seats {
		t.Seats = append(t.Seats, &wire.SeatT{
			User: seat.User, DisplayName: seat.DisplayName, Faction: seat.Faction, Ready: seat.Ready,
			LastSeq: s.lastSeq[seat.User],
		})
	}
	return finish(t)
}

func encodeView(v game.View, contentHash string) []byte {
	return finish(&wire.ViewFullT{
		MatchTime: v.Time, ContentHash: contentHash, Ruleset: game.RulesetID, Map: v.Map, You: uint8(v.You),
		Players: players(v.Players), Planets: planets(v.Planets), Economy: economy(&v.Economy), Armies: armies(v.Armies),
		Battles: battles(v.Battles),
	})
}

func encodeDelta(d game.Delta) []byte {
	return finish(&wire.ViewDeltaT{
		MatchTime: d.Time, Players: players(d.Players), Planets: planets(d.Planets),
		RemovedPlanets: d.RemovedPlanets, Economy: economy(d.Economy),
		Armies: armies(d.Armies), RemovedArmies: d.RemovedArmies,
		Battles: battles(d.Battles), RemovedBattles: d.RemovedBattles,
	})
}

func battles(bs []game.BattleView) []*wire.BattleViewT {
	var out []*wire.BattleViewT
	for _, b := range bs { // already sorted by id, as the (key) needs
		out = append(out, &wire.BattleViewT{
			Id: b.ID, Planet: b.Planet, Attacker: int8(b.Attacker), Defender: int8(b.Defender),
			Started: b.Started, RoundMs: uint32(b.RoundMs), Round: uint16(b.Round), Roster: roster(b.Roster),
		})
	}
	return out
}

func roster(cs []game.Combatant) []*wire.CombatantT {
	var out []*wire.CombatantT
	for _, c := range cs {
		out = append(out, &wire.CombatantT{
			Id: c.ID, Side: uint8(c.Side), Unit: c.Unit,
			Shield: float32(max(0, c.Shield)), Armor: float32(max(0, c.Armor)), Hp: float32(max(0, c.HP)),
		})
	}
	return out
}

func armies(as []game.ArmyView) []*wire.ArmyViewT {
	var out []*wire.ArmyViewT
	for _, a := range as { // already sorted by id, as the (key) needs
		out = append(out, &wire.ArmyViewT{
			Id: a.ID, Owner: int8(a.Owner), Units: unitSlots(a.Units), From: a.From, To: a.To,
			Departed: a.Departed, Arrives: a.Arrives, Waiting: a.Waiting, Destination: a.Destination, ToStack: uint8(a.ToStack),
		})
	}
	return out
}

func unitSlots(st []game.UnitSlot) []*wire.UnitSlotT {
	var out []*wire.UnitSlotT
	for _, u := range st {
		out = append(out, &wire.UnitSlotT{Unit: u.Unit, Count: uint32(u.Count)})
	}
	return out
}

func players(ps []game.PlayerView) []*wire.PlayerViewT {
	var out []*wire.PlayerViewT
	for _, p := range ps {
		out = append(out, &wire.PlayerViewT{
			Seat: uint8(p.Seat), User: p.User, DisplayName: p.DisplayName, Faction: p.Faction, PlanetCount: uint16(p.PlanetCount),
		})
	}
	return out
}

func planets(ps []game.PlanetView) []*wire.PlanetViewT {
	var out []*wire.PlanetViewT
	for _, p := range ps { // already sorted by id, as the (key) needs
		pv := &wire.PlanetViewT{Id: p.ID, Owner: int8(p.Owner), Capital: p.Capital, Locked: p.Locked, Buildings: p.Buildings}
		for _, st := range p.Stacks {
			pv.Stacks = append(pv.Stacks, &wire.StackT{Slots: unitSlots(st)})
		}
		pv.Queue, pv.UnitQueue, pv.RallyStack = queueItems(p.Queue), queueItems(p.UnitQueue), uint8(p.Rally)
		out = append(out, pv)
	}
	return out
}

// queueItems encodes one or more queues, each a run of the same slot. The
// first item of each is paused when it isn't running.
func queueItems(q []game.QueueItem) []*wire.QueueItemT {
	var out []*wire.QueueItemT
	for i, it := range q {
		first := i == 0 || q[i-1].Slot != it.Slot
		out = append(out, &wire.QueueItemT{
			Id: it.ID, Slot: uint8(it.Slot), Building: it.Building, Unit: it.Unit, Started: it.Started,
			Paused: first && it.EndsAt == 0, EndsAt: it.EndsAt, Remaining: it.Remaining,
		})
	}
	return out
}

func economy(e *game.Economy) *wire.EconomyT {
	if e == nil {
		return nil
	}
	return &wire.EconomyT{
		Resources: amounts(e.Resources), CommandPointsUsed: uint32(e.CommandPointsUsed), CommandPointsCap: uint32(e.CommandPointsCap),
		PaydayStart: e.PaydayStart, PaydayEnd: e.PaydayEnd,
	}
}

// amounts is sorted, since the vector is keyed by resource.
func amounts(m map[string]int) []*wire.AmountT {
	var out []*wire.AmountT
	for _, r := range slices.Sorted(maps.Keys(m)) {
		out = append(out, &wire.AmountT{Resource: r, Amount: int32(m[r])})
	}
	return out
}

func finish(t interface {
	Pack(*flatbuffers.Builder) flatbuffers.UOffsetT
}) []byte {
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
