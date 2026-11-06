package nakama

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	"github.com/heroiclabs/nakama-common/runtime"
)

// matchLog is a Match's log for later review: a JSON object a line, in
// <folder>/<match id>.jsonl. HALO_MATCH_LOG names the folder; unset, nothing
// is logged. HALO_MATCH_LOG_BATTLE_AI=1 adds the Battle AI's decisions, many
// more lines. Bot goroutines write to it too.
type matchLog struct {
	mu       sync.Mutex
	f        *os.File // nil once closed
	enc      *json.Encoder
	battleAI bool
}

// entry is one line.
type entry struct {
	Kind string `json:"kind"`
	Time int64  `json:"time"` // Match Time
	Data any    `json:"data"`
}

// openMatchLog starts a Match's log, or returns nil if logging is off or the
// file can't be made.
func openMatchLog(logger runtime.Logger, name string) *matchLog {
	dir := os.Getenv("HALO_MATCH_LOG")
	if dir == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		logger.Error("match log: %v", err)
		return nil
	}
	f, err := os.Create(filepath.Join(dir, name+".jsonl"))
	if err != nil {
		logger.Error("match log: %v", err)
		return nil
	}
	return &matchLog{f: f, enc: json.NewEncoder(f), battleAI: os.Getenv("HALO_MATCH_LOG_BATTLE_AI") == "1"}
}

// write adds a line; on a nil or closed log it does nothing.
func (l *matchLog) write(kind string, time int64, data any) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		_ = l.enc.Encode(entry{kind, time, data}) // a lost debug line isn't worth failing a Match over
	}
}

func (l *matchLog) close() {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		_ = l.f.Close()
		l.f = nil
	}
}

// logName is the log file's name: the Match id, or the seed where there's
// none (tests).
func (s *matchState) logName() string {
	if s.matchID != "" {
		return s.matchID
	}
	return fmt.Sprintf("%x", s.seed)
}

// logVersion is the log's format, on its first line; a change readers must handle bumps it.
const logVersion = 1

// matchStart is the log's first line: enough to set the Match up again.
type matchStart struct {
	Version int              `json:"version"`
	Content string           `json:"content"` // the content hash
	Map     string           `json:"map"`
	Seed    uint64           `json:"seed"`
	Seats   []game.SeatSetup `json:"seats"`
	Start   map[string]int   `json:"startingResources"`
}

// battleReplay is a Battle as it ended, with all it was made from: with the
// same content, battle.New on these, and the Orders at their Ticks, plays it
// out the same again.
type battleReplay struct {
	Battle    uint32            `json:"battle"`
	Planet    string            `json:"planet"`
	Attacker  int               `json:"attacker"`
	Defender  int               `json:"defender"`
	Winner    int               `json:"winner"`
	Seed      uint64            `json:"seed"`
	FieldSeed uint64            `json:"fieldSeed"`         // battle.GenerateLayout's, with the map Planet's battlefield override
	Faction   string            `json:"faction,omitempty"` // the defender's, whose base the Battlefield has; "" neutral
	Raid      bool              `json:"raid,omitempty"`
	Attack    battle.Force      `json:"attack"`
	Defend    battle.Force      `json:"defend"`
	Weights   [2]battle.Weights `json:"weights"` // each side's Battle AI
	Funds     [2]map[string]int `json:"funds,omitempty"`
	Setup     int               `json:"setup"`
	Builders  [2]bool           `json:"builders"`
	Ticks     int               `json:"ticks"`
	Orders    []battle.Logged   `json:"orders,omitempty"` // the players'
	// Commanded: a player, not the AI, ran the side from the start; Switches
	// are the sides changing hands since, each at its tick.
	Commanded [2]bool       `json:"commanded,omitempty"`
	Switches  []game.Switch `json:"switches,omitempty"`
	Result    battleResult  `json:"result"`
}

// battleResult is how a Battle went, to read without replaying it: why it
// ended, and per side (attacker, defender) the members each unit had at the
// start and has left, and the damage dealt.
type battleResult struct {
	Reason string            `json:"reason"`
	Start  [2]map[string]int `json:"start"`
	Left   [2]map[string]int `json:"left"`
	Damage [2]float64        `json:"damage"`
}

func replay(b *game.Battle, winner int, damage [2]float64) battleReplay {
	r := battleResult{Reason: b.Sim.Reason, Damage: damage, Start: [2]map[string]int{{}, {}}, Left: [2]map[string]int{{}, {}}}
	for _, sq := range b.Sim.Squads {
		r.Start[sq.Side][sq.Unit] += sq.Start
		r.Left[sq.Side][sq.Unit] += len(sq.Members)
	}
	return battleReplay{
		Battle: b.ID, Planet: b.Planet, Attacker: b.Attacker, Defender: b.Defender, Winner: winner,
		Seed: b.Seed, FieldSeed: b.FieldSeed, Faction: b.FieldFaction, Raid: b.Sim.Raid, Attack: b.Attack, Defend: b.Defend, Weights: b.Weights, Funds: b.Funds,
		Setup: b.Sim.Setup, Builders: b.Sim.Builders, Ticks: b.Sim.Tick, Orders: b.Sim.Log,
		Commanded: b.Commanded, Switches: b.Switches, Result: r,
	}
}

