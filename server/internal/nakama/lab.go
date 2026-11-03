package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/heroiclabs/nakama-common/runtime"
)

// The Battle Lab (docs/specs/tactical-battle-spec.md#the-battle-lab) is a
// dev-only match that runs one Battle at a time, for watching and stepping
// the Battle AI. It exists only on a server started with HALO_DEV=1.
//
// shortcut: its messages are JSON, not FlatBuffers; it's a dev tool with one
// client page, so no generated wire types. Move them to the schema if it ships.
const (
	labModule = "battle_lab"

	// From the page.
	labSetupOp   = 1 // labSetup: build a Battle and start it, paused
	labControlOp = 2 // labControl: pause, speed, step, restart
	labReplayOp  = 3 // labReplay: build a Battle from a match log's battleReplay
	labOrderOp   = 4 // labOrder: an order for a side you command

	// To the page.
	labFieldOp = 100 // the Battle's Field, once per build
	labStateOp = 101 // labFrame, after each run of steps
	labErrorOp = 102 // {"error": "..."}

	labMaxSteps = 40 // per match tick: 8× at most, with room for a manual step
)

// devMode is whether the server runs with HALO_DEV=1: only then is the Battle
// Lab registered.
func devMode() bool { return os.Getenv("HALO_DEV") == "1" }

// labSide is one side of a Lab Battle. With Command set, no AI runs it: its
// squads hold and fire, and take the page's orders.
type labSide struct {
	Faction    string                  `json:"faction"`
	Formations [][]battle.Slot         `json:"formations"`
	Buildings  []string                `json:"buildings,omitempty"` // the defender's
	Weights    *battle.Weights         `json:"weights,omitempty"`   // nil: its Faction's
	Funds      map[string]int          `json:"funds,omitempty"`     // to buy pad turrets with; nil: none
	Command    bool                    `json:"command"`
	Boosts     map[string]battle.Boost `json:"boosts,omitempty"`
}

type labSetup struct {
	Preset    string  `json:"preset"`              // a Terrain Preset id; "" is the Ruleset's
	Archetype string  `json:"archetype,omitempty"` // a Battlefield Archetype; "" is the preset's pick
	Raid      bool    `json:"raid,omitempty"`      // the attacker Raids: after the buildings, within raidTime
	Neutral   bool    `json:"neutral,omitempty"`   // the defender is a neutral garrison: its base, and turret funds
	Seed      uint64  `json:"seed"`
	Attack    labSide `json:"attack"`
	Defend    labSide `json:"defend"`
}

type labControl struct {
	Paused  *bool    `json:"paused,omitempty"`
	Speed   *float64 `json:"speed,omitempty"`   // sim ticks per match tick: 0.5 to 8
	Step    int      `json:"step,omitempty"`    // run this many ticks now
	Restart bool     `json:"restart,omitempty"` // build the last Battle again
}

// labReplay is a battleReplay line from a match log, with the log's map, so
// the Planet's Battlefield override is found.
type labReplay struct {
	Map    string       `json:"map"`
	Replay battleReplay `json:"replay"`
}

type labOrder struct {
	Side  battle.Side  `json:"side"`
	Order battle.Order `json:"order"`
}

// labFrame is what the page draws after a run of steps: the whole Battle,
// the volleys fired since the last frame, and each AI side's thinking.
type labFrame struct {
	Tick      int                 `json:"tick"`
	Setup     int                 `json:"setup"` // the setup ticks
	Raid      bool                `json:"raid,omitempty"`
	Over      bool                `json:"over"`
	Winner    battle.Side         `json:"winner"`
	Reason    string              `json:"reason,omitempty"`
	Paused    bool                `json:"paused"`
	Speed     float64             `json:"speed"`
	Snapshot  battle.Snapshot     `json:"snapshot"`
	Volleys   []battle.Volley     `json:"volleys,omitempty"`
	Thinking  [2]*battle.Thinking `json:"thinking"` // nil for a side you command
	Decisions []labDecision       `json:"decisions,omitempty"`
}

