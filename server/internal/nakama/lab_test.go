package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	"github.com/heroiclabs/nakama-common/runtime"
)

// labDispatcher keeps every Lab message sent to everyone, in order.
type labDispatcher struct {
	runtime.MatchDispatcher
	sent []labSent
}

type labSent struct {
	op   int64
	data []byte
}

func (d *labDispatcher) BroadcastMessage(op int64, data []byte, _ []runtime.Presence, _ runtime.Presence, _ bool) error {
	d.sent = append(d.sent, labSent{op, data})
	return nil
}

// last decodes the latest message with op into v, reporting whether there was one.
func (d *labDispatcher) last(t *testing.T, op int64, v any) bool {
	t.Helper()
	for i := len(d.sent) - 1; i >= 0; i-- {
		if d.sent[i].op == op {
			if err := json.Unmarshal(d.sent[i].data, v); err != nil {
				t.Fatal(err)
			}
			return true
		}
	}
	return false
}

func labMsg(op int64, v any) runtime.MatchData {
	b, _ := json.Marshal(v)
	return message{presence: u1, op: wire.Op(op), data: b}
}

type labHarness struct {
	t     *testing.T
	m     *labMatch
	d     *labDispatcher
	state interface{}
	tick  int64
}

func newLab(t *testing.T) *labHarness {
	t.Helper()
	c, err := content.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		t.Fatal(err)
	}
	h := &labHarness{t: t, m: &labMatch{content: c}, d: &labDispatcher{}}
	h.state, _, _ = h.m.MatchInit(context.Background(), nopLogger{}, nil, fakeNK{}, nil)
	h.state = h.m.MatchJoin(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, 0, h.state, []runtime.Presence{u1})
	return h
}

func (h *labHarness) loop(msgs ...runtime.MatchData) {
	h.tick++
	h.state = h.m.MatchLoop(context.Background(), nopLogger{}, nil, fakeNK{}, h.d, h.tick, h.state, msgs)
}

// frame is the latest frame, decoded.
func (h *labHarness) frame() labFrame {
	h.t.Helper()
	var f labFrame
	if !h.d.last(h.t, labStateOp, &f) {
		h.t.Fatal("no frame sent")
	}
	return f
}

func kitSetup(seed uint64) labSetup {
	return labSetup{Seed: seed,
		Attack: labSide{Faction: "base:unsc", Formations: [][]battle.Slot{{{Unit: "base:marine", Count: 10, Cell: 0}, {Unit: "base:warthog", Count: 2, Cell: 1}}}},
		Defend: labSide{Faction: "base:covenant", Formations: [][]battle.Slot{{{Unit: "base:grunt", Count: 10, Cell: 0}, {Unit: "base:ghost", Count: 2, Cell: 1}}},
			Buildings: []string{"base:hall", "base:warehouse"}},
	}
}

func TestTheLabRunsABattleAndShowsWhatTheAIThinks(t *testing.T) {
	h := newLab(t)
	h.loop(labMsg(labSetupOp, kitSetup(7)))
	var field battle.Field
	if !h.d.last(t, labFieldOp, &field) || field.W == 0 {
		t.Fatalf("Field %+v; want it sent on setup", field)
	}
	if f := h.frame(); !f.Paused || f.Tick != 0 || len(f.Snapshot.Squads) == 0 {
		t.Fatalf("first frame %+v; want the Battle deployed and paused", f)
	}

	h.loop(labMsg(labControlOp, labControl{Step: 3}))
	if f := h.frame(); f.Tick != 3 || !f.Paused {
		t.Errorf("after Step 3: tick %d, paused %v", f.Tick, f.Paused)
	}

	paused, speed := false, 8.0
	h.loop(labMsg(labControlOp, labControl{Paused: &paused, Speed: &speed}))
	var thought, why, decided bool
	for i := 0; i < 2000 && !h.frame().Over; i++ {
		h.loop()
		f := h.frame()
		for _, th := range f.Thinking {
			if th != nil && len(th.Goals) > 0 && len(th.Choices) > 0 {
				thought = true
				why = why || th.Choices[0].Why != ""
			}
		}
		decided = decided || len(f.Decisions) > 0
	}
	f := h.frame()
	if !f.Over || !thought || !why || !decided {
		t.Errorf("over %v, thinking %v (why %v), decisions %v; want the Battle played out with the AI's reasons", f.Over, thought, why, decided)
	}
}

