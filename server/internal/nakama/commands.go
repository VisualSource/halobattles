package nakama

import (
	"errors"
	"fmt"
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	"github.com/heroiclabs/nakama-common/runtime"
)

const (
	// maxCommandsPerTick keeps one player from flooding the Match's
	// 128-message input queue.
	maxCommandsPerTick = 20
	maxCommandBytes    = 4096
)

var (
	errNotLobby = errors.New("that only works in the lobby")
	errNotPlay  = errors.New("that only works during play")
)

// handleCommands validates and applies this tick's commands against the
// authoritative state, rejecting each refused one to its sender. It reports
// whether any command was accepted.
//
// Clients settle pending commands by their Seat's last_seq, which relies on
// every processed command reaching its sender: an accepted one through the
// LobbyState this triggers, a refused one through CommandRejected.
func (s *matchState) handleCommands(logger runtime.Logger, dispatcher runtime.MatchDispatcher, tick int64, messages []runtime.MatchData) bool {
	changed := false
	perUser := map[string]int{}
	for _, msg := range messages {
		user := msg.GetUserId()
		// A reloaded player's old session may still have commands queued;
		// its seqs would settle the new session's pending commands.
		if !s.isCurrent(msg) {
			continue
		}
		seq, err := s.handle(user, msg.GetOpCode(), msg.GetData(), tick, perUser[user])
		s.logCommand(user, msg.GetOpCode(), msg.GetData(), err)
		perUser[user]++
		s.lastSeq[user] = max(s.lastSeq[user], seq) // a malformed command has no seq
		if err != nil {
			s.reject(logger, dispatcher, msg, seq, err)
			continue
		}
		if s.reply != nil {
			if err := dispatcher.BroadcastMessage(int64(wire.OpDefenceLayout), s.reply, []runtime.Presence{msg}, nil, true); err != nil {
				logger.Error("send DefenceLayout: %v", err)
			}
		}
		changed = true
	}
	return changed
}