type labDecision struct {
	Side battle.Side `json:"side"`
	battle.Decision
}

type labMatch struct{ content *content.Content }

type labState struct {
	presences map[string]runtime.Presence // by session
	build     func() (*battle.Sim, error) // makes the current Battle again
	sim       *battle.Sim
	orders    []battle.Logged // a replay's player orders still to come
	paused    bool
	speed     float64
	acc       float64
	volleys   []battle.Volley
	decisions []labDecision
	think     [2]*battle.Thinking
	dirty     bool // send a frame this tick
}

func (m *labMatch) MatchInit(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, map[string]interface{}) (interface{}, int, string) {
	return &labState{presences: map[string]runtime.Presence{}, paused: true, speed: 1}, tickRate, `{"lab":true}`
}

func (m *labMatch) MatchJoinAttempt(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, _ runtime.MatchDispatcher, _ int64, state interface{}, _ runtime.Presence, _ map[string]string) (interface{}, bool, string) {
	return state, true, ""
}

func (m *labMatch) MatchJoin(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, dispatcher runtime.MatchDispatcher, _ int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*labState)
	for _, p := range presences {
		s.presences[p.GetSessionId()] = p
	}
	if s.sim != nil { // a reload: the Battle as it stands
		s.sendField(dispatcher)
		s.dirty = true
	}
	return s
}

func (m *labMatch) MatchLeave(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, _ runtime.MatchDispatcher, _ int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*labState)
	for _, p := range presences {
		delete(s.presences, p.GetSessionId())
	}
	return s
}

func (m *labMatch) MatchLoop(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*labState)
	if len(s.presences) == 0 && tick > creatorGraceTicks {
		return nil // nobody's watching: close it
	}
	for _, msg := range messages {
		if err := s.handle(m.content, msg.GetOpCode(), msg.GetData(), dispatcher); err != nil {
			s.send(dispatcher, labErrorOp, map[string]string{"error": err.Error()}, msg)
		}
	}
	if s.sim != nil && !s.paused && !s.sim.Over {
		s.acc += s.speed
		n := min(int(s.acc), labMaxSteps)
		s.acc -= float64(n)
		s.step(n)
	}
	if s.dirty {
		s.sendFrame(dispatcher)
	}
	return s
}

func (m *labMatch) MatchTerminate(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, _ runtime.MatchDispatcher, _ int64, state interface{}, _ int) interface{} {
	return state
}

func (m *labMatch) MatchSignal(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, _ runtime.MatchDispatcher, _ int64, state interface{}, _ string) (interface{}, string) {
	return state, ""
}

// handle applies one message from the page.
func (s *labState) handle(c *content.Content, op int64, data []byte, dispatcher runtime.MatchDispatcher) error {
	doc := &c.Doc
	switch op {
	case labSetupOp:
		var in labSetup
		if err := json.Unmarshal(data, &in); err != nil {
			return fmt.Errorf("bad setup: %w", err)
		}
		return s.start(dispatcher, func() (*battle.Sim, error) { return s.fromSetup(doc, in) })
	case labReplayOp:
		var in labReplay
		if err := json.Unmarshal(data, &in); err != nil {
			return fmt.Errorf("bad replay: %w", err)
		}
		return s.start(dispatcher, func() (*battle.Sim, error) { return s.fromReplay(doc, in) })
	case labControlOp:
		var in labControl
		if err := json.Unmarshal(data, &in); err != nil {
			return fmt.Errorf("bad control: %w", err)
		}
		if in.Restart {
			if s.build == nil {
				return errors.New("nothing to restart")
			}
			if err := s.start(dispatcher, s.build); err != nil {
				return err
			}
		}
		if in.Paused != nil {
			s.paused = *in.Paused
		}
		if in.Speed != nil {
			s.speed = min(max(*in.Speed, 0.5), 8)
		}
		if in.Step > 0 && s.sim != nil {
			s.step(min(in.Step, labMaxSteps))
		}
		s.dirty = true
	case labOrderOp:
		var in labOrder
		if err := json.Unmarshal(data, &in); err != nil {
			return fmt.Errorf("bad order: %w", err)
		}
		switch {
		case s.sim == nil:
			return errors.New("no Battle running")
		case in.Side != battle.Attacker && in.Side != battle.Defender:
			return errors.New("no such side")
		case s.sim.Controllers[in.Side] != nil:
			return errors.New("the AI runs that side: set it to command")
		}
		s.sim.Command(in.Side, in.Order)
	default:
		return fmt.Errorf("unknown Lab message %d", op)
	}
	return nil
}

