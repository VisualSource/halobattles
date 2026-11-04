package nakama

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
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

// matchStart is the log's first line: enough to set the Match up again.
type matchStart struct {
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
	FieldSeed uint64            `json:"fieldSeed"`         // battle.GenerateFor's, with the map Planet's battlefield override
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
}

func replay(b *game.Battle, winner int) battleReplay {
	return battleReplay{
		Battle: b.ID, Planet: b.Planet, Attacker: b.Attacker, Defender: b.Defender, Winner: winner,
		Seed: b.Seed, FieldSeed: b.FieldSeed, Faction: b.FieldFaction, Raid: b.Sim.Raid, Attack: b.Attack, Defend: b.Defend, Weights: b.Weights, Funds: b.Funds,
		Setup: b.Sim.Setup, Builders: b.Sim.Builders, Ticks: b.Sim.Tick, Orders: b.Sim.Log,
		Commanded: b.Commanded, Switches: b.Switches,
	}
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