// handle decodes user's command and applies it: a player's from the socket,
// or a Bot's. A malformed FlatBuffer can panic while decoding; that rejects
// the command, not the Match.
func (s *matchState) handle(user string, op int64, data []byte, tick int64, earlier int) (seq uint32, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = errors.New("malformed command")
		}
	}()
	doc := &s.content.Doc
	s.reply = nil

	phase := wire.PhaseLobby // the phase the command works in
	var apply func(l *game.Lobby) error
	switch wire.Op(op) {
	case wire.OpAddBot:
		c := wire.GetRootAsAddBot(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.AddBot(user, string(c.Faction()), string(c.Difficulty())) }
	case wire.OpRemoveBot:
		c := wire.GetRootAsRemoveBot(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.RemoveBot(user, string(c.User())) }
	case wire.OpSpectate:
		c := wire.GetRootAsSpectate(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.Spectate(user) }
	case wire.OpTakeSeat:
		c := wire.GetRootAsTakeSeat(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.TakeSeat(user) }
	case wire.OpSetTeams:
		c := wire.GetRootAsSetTeams(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.SetTeams(user, c.On()) }
	case wire.OpSetTeam:
		c := wire.GetRootAsSetTeam(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.SetTeam(user, string(c.User()), int(c.Team())) }
	case wire.OpSetFaction:
		c := wire.GetRootAsSetFaction(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.SetFaction(user, string(c.Faction())) }
	case wire.OpSetReady:
		c := wire.GetRootAsSetReady(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.SetReady(user, c.Ready()) }
	case wire.OpSetMap:
		c := wire.GetRootAsSetMap(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error { return l.SetMap(user, string(c.Map())) }
	case wire.OpQueueBuilding:
		c := wire.GetRootAsQueueBuilding(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.QueueBuilding(doc, s.seat(user), string(c.Planet()), int(c.Slot()), string(c.Building()))
		}
	case wire.OpCancelQueueItem:
		c := wire.GetRootAsCancelQueueItem(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.CancelQueueItem(doc, s.seat(user), c.ItemId())
		}
	case wire.OpSellBuilding:
		c := wire.GetRootAsSellBuilding(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SellBuilding(doc, s.seat(user), string(c.Planet()), int(c.Slot()))
		}
	case wire.OpQueueUnit:
		c := wire.GetRootAsQueueUnit(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.QueueUnit(doc, s.seat(user), string(c.Planet()), int(c.Slot()), string(c.Unit()), int(c.Count()))
		}
	case wire.OpMoveUnits:
		c := wire.GetRootAsMoveUnits(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.MoveUnits(doc, s.seat(user), string(c.Planet()), int(c.FromStack()), int(c.FromCell()), int(c.ToStack()), int(c.ToCell()), string(c.Unit()), int(c.Count()))
		}
	case wire.OpOrderArmy:
		c := wire.GetRootAsOrderArmy(data, 0).UnPack()
		var units []game.ArmyUnits
		for _, u := range c.Units {
			units = append(units, game.ArmyUnits{Stack: int(u.Stack), Unit: u.Unit, Count: int(u.Count)})
		}
		seq, phase, apply = c.Seq, wire.PhasePlay, func(*game.Lobby) error {
			if c.Raid {
				return s.play.OrderRaid(doc, s.seat(user), c.FromPlanet, units, c.ToPlanet, int(c.ToStack))
			}
			return s.play.OrderArmy(s.seat(user), c.FromPlanet, units, c.ToPlanet, int(c.ToStack))
		}
	case wire.OpReorderArmy:
		c := wire.GetRootAsReorderArmy(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			if c.Raid() {
				return s.play.ReorderRaid(doc, s.seat(user), c.Army(), string(c.ToPlanet()), int(c.ToStack()))
			}
			return s.play.ReorderArmy(s.seat(user), c.Army(), string(c.ToPlanet()), int(c.ToStack()))
		}
	case wire.OpSurrender:
		c := wire.GetRootAsSurrender(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			s.play.Forfeit(s.seat(user))
			return nil
		}
	case wire.OpBattleRetreat:
		c := wire.GetRootAsBattleRetreat(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.RetreatFromBattle(s.seat(user), string(c.Planet()), false)
		}
	case wire.OpBattleCancelRetreat:
		c := wire.GetRootAsBattleCancelRetreat(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.RetreatFromBattle(s.seat(user), string(c.Planet()), true)
		}
	case wire.OpBattleBuildTurret:
		c := wire.GetRootAsBattleBuildTurret(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.BuildTurret(doc, s.seat(user), string(c.Planet()), int(c.Pad()), string(c.Building()))
		}
	case wire.OpSetBattleControl:
		c := wire.GetRootAsSetBattleControl(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			s.play.SetBattleControl(s.seat(user), c.Command())
			return nil
		}
	case wire.OpSetBattleCommand:
		c := wire.GetRootAsSetBattleCommand(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SetBattleCommand(s.seat(user), string(c.Planet()), c.Command())
		}
	case wire.OpBattleLand:
		c := wire.GetRootAsBattleLand(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.BattleLand(s.seat(user), string(c.Planet()), int(c.Drop()), int(c.Point()))
		}
	case wire.OpBattleOrder:
		c := wire.GetRootAsBattleOrder(data, 0).UnPack()
		kind, ok := orderKinds[c.Kind]
		var squads []int
		for _, id := range c.Squads {
			squads = append(squads, int(id))
		}
		seq, phase, apply = c.Seq, wire.PhasePlay, func(*game.Lobby) error {
			if !ok {
				return errors.New("unknown order")
			}
			return s.play.BattleOrder(s.seat(user), c.Planet, kind, squads, battle.Cell{X: int(c.X), Y: int(c.Y)}, int(c.Target), c.Queue)
		}
	case wire.OpRequestDefenceLayout:
		c := wire.GetRootAsRequestDefenceLayout(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.replyLayout(s.seat(user), string(c.Planet()))
		}
	case wire.OpSetDefenceLayout:
		c := wire.GetRootAsSetDefenceLayout(data, 0).UnPack()
		var l battle.Layout
		for slot, k := range c.Sites {
			if k >= 0 {
				if l.Sites == nil {
					l.Sites = map[int]int{}
				}
				l.Sites[slot] = int(k)
			}
		}
		for _, st := range c.Starts {
			if l.Starts == nil {
				l.Starts = map[int]battle.Cell{}
			}
			l.Starts[int(st.Stack)] = battle.Cell{X: int(st.X), Y: int(st.Y)}
		}
		seq, phase, apply = c.Seq, wire.PhasePlay, func(*game.Lobby) error {
			if err := s.play.SetDefenceLayout(doc, s.seat(user), c.Planet, l); err != nil {
				return err
			}
			return s.replyLayout(s.seat(user), c.Planet)
		}
	case wire.OpWatchBattle:
		c := wire.GetRootAsWatchBattle(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			s.watching[user] = string(c.Planet())
			return nil
		}
	case wire.OpExchange:
		c := wire.GetRootAsExchange(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.Exchange(doc, s.seat(user), string(c.Give()), string(c.Get()), int(c.Amount()))
		}
	case wire.OpStartProject:
		c := wire.GetRootAsStartProject(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.StartProject(doc, s.seat(user), string(c.Tech()), string(c.Planet()), int(c.Slot()))
		}
	case wire.OpCancelProject:
		c := wire.GetRootAsCancelProject(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.CancelProject(s.seat(user), string(c.Tech()))
		}
	case wire.OpOfferTruce:
		c := wire.GetRootAsOfferTruce(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.OfferTruce(doc, s.seat(user), int(c.To()))
		}
	case wire.OpAnswerTruce:
		c := wire.GetRootAsAnswerTruce(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.AnswerTruce(doc, s.seat(user), int(c.From()), c.Accept())
		}
	case wire.OpEndTruce:
		c := wire.GetRootAsEndTruce(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.EndTruce(s.seat(user), int(c.With()))
		}
	case wire.OpSendTech:
		c := wire.GetRootAsSendTech(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SendTech(doc, s.seat(user), string(c.Tech()), string(c.ToPlanet()), int(c.ToSlot()))
		}
	case wire.OpReorderCourier:
		c := wire.GetRootAsReorderCourier(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.ReorderCourier(doc, s.seat(user), c.Army(), string(c.ToPlanet()), int(c.ToSlot()))
		}
	case wire.OpSetRallyStack:
		c := wire.GetRootAsSetRallyStack(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SetRallyStack(s.seat(user), string(c.Planet()), int(c.Stack()))
		}
	case wire.OpSetRallyPoint:
		c := wire.GetRootAsSetRallyPoint(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SetRallyPoint(s.seat(user), string(c.Planet()), string(c.To()))
		}
	case wire.OpSetStartingResources:
		c := wire.GetRootAsSetStartingResources(data, 0).UnPack()
		amounts := map[string]int{}
		for _, a := range c.Amounts {
			amounts[a.Resource] = int(a.Amount)
		}
		seq, apply = c.Seq, func(l *game.Lobby) error { return l.SetStartingResources(user, amounts) }
	case wire.OpStartMatch:
		c := wire.GetRootAsStartMatch(data, 0)
		seq, apply = c.Seq(), func(l *game.Lobby) error {
			if err := l.Start(user); err != nil {
				return err
			}
			return s.start(tick)
		}
	default:
		return 0, fmt.Errorf("unknown command %d", op)
	}

	switch {
	case len(data) >= maxCommandBytes:
		return seq, fmt.Errorf("command too large (under %d bytes)", maxCommandBytes)
	case earlier >= maxCommandsPerTick:
		return seq, fmt.Errorf("too many commands this tick (at most %d)", maxCommandsPerTick)
	case s.phase != phase && phase == wire.PhaseLobby:
		return seq, errNotLobby
	case s.phase != phase:
		return seq, errNotPlay
	case phase == wire.PhasePlay && s.seat(user) < 0:
		return seq, errSpectating
	}
	return seq, apply(s.lobby)
}