// start builds a Battle with build, paused at its first tick, and keeps
// build for Restart.
func (s *labState) start(dispatcher runtime.MatchDispatcher, build func() (*battle.Sim, error)) error {
	// build fills these for the new Battle; a failed one leaves the old as it was.
	orders, decisions, volleys, think := s.orders, s.decisions, s.volleys, s.think
	s.orders, s.decisions, s.volleys, s.think = nil, nil, nil, [2]*battle.Thinking{}
	sim, err := build()
	if err != nil {
		s.orders, s.decisions, s.volleys, s.think = orders, decisions, volleys, think
		return err
	}
	s.sim, s.build, s.paused, s.acc, s.dirty = sim, build, true, 0, true
	s.sendField(dispatcher)
	return nil
}

func (s *labState) fromSetup(c *cs.Content, in labSetup) (*battle.Sim, error) {
	rules := c.Rulesets[game.RulesetID]
	override := &cs.PlanetBattlefield{}
	if in.Preset != "" {
		if _, ok := c.TerrainPresets[in.Preset]; !ok {
			return nil, fmt.Errorf("unknown Terrain Preset %s", in.Preset)
		}
		id := cs.ID(in.Preset)
		override.TerrainPreset = &id
	}
	switch a := cs.GalaxyMapPlanetsElemBattlefieldArchetype(in.Archetype); a {
	case "":
	case cs.GalaxyMapPlanetsElemBattlefieldArchetypeOpen, cs.GalaxyMapPlanetsElemBattlefieldArchetypeRiver, cs.GalaxyMapPlanetsElemBattlefieldArchetypeRidge, cs.GalaxyMapPlanetsElemBattlefieldArchetypeRuins:
		override.Archetype = &a
	default:
		return nil, fmt.Errorf("unknown Archetype %s", in.Archetype)
	}
	sides := [2]labSide{in.Attack, in.Defend}
	var forces [2]battle.Force
	for i, sd := range sides {
		if _, ok := c.Factions[sd.Faction]; !ok {
			return nil, fmt.Errorf("unknown Faction %q", sd.Faction)
		}
		for _, form := range sd.Formations {
			for _, sl := range form {
				if _, ok := c.Units[sl.Unit]; !ok || sl.Count < 1 {
					return nil, fmt.Errorf("unit %q × %d", sl.Unit, sl.Count)
				}
			}
		}
		forces[i] = battle.Force{Formations: sd.Formations, Boosts: sd.Boosts}
	}
	for _, b := range in.Defend.Buildings {
		if _, ok := c.Buildings[b]; b != "" && !ok {
			return nil, fmt.Errorf("unknown building %q", b)
		}
	}
	forces[battle.Defender].Buildings = in.Defend.Buildings
	base := in.Defend.Faction
	if in.Neutral {
		base = ""
	}
	f := battle.GenerateFor(c, rules.Battlefield, override, in.Seed, base)
	sim := battle.New(c, rules, f, forces[0], forces[1], in.Seed)
	sim.Setup = rules.Battle.StartDelay * battle.TicksPerSecond
	sim.Raid = in.Raid
	for i, sd := range sides {
		sim.Funds[i] = maps.Clone(sd.Funds)
		sim.Builders[i] = buildsTurrets(c, sd.Faction)
		if !sd.Command {
			w := battle.WeightsOf(c.Factions[sd.Faction].Ai)
			if sd.Weights != nil {
				w = *sd.Weights
			}
			sim.Controllers[i] = s.ai(battle.Side(i), w)
		}
	}
	if in.Neutral && sim.Funds[battle.Defender] == nil { // a garrison buys turrets as in a Match
		sim.Funds[battle.Defender] = maps.Clone(rules.Battle.NeutralFunds)
		sim.Builders[battle.Defender] = true
	}
	return sim, nil
}