func TestTheLabTakesOrdersOnlyForASideYouCommand(t *testing.T) {
	h := newLab(t)
	setup := kitSetup(3)
	setup.Attack.Command = true
	h.loop(labMsg(labSetupOp, setup))
	f := h.frame()
	if f.Thinking[battle.Attacker] != nil || f.Thinking[battle.Defender] == nil {
		t.Fatalf("thinking %v; want none for the commanded attacker", f.Thinking)
	}
	if f.Commanded != [2]bool{true, false} {
		t.Errorf("commanded %v; want the attacker's alone", f.Commanded)
	}
	sq := f.Snapshot.Squads[slices.IndexFunc(f.Snapshot.Squads, func(s battle.SquadView) bool { return s.Side == battle.Attacker })]
	order := battle.Order{Kind: battle.Move, Cell: battle.Cell{X: 30, Y: 20}}
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Defender, Squads: []int{sq.ID}, Order: order}))
	var e map[string]string
	if !h.d.last(t, labErrorOp, &e) {
		t.Error("an order for the AI's side wasn't refused")
	}
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Attacker, Squads: []int{sq.ID}, Order: order}))
	if !h.d.last(t, labErrorOp, &e) || !strings.Contains(e["error"], "until the fighting starts") {
		t.Errorf("an attacker's move in setup: %v; want it refused, saying why", e)
	}

	for h.frame().Tick < h.frame().Setup { // through setup, a step at a time
		h.loop(labMsg(labControlOp, labControl{Step: labMaxSteps}))
	}
	n := len(h.d.sent)
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Attacker, Squads: []int{sq.ID}, Order: order}))
	for _, m := range h.d.sent[n:] {
		if m.op == labErrorOp {
			t.Errorf("an order for the commanded side was refused: %s", m.data)
		}
	}
	h.loop(labMsg(labControlOp, labControl{Step: 1}))
	got := h.frame().Snapshot.Squads[slices.IndexFunc(h.frame().Snapshot.Squads, func(s battle.SquadView) bool { return s.ID == sq.ID })]
	if !got.Moving || got.Goal == sq.Cell {
		t.Errorf("after a Move it shows %+v; want it on its way", got)
	}
}

// A Battle from a match log replays as it was: the same ending, the same
// tick. One from a log before the rate was logged ran, and replays, at 5.
func TestTheLabReplaysABattleFromAMatchLog(t *testing.T) {
	for _, old := range []bool{false, true} {
		t.Run(map[bool]string{false: "logged rate", true: "before the rate was logged"}[old], func(t *testing.T) {
			testReplay(t, old)
		})
	}
}

func testReplay(t *testing.T, old bool) {
	h := newLab(t)
	setup := kitSetup(11)
	c := h.m.content
	rules := c.Doc.Rulesets[game.RulesetID]
	if old {
		slow := rules
		slow.Battle.TicksPerSecond = 5
		c.Doc.Rulesets[game.RulesetID] = slow
	}
	sim, err := h.state.(*labState).fromSetup(&c.Doc, setup)
	if err != nil {
		t.Fatal(err)
	}
	c.Doc.Rulesets[game.RulesetID] = rules // the replay must take the rate from the log
	for !sim.Over {
		sim.Step()
	}
	rate := sim.TPS()
	if old {
		rate = 0
	}
	r := battleReplay{
		Seed: setup.Seed, FieldSeed: setup.Seed, Faction: setup.Defend.Faction, Planet: "nowhere", Setup: sim.Setup, Builders: sim.Builders, Rate: rate,
		Attack: battle.Force{Formations: setup.Attack.Formations},
		Defend: battle.Force{Formations: setup.Defend.Formations, Buildings: setup.Defend.Buildings},
		Weights: [2]battle.Weights{
			battle.WeightsOf(c.Doc.Factions["base:unsc"].Ai), battle.WeightsOf(c.Doc.Factions["base:covenant"].Ai),
		},
	}
	for i := range r.Weights { // as the Lab plays a side: a player's on Auto
		r.Weights[i].Limits = game.BattleLimits(&c.Doc, rules.Battle.AutoDifficulty)
	}
	for name := range c.Doc.Maps {
		h.loop(labMsg(labReplayOp, labReplay{Map: name, Replay: r}))
		break
	}
	speed, paused := 8.0, false
	h.loop(labMsg(labControlOp, labControl{Speed: &speed, Paused: &paused}))
	for i := 0; i < 2000 && !h.frame().Over; i++ {
		h.loop()
	}
	if f := h.frame(); f.Tick != sim.Tick || f.Winner != sim.Winner {
		t.Errorf("replay ended at tick %d, winner %v; the Battle: %d, %v", f.Tick, f.Winner, sim.Tick, sim.Winner)
	}
}