// commandLine is a player's command as the server took it, or refused it.
type commandLine struct {
	Seat     int    `json:"seat"`
	Command  string `json:"command"`
	Fields   any    `json:"fields,omitempty"`
	Rejected string `json:"rejected,omitempty"`
}

// commandFields decodes each command for its log line.
var commandFields = map[wire.Op]func([]byte) any{
	wire.OpSetFaction:           func(b []byte) any { return wire.GetRootAsSetFaction(b, 0).UnPack() },
	wire.OpSetReady:             func(b []byte) any { return wire.GetRootAsSetReady(b, 0).UnPack() },
	wire.OpSetMap:               func(b []byte) any { return wire.GetRootAsSetMap(b, 0).UnPack() },
	wire.OpSetStartingResources: func(b []byte) any { return wire.GetRootAsSetStartingResources(b, 0).UnPack() },
	wire.OpStartMatch:           func(b []byte) any { return wire.GetRootAsStartMatch(b, 0).UnPack() },
	wire.OpQueueBuilding:        func(b []byte) any { return wire.GetRootAsQueueBuilding(b, 0).UnPack() },
	wire.OpCancelQueueItem:      func(b []byte) any { return wire.GetRootAsCancelQueueItem(b, 0).UnPack() },
	wire.OpSellBuilding:         func(b []byte) any { return wire.GetRootAsSellBuilding(b, 0).UnPack() },
	wire.OpQueueUnit:            func(b []byte) any { return wire.GetRootAsQueueUnit(b, 0).UnPack() },
	wire.OpMoveUnits:            func(b []byte) any { return wire.GetRootAsMoveUnits(b, 0).UnPack() },
	wire.OpSetRallyStack:        func(b []byte) any { return wire.GetRootAsSetRallyStack(b, 0).UnPack() },
	wire.OpOrderArmy:            func(b []byte) any { return wire.GetRootAsOrderArmy(b, 0).UnPack() },
	wire.OpReorderArmy:          func(b []byte) any { return wire.GetRootAsReorderArmy(b, 0).UnPack() },
	wire.OpSurrender:            func(b []byte) any { return wire.GetRootAsSurrender(b, 0).UnPack() },
	wire.OpBattleRetreat:        func(b []byte) any { return wire.GetRootAsBattleRetreat(b, 0).UnPack() },
	wire.OpBattleCancelRetreat:  func(b []byte) any { return wire.GetRootAsBattleCancelRetreat(b, 0).UnPack() },
	wire.OpBattleBuildTurret:    func(b []byte) any { return wire.GetRootAsBattleBuildTurret(b, 0).UnPack() },
	wire.OpExchange:             func(b []byte) any { return wire.GetRootAsExchange(b, 0).UnPack() },
	wire.OpStartProject:         func(b []byte) any { return wire.GetRootAsStartProject(b, 0).UnPack() },
	wire.OpCancelProject:        func(b []byte) any { return wire.GetRootAsCancelProject(b, 0).UnPack() },
	wire.OpAddBot:               func(b []byte) any { return wire.GetRootAsAddBot(b, 0).UnPack() },
	wire.OpRemoveBot:            func(b []byte) any { return wire.GetRootAsRemoveBot(b, 0).UnPack() },
	wire.OpSpectate:             func(b []byte) any { return wire.GetRootAsSpectate(b, 0).UnPack() },
	wire.OpTakeSeat:             func(b []byte) any { return wire.GetRootAsTakeSeat(b, 0).UnPack() },
	wire.OpSetTeams:             func(b []byte) any { return wire.GetRootAsSetTeams(b, 0).UnPack() },
	wire.OpSetTeam:              func(b []byte) any { return wire.GetRootAsSetTeam(b, 0).UnPack() },
	wire.OpSetRallyPoint:        func(b []byte) any { return wire.GetRootAsSetRallyPoint(b, 0).UnPack() },
	wire.OpSetBattleControl:     func(b []byte) any { return wire.GetRootAsSetBattleControl(b, 0).UnPack() },
	wire.OpSetBattleCommand:     func(b []byte) any { return wire.GetRootAsSetBattleCommand(b, 0).UnPack() },
	wire.OpBattleOrder:          func(b []byte) any { return wire.GetRootAsBattleOrder(b, 0).UnPack() },
	wire.OpBattleLand:           func(b []byte) any { return wire.GetRootAsBattleLand(b, 0).UnPack() },
	wire.OpRequestDefenceLayout: func(b []byte) any { return wire.GetRootAsRequestDefenceLayout(b, 0).UnPack() },
	wire.OpSetDefenceLayout:     func(b []byte) any { return wire.GetRootAsSetDefenceLayout(b, 0).UnPack() },
	wire.OpWatchBattle:          func(b []byte) any { return wire.GetRootAsWatchBattle(b, 0).UnPack() },
	wire.OpSendTech:             func(b []byte) any { return wire.GetRootAsSendTech(b, 0).UnPack() },
	wire.OpReorderCourier:       func(b []byte) any { return wire.GetRootAsReorderCourier(b, 0).UnPack() },
	wire.OpOfferTruce:           func(b []byte) any { return wire.GetRootAsOfferTruce(b, 0).UnPack() },
	wire.OpAnswerTruce:          func(b []byte) any { return wire.GetRootAsAnswerTruce(b, 0).UnPack() },
	wire.OpEndTruce:             func(b []byte) any { return wire.GetRootAsEndTruce(b, 0).UnPack() },
}