func (s *labState) fromReplay(c *cs.Content, in labReplay) (*battle.Sim, error) {
	rules := c.Rulesets[game.RulesetID]
	m, ok := c.Maps[in.Map]
	if !ok {
		return nil, fmt.Errorf("unknown map %q: the replay needs its log's map", in.Map)
	}
	r := in.Replay
	var override *cs.PlanetBattlefield
	for _, mp := range m.Planets {
		if string(mp.ID) == r.Planet {
			override = mp.Battlefield
		}
	}
	sim := battle.New(c, rules, battle.GenerateFor(c, rules.Battlefield, override, r.FieldSeed, r.Faction), r.Attack, r.Defend, r.Seed)
	sim.Setup, sim.Builders, sim.Raid = r.Setup, r.Builders, r.Raid
	for i := range sim.Funds {
		sim.Funds[i] = maps.Clone(r.Funds[i])
		sim.Controllers[i] = s.ai(battle.Side(i), r.Weights[i])
	}
	s.orders = r.Orders
	return sim, nil
}

// ai is a Battle AI for side that keeps its thinking and logs its decisions.
func (s *labState) ai(side battle.Side, w battle.Weights) *battle.AI {
	ai := battle.NewAI(w)
	s.think[side] = ai.Think()
	ai.Trace = func(d battle.Decision) { s.decisions = append(s.decisions, labDecision{side, d}) }
	return ai
}

// buildsTurrets is whether a Faction has a pad turret to build.
func buildsTurrets(c *cs.Content, faction string) bool {
	for _, b := range c.Buildings {
		if string(b.Faction) == faction && b.PadTurret != nil && *b.PadTurret {
			return true
		}
	}
	return false
}

// step runs n sim ticks, a replay's orders going in at their ticks.
func (s *labState) step(n int) {
	for range n {
		if s.sim.Over {
			break
		}
		for len(s.orders) > 0 && s.orders[0].Tick <= s.sim.Tick {
			s.sim.Command(s.orders[0].Side, s.orders[0].Order)
			s.orders = s.orders[1:]
		}
		s.volleys = append(s.volleys, s.sim.Step()...)
		s.dirty = true
	}
}

func (s *labState) sendField(dispatcher runtime.MatchDispatcher) {
	s.send(dispatcher, labFieldOp, s.sim.Field, nil)
}

func (s *labState) sendFrame(dispatcher runtime.MatchDispatcher) {
	sim := s.sim
	fr := labFrame{Paused: s.paused, Speed: s.speed, Volleys: s.volleys, Decisions: s.decisions}
	if sim != nil {
		fr.Tick, fr.Setup, fr.Raid, fr.Over, fr.Winner, fr.Reason = sim.Tick, sim.Setup, sim.Raid, sim.Over, sim.Winner, sim.Reason
		fr.Snapshot = sim.SnapshotAll()
		fr.Thinking = s.think
	}
	s.send(dispatcher, labStateOp, fr, nil)
	s.volleys, s.decisions, s.dirty = nil, nil, false
}

// send is v as JSON to everyone, or to the sender of reply.
func (s *labState) send(dispatcher runtime.MatchDispatcher, op int64, v any, reply runtime.Presence) {
	b, err := json.Marshal(v)
	if err != nil {
		b, _ = json.Marshal(map[string]string{"error": err.Error()})
		op = labErrorOp
	}
	var to []runtime.Presence
	if reply != nil {
		to = []runtime.Presence{reply}
	}
	_ = dispatcher.BroadcastMessage(op, b, to, nil, true)
}

// createLab starts an empty Battle Lab match.
func createLab(ctx context.Context, _ runtime.Logger, _ *sql.DB, nk runtime.NakamaModule, _ string) (string, error) {
	id, err := nk.MatchCreate(ctx, labModule, nil)
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(map[string]string{"matchId": id})
	return string(b), err
}