// A commanded side whose player left: the replay runs it with no AI, the
// player's orders at their ticks, then the AI from the tick it took over.
func TestTheLabReplaysABattleTheAITookOver(t *testing.T) {
	h := newLab(t)
	setup := kitSetup(11)
	setup.Attack.Command = true
	c := h.m.content
	sim, err := h.state.(*labState).fromSetup(&c.Doc, setup)
	if err != nil {
		t.Fatal(err)
	}
	weights := [2]battle.Weights{
		battle.WeightsOf(c.Doc.Factions["base:unsc"].Ai), battle.WeightsOf(c.Doc.Factions["base:covenant"].Ai),
	}
	for i := range weights { // the limits fromSetup gave the defender: the replay must play the same
		weights[i].Limits = game.BattleLimits(&c.Doc, c.Doc.Rulesets["base:rules"].Battle.AutoDifficulty)
	}
	for sim.Tick < sim.Setup+10 {
		sim.Step()
	}
	centre := battle.Cell{X: sim.Field.W / 2, Y: sim.Field.H / 2}
	if err := sim.CommandGroup(battle.Attacker, []int{1, 2, 3}, battle.Order{Kind: battle.AttackMove, Cell: centre}); err != nil {
		t.Fatal(err)
	}
	for range 30 {
		sim.Step()
	}
	handed := sim.Tick
	sim.Controllers[battle.Attacker] = battle.NewAI(weights[battle.Attacker]) // as handOver does
	for !sim.Over {
		sim.Step()
	}
	r := battleReplay{
		Seed: setup.Seed, FieldSeed: setup.Seed, Faction: setup.Defend.Faction, Planet: "nowhere", Setup: sim.Setup, Builders: sim.Builders, Rate: sim.TPS(),
		Attack:    battle.Force{Formations: setup.Attack.Formations},
		Defend:    battle.Force{Formations: setup.Defend.Formations, Buildings: setup.Defend.Buildings},
		Weights:   weights,
		Orders:    sim.Log,
		Commanded: [2]bool{true, false}, Switches: []game.Switch{{Tick: handed, Side: battle.Attacker}},
	}
	for name := range c.Doc.Maps {
		h.loop(labMsg(labReplayOp, labReplay{Map: name, Replay: r}))
		break
	}
	speed, paused := 8.0, false
	h.loop(labMsg(labControlOp, labControl{Speed: &speed, Paused: &paused}))
	for i := 0; i < 2000 && !h.frame().Over; i++ {
		h.loop()
	}
	if f := h.frame(); f.Tick != sim.Tick || f.Winner != sim.Winner {
		t.Errorf("replay ended at tick %d, winner %v; the Battle: %d, %v", f.Tick, f.Winner, sim.Tick, sim.Winner)
	}
}