var errSpectating = errors.New("Spectators give no orders")

// seat is user's Seat in the running Match; -1 for a Spectator.
func (s *matchState) seat(user string) int {
	return slices.IndexFunc(s.play.Players, func(p game.Player) bool { return p.User == user })
}

func (s *matchState) reject(logger runtime.Logger, dispatcher runtime.MatchDispatcher, to runtime.Presence, seq uint32, err error) {
	t := &wire.CommandRejectedT{Seq: seq, Reason: err.Error()}
	if s.play != nil {
		t.MatchTime = s.play.Time
	}
	data := finish(t)
	if err := dispatcher.BroadcastMessage(int64(wire.OpCommandRejected), data, []runtime.Presence{to}, nil, true); err != nil {
		logger.Error("send CommandRejected: %v", err)
	}
}

// orderKinds are the wire's squad orders, as the sim's.
var orderKinds = map[wire.BattleOrderKind]battle.OrderKind{
	wire.BattleOrderKindMove: battle.Move, wire.BattleOrderKindAttack: battle.Attack,
	wire.BattleOrderKindAttackMove: battle.AttackMove, wire.BattleOrderKindHold: battle.Hold,
}

// replyLayout answers with seat's Planet's defence layout.
func (s *matchState) replyLayout(seat int, planet string) error {
	l, err := s.play.DefenceLayout(&s.content.Doc, seat, planet)
	if err != nil {
		return err
	}
	f := l.Field
	t := &wire.DefenceLayoutT{
		Planet: l.Planet, Field: field(f), CommandPost: cell(f.CommandPost),
		Sites: cells(f.Sites), Points: cells(f.Points), Landings: cells(f.Starts), Pads: cells(f.Pads),
		Reach: float32(l.Reach), StackStarts: cells(l.StackStarts),
	}
	for slot, k := range l.BuildingSites {
		t.BuildingSites = append(t.BuildingSites, int8(k))
		set, ok := l.Layout.Sites[slot]
		if !ok {
			set = -1
		}
		t.SetSites = append(t.SetSites, int8(set))
	}
	for _, k := range slices.Sorted(maps.Keys(l.Layout.Starts)) {
		c := l.Layout.Starts[k]
		t.SetStarts = append(t.SetStarts, &wire.LayoutStartT{Stack: uint8(k), X: uint16(c.X), Y: uint16(c.Y)})
	}
	s.reply = finish(t)
	return nil
}

func cell(c battle.Cell) *wire.CellT { return &wire.CellT{X: uint16(c.X), Y: uint16(c.Y)} }

func cells(cs []battle.Cell) []*wire.CellT {
	out := make([]*wire.CellT, len(cs))
	for i, c := range cs {
		out[i] = cell(c)
	}
	return out
}
