package nakama

import (
	"errors"
	"fmt"
	"slices"

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
		seq, err := s.handle(msg, tick, perUser[user])
		perUser[user]++
		s.lastSeq[user] = max(s.lastSeq[user], seq) // a malformed command has no seq
		if err != nil {
			s.reject(logger, dispatcher, msg, seq, err)
			continue
		}
		changed = true
	}
	return changed
}

// handle decodes one command and applies it. A malformed FlatBuffer can
// panic while decoding; that rejects the command, not the Match.
func (s *matchState) handle(msg runtime.MatchData, tick int64, earlier int) (seq uint32, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = errors.New("malformed command")
		}
	}()
	user, data := msg.GetUserId(), msg.GetData()
	doc := &s.content.Doc

	phase := wire.PhaseLobby // the phase the command works in
	var apply func(l *game.Lobby) error
	switch wire.Op(msg.GetOpCode()) {
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
			return s.play.OrderArmy(s.seat(user), c.FromPlanet, units, c.ToPlanet, int(c.ToStack))
		}
	case wire.OpReorderArmy:
		c := wire.GetRootAsReorderArmy(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
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
	case wire.OpSetRallyStack:
		c := wire.GetRootAsSetRallyStack(data, 0)
		seq, phase, apply = c.Seq(), wire.PhasePlay, func(*game.Lobby) error {
			return s.play.SetRallyStack(s.seat(user), string(c.Planet()), int(c.Stack()))
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
		return 0, fmt.Errorf("unknown command %d", msg.GetOpCode())
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
	}
	return seq, apply(s.lobby)
}

// seat is user's Seat in the running Match. Only seated users can join it.
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