// The Lab sends a test Dropship for a side, and lands it where you say for
// a side you command.
func TestTheLabSendsAndLandsADropship(t *testing.T) {
	h := newLab(t)
	setup := kitSetup(3)
	setup.Attack.Command = true
	h.loop(labMsg(labSetupOp, setup))
	for h.frame().Tick < h.frame().Setup {
		h.loop(labMsg(labControlOp, labControl{Step: labMaxSteps}))
	}
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Attacker, Order: battle.Order{Kind: battle.Arrive, Building: "base:marine"}}))
	var e map[string]string
	if !h.d.last(t, labErrorOp, &e) {
		t.Error("a Marine was accepted as a Dropship")
	}
	arrive := battle.Order{Kind: battle.Arrive, Building: "base:pelican", Cargo: []battle.Slot{{Unit: "base:marine", Count: 4}}}
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Attacker, Order: arrive}))
	h.loop(labMsg(labControlOp, labControl{Step: 1}))
	f := h.frame()
	held := slices.IndexFunc(f.Snapshot.Points, func(p battle.Point) bool { return p.Owner == battle.Attacker })
	if len(f.Snapshot.Drops) != 1 || held < 0 {
		t.Fatalf("drops %+v, held LZ %d; want the Pelican in orbit over an LZ the attacker holds", f.Snapshot.Drops, held)
	}
	n := len(h.d.sent)
	h.loop(labMsg(labOrderOp, labOrder{Side: battle.Attacker, Order: battle.Order{Kind: battle.Land, Target: 0, Point: held}}))
	for _, m := range h.d.sent[n:] {
		if m.op == labErrorOp {
			t.Fatalf("the landing was refused: %s", m.data)
		}
	}
	h.loop(labMsg(labControlOp, labControl{Step: 1}))
	if d := h.frame().Snapshot.Drops[0]; d.State != battle.Flying {
		t.Errorf("drop %+v; want it on its way", d)
	}
}

// quietLogger takes Init's Info and Warn lines too.
type quietLogger struct{ nopLogger }

func (quietLogger) Info(string, ...interface{}) {}
func (quietLogger) Warn(string, ...interface{}) {}

// fakeInitializer records what Init registers.
type fakeInitializer struct {
	runtime.Initializer
	names []string
}

func (f *fakeInitializer) RegisterRpc(id string, _ func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error)) error {
	f.names = append(f.names, id)
	return nil
}

func (f *fakeInitializer) RegisterMatch(name string, _ func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule) (runtime.Match, error)) error {
	f.names = append(f.names, name)
	return nil
}

func TestTheLabIsRegisteredOnlyWithHaloDev(t *testing.T) {
	t.Setenv("HALO_MODS", "base")
	t.Setenv("HALO_MODS_DIR", filepath.Join("..", "..", "..", "mods"))
	for _, dev := range []string{"", "1"} {
		t.Setenv("HALO_DEV", dev)
		in := &fakeInitializer{}
		if err := Init(context.Background(), quietLogger{}, nil, fakeNK{}, in); err != nil {
			t.Fatal(err)
		}
		if got := slices.Contains(in.names, labModule) && slices.Contains(in.names, "lab_create"); got != (dev == "1") {
			t.Errorf("HALO_DEV=%q: registered %v", dev, in.names)
		}
	}
}

// A setup that fails to build leaves the Battle that's running as it was.
func TestAFailedLabBuildKeepsTheRunningBattle(t *testing.T) {
	h := newLab(t)
	h.loop(labMsg(labSetupOp, kitSetup(5)))
	h.loop(labMsg(labControlOp, labControl{Step: 10}))
	h.loop(labMsg(labReplayOp, labReplay{Map: "base:nowhere"}))
	var e map[string]string
	if !h.d.last(t, labErrorOp, &e) {
		t.Fatal("a replay with an unknown map wasn't refused")
	}
	h.loop(labMsg(labControlOp, labControl{Step: 10}))
	if f := h.frame(); f.Tick != 20 || f.Thinking[battle.Attacker] == nil || f.Thinking[battle.Defender] == nil {
		t.Errorf("after the failed build: tick %d, thinking %v; want the Battle running on with its AIs", f.Tick, f.Thinking)
	}
}