// logCommand logs a player's command, taken or refused, once the Match runs.
func (s *matchState) logCommand(user string, op int64, data []byte, err error) {
	if s.log == nil || s.play == nil {
		return
	}
	l := commandLine{Seat: s.seat(user), Command: wire.Op(op).String()}
	if err != nil {
		l.Rejected = err.Error()
	}
	if decode := commandFields[wire.Op(op)]; decode != nil {
		func() {
			defer func() { _ = recover() }() // a malformed command is logged without its fields
			l.Fields = decode(data)
		}()
	}
	s.log.write("command", s.play.Time, l)
}

// eventLine is something the galaxy's tick worked out.
type eventLine struct {
	Event string `json:"event"`
	Data  any    `json:"data"`
}

// statsLine is a player's economy and army at a Payday.
type statsLine struct {
	Seat int `json:"seat"`
	*game.Stats
	Planets int `json:"planets"`
	Stacked int `json:"stacked"` // units in Stacks
	Moving  int `json:"moving"`  // units in Armies on the move
}

// logEvents logs a tick's events, and at a Payday each player's stats.
func (s *matchState) logEvents(ev game.Events) {
	if s.log == nil {
		return
	}
	t := s.play.Time
	for _, c := range ev.Captures {
		s.log.write("event", t, eventLine{"capture", map[string]any{"planet": c.Planet, "from": c.From, "to": c.To}})
	}
	for _, b := range ev.Started {
		s.log.write("event", t, eventLine{"battle", map[string]any{"battle": b.ID, "planet": b.Planet, "attacker": b.Attacker, "defender": b.Defender, "raid": b.Sim.Raid}})
	}
	for _, r := range ev.TurnedBack {
		s.log.write("event", t, eventLine{"raidTurnedBack", r})
	}
	for _, seat := range ev.Eliminated {
		s.log.write("event", t, eventLine{"eliminated", map[string]int{"seat": seat}})
	}
	for _, tr := range ev.Truces {
		s.log.write("event", t, eventLine{"truce", tr})
	}
	if len(ev.Paydays) == 0 {
		return
	}
	for seat, p := range s.play.Players {
		if p.Eliminated {
			continue
		}
		l := statsLine{Seat: seat, Stats: s.play.StatsOf(&s.content.Doc, seat)}
		for _, pl := range s.play.Planets {
			if pl.Owner != seat {
				continue
			}
			l.Planets++
			for _, st := range pl.Stacks {
				for _, u := range st {
					l.Stacked += u.Count
				}
			}
		}
		for _, a := range s.play.Armies {
			if a.Owner == seat {
				for _, u := range a.Units {
					l.Moving += u.Count
				}
			}
		}
		s.log.write("stats", t, l)
	}
}

// logFire logs, with the Battle AI trace on, each squad's change of fire
// target: the sim picks one each volley, so a squad that keeps switching shows.
func (s *matchState) logFire(b *game.Battle, vs []battle.Volley) {
	if s.log == nil || !s.log.battleAI {
		return
	}
	if s.shooting[b.ID] == nil {
		s.shooting[b.ID] = map[int]int{}
	}
	last := s.shooting[b.ID]
	for _, v := range vs {
		if v.Actor < 1 || v.Actor > len(b.Sim.Squads) || last[v.Actor] == v.Target {
			continue
		}
		last[v.Actor] = v.Target
		sq := b.Sim.Squads[v.Actor-1]
		s.log.write("battleAI", s.play.Time, battleFire{b.ID, [...]string{"attacker", "defender"}[sq.Side], b.Sim.Tick, v.Actor, sq.Unit, v.Target})
	}
}

// battleFire is a squad turning its fire on a new target squad.
type battleFire struct {
	Battle   uint32 `json:"battle"`
	Side     string `json:"side"`
	Tick     int    `json:"tick"`
	Squad    int    `json:"squad"`
	Unit     string `json:"unit"`
	Shooting int    `json:"shooting"`
}

// battleDecision is one of a Battle AI's decisions, for its side.
type battleDecision struct {
	Battle uint32 `json:"battle"`
	Side   string `json:"side"`
	battle.Decision
}

// traceBattle has a Battle's AIs log their decisions, if the log takes them.
func (s *matchState) traceBattle(b *game.Battle) {
	if s.log == nil || !s.log.battleAI {
		return
	}
	for side, ctl := range b.Sim.Controllers {
		if ai, ok := ctl.(*battle.AI); ok {
			name := [...]string{"attacker", "defender"}[side]
			ai.Trace = func(d battle.Decision) { s.log.write("battleAI", s.play.Time, battleDecision{b.ID, name, d}) }
		}
	}
}