func TestTheLabDeploysTheDefenderByItsLayout(t *testing.T) {
	h := newLab(t)
	h.loop(labMsg(labSetupOp, kitSetup(7)))
	var before labField
	h.d.last(t, labFieldOp, &before)
	setup := kitSetup(7)
	setup.Defend.Layout = battle.Layout{Sites: map[int]int{0: before.BuildingSites[1], 1: before.BuildingSites[0]}}
	h.loop(labMsg(labSetupOp, setup))
	var after labField
	h.d.last(t, labFieldOp, &after)
	if after.BuildingSites[0] != before.BuildingSites[1] || after.BuildingSites[1] != before.BuildingSites[0] {
		t.Errorf("sites %v, then %v with the two swapped; want them swapped", before.BuildingSites, after.BuildingSites)
	}
	for _, sq := range h.frame().Snapshot.Squads {
		if sq.Building && !sq.CommandPost && sq.Unit == "base:hall" && sq.Cell != after.Sites[after.BuildingSites[0]] {
			t.Errorf("the Hall deployed at %v; want its site %v", sq.Cell, after.Sites[after.BuildingSites[0]])
		}
	}
}

func TestTheLabPlaysADuelAsTheMatrixFightsIt(t *testing.T) {
	h := newLab(t)
	h.loop(labMsg(labDuelOp, labDuel{A: "base:warthog", B: "base:marine", Seed: 1}))
	f := h.frame()
	if f.Tick != 0 || !f.Paused || f.Thinking != [2]*battle.Thinking{} {
		t.Fatalf("first frame tick %d paused %v thinking %v; want the duel paused at the start, no AI", f.Tick, f.Paused, f.Thinking)
	}
	counts := map[battle.Side]int{}
	for _, sq := range f.Snapshot.Squads {
		if !sq.Building && !sq.CommandPost {
			counts[sq.Side] += sq.Count
		}
	}
	if counts[battle.Attacker] != 4 || counts[battle.Defender] != 12 {
		t.Errorf("squads %v; want 4 Warthogs against 12 Marines, 12 CP a side", counts)
	}
	c := h.m.content.Doc
	want := battle.NewDuel(&c, c.Rulesets["base:rules"], "base:warthog", 4, "base:marine", 12, 1)
	for !want.Over {
		battle.DuelStep(want)
	}
	for i := 0; i < 100 && !h.frame().Over; i++ {
		h.loop(labMsg(labControlOp, labControl{Step: 80}))
	}
	if f := h.frame(); f.Tick != want.Tick || f.Winner != want.Winner || f.Reason != want.Reason {
		t.Errorf("Lab duel ended tick %d, %v (%s); the matrix's tick %d, %v (%s)", f.Tick, f.Winner, f.Reason, want.Tick, want.Winner, want.Reason)
	}
	h.loop(labMsg(labDuelOp, labDuel{A: "base:warthog-m12a", B: "base:marine"}))
	var e map[string]string
	if !h.d.last(t, labErrorOp, &e) || !strings.Contains(e["error"], "duel matrix") {
		t.Errorf("a unit with no peer group: %v; want it refused", e)
	}
}

func TestTheLabFightsTheDuelMatrix(t *testing.T) {
	h := newLab(t)
	h.loop(labMsg(labDuelsOp, labDuels{Seeds: 1}))
	h.loop(labMsg(labDuelsOp, labDuels{Seeds: 1}))
	var e map[string]string
	if !h.d.last(t, labErrorOp, &e) || !strings.Contains(e["error"], "already running") {
		t.Errorf("a second run: %v; want it refused", e)
	}
	cells := map[[2]string]battle.DuelCell{}
	var units []string
	total, done := 0, false
	read := func() {
		for _, s := range h.d.sent {
			var m labMatrix
			if s.op != labMatrixOp || json.Unmarshal(s.data, &m) != nil {
				continue
			}
			if m.Units != nil { // the first, as it starts
				units = m.Units
			}
			for _, d := range m.Cells {
				cells[[2]string{d.A, d.B}] = d
			}
			total, done = m.Total, m.Done
		}
		h.d.sent = nil
	}
	read()
	for start := time.Now(); !done && time.Since(start) < time.Minute; {
		time.Sleep(time.Millisecond)
		h.loop()
		read()
	}
	if !done || len(units) == 0 || len(cells) != total || total != len(units)*(len(units)-1) {
		t.Fatalf("done %v, %d units, %d of %d cells; want every pair", done, len(units), len(cells), total)
	}
	if d := cells[[2]string{"base:warthog", "base:marine"}]; d.Want != battle.DuelWin || d.NA != 4 || d.NB != 12 {
		t.Errorf("Warthog against Marines %+v; want 4 against 12, meant to win", d)
	}
}
