package bot

import (
	"math"
	"slices"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// A line, a — b — c — d. Seat 0 holds a; c has a neutral garrison of 10
// Marines; a Marine scores 10 HP × 2.5 average damage = 25.
func lineContent() *cs.Content {
	two := 2
	marine := cs.Combat{Hp: 10, Damage: "1d4", UnitClass: "base:infantry"}
	planet := func(id string) cs.MapPlanet { return cs.MapPlanet{ID: cs.LocalID(id), Type: "base:std"} }
	lane := func(a, b string) cs.Lane { return cs.Lane{From: cs.LocalID(a), To: cs.LocalID(b)} }
	return &cs.Content{
		Rulesets: map[string]cs.Ruleset{game.RulesetID: {BotDifficulties: []cs.BotDifficulty{
			{ID: "hard", ThinkSeconds: 2, AttackMargin: 1.5, PlanDepth: 8},
			{ID: "shallow", ThinkSeconds: 2, AttackMargin: 1.5, PlanDepth: 2},
		}}},
		Units: map[string]cs.Unit{"base:marine": {Faction: "base:unsc", Cost: map[string]int{"base:credits": 50}, CommandPoints: 1, Combat: marine}},
		Buildings: map[string]cs.Building{
			"base:turret":   {Faction: "base:unsc", Combat: &marine},
			"base:barracks": {Faction: "base:unsc", Cost: map[string]int{"base:credits": 150}, Trains: []cs.ID{"base:marine"}},
			"base:mine":     {Faction: "base:unsc", Cost: map[string]int{"base:credits": 200}, Extracts: map[string]int{"base:credits": 60}},
			"base:lab":      {Faction: "base:unsc", Cost: map[string]int{"base:credits": 250}, TechSlots: &two},
		},
		PlanetTypes: map[string]cs.PlanetType{"base:std": {BuildingSlots: 3, Income: map[string]int{"base:credits": 200}}},
		Maps: map[string]cs.GalaxyMap{"base:line": {
			Planets:   []cs.MapPlanet{planet("a"), planet("b"), planet("c"), planet("d")},
			Lanes:     []cs.Lane{lane("a", "b"), lane("b", "c"), lane("c", "d")},
			Garrisons: map[string]cs.Stacks{"c": {{{Unit: "base:marine", Count: 10}}}},
			Win:       cs.Win{PlanetShare: 0.6, HoldSeconds: 90},
		}},
	}
}

// view has Seat 0 on a with buildings and marines, b in sight and empty.
func view(buildings []string, marines int) game.View {
	a := game.PlanetView{ID: "a", Owner: 0, Capital: true, Buildings: buildings, Richness: map[string]string{"base:credits": "normal"}}
	if marines > 0 {
		a.Stacks[0] = game.Stack{{Unit: "base:marine", Count: marines}}
	}
	return game.View{
		Time: 10_000, Map: "base:line", You: 0, Hold: game.Hold{Seat: game.Neutral},
		Planets:  []game.PlanetView{a, {ID: "b", Owner: game.Neutral, Buildings: []string{"", "", ""}}},
		Economy:  game.Economy{Resources: map[string]int{"base:credits": 1000}, Caps: map[string]int{"base:credits": 3000}, CommandPointsCap: 20},
		Research: game.Research{Limit: 3},
	}
}

func hard(t *testing.T) *Bot {
	t.Helper()
	return New(lineContent(), 0, "base:unsc", "hard", 1, 0)
}

func TestStrengthIsTheThreatScore(t *testing.T) {
	if avgDice("2d6+1") != 8 || avgDice("1d4") != 2.5 || avgDice("x") != 0 {
		t.Errorf("avgDice: %v %v %v", avgDice("2d6+1"), avgDice("1d4"), avgDice("x"))
	}
	b := hard(t)
	v := view([]string{"", "", ""}, 4)
	if got := planetStrength(b.c, v.Planets[0]); got != 100 {
		t.Errorf("4 Marines score %v, want 100", got)
	}
	if got := b.estimate(v, "c"); got != 250 {
		t.Errorf("unseen c estimated at %v, want its map garrison's 250", got)
	}
	v.Planets[0].Buildings[0] = "base:turret"
	if p, s := planetStrength(b.c, v.Planets[0]), stacksStrength(b.c, v.Planets[0]); p != 125 || s != 100 {
		t.Errorf("4 Marines and a turret: planet %v, stacks %v; want 125, and 100 that can leave", p, s)
	}
}

func count(cmds []Command, op wire.Op) int {
	n := 0
	for _, c := range cmds {
		if c.Op == op {
			n++
		}
	}
	return n
}

func TestOneTrainerAtATime(t *testing.T) {
	cmds := hard(t).Think(view([]string{"", "", ""}, 0))
	trainers := 0
	for _, c := range cmds {
		if q, ok := decode(c).(*wire.QueueBuildingT); ok && q.Building == "base:barracks" {
			trainers++
		}
	}
	if trainers != 1 {
		t.Errorf("%d barracks queued in one think, want 1: the rest wait for it", trainers)
	}

	v := view([]string{"", "", ""}, 0)
	v.Planets[0].Queue = []game.QueueItem{{Slot: 0, Building: "base:barracks"}}
	for _, c := range hard(t).Think(v) {
		if q, ok := decode(c).(*wire.QueueBuildingT); ok && q.Building == "base:barracks" {
			t.Errorf("another barracks queued at slot %d with one already building", q.Slot)
		}
	}
}

func TestAtTheCommandPointCapItBuildsInstead(t *testing.T) {
	v := view([]string{"base:barracks", "", ""}, 4)
	v.Economy.CommandPointsUsed = v.Economy.CommandPointsCap
	cmds := hard(t).Think(v)
	if n := count(cmds, wire.OpQueueUnit); n != 0 {
		t.Errorf("%d unit orders at the cap, want none", n)
	}
	if n := count(cmds, wire.OpQueueBuilding); n == 0 {
		t.Error("no building queued: training at the cap spent the budget on paper")
	}
}

func TestOldSightingsCountLess(t *testing.T) {
	b := hard(t)
	b.remember(view(nil, 0))
	s := b.seen["b"]
	if f := freshness(s, s.at); f != 1 {
		t.Errorf("fresh: %v", f)
	}
	if f := freshness(s, s.at+staleAfter); f != 0.5 {
		t.Errorf("after staleAfter: %v, want half", f)
	}
	v := view(nil, 0)
	v.Planets = v.Planets[:1] // b out of sight now
	b.remember(v)
	if _, ok := b.seen["b"]; !ok {
		t.Error("b forgotten once out of sight")
	}
}

func find(gs []goal, key string) (goal, int) {
	i := slices.IndexFunc(gs, func(g goal) bool { return g.key() == key })
	if i < 0 {
		return goal{}, -1
	}
	return gs[i], i
}

func TestTheCommanderPrefersNearWeakPlanetsAndDefendsWhenThreatened(t *testing.T) {
	b := hard(t)
	v := view([]string{"base:barracks", "", ""}, 4)
	b.remember(v)
	gs := b.goals(v)
	eb, ib := find(gs, "expand:b")
	ec, ic := find(gs, "expand:c")
	if ib < 0 || ic < 0 || eb.score <= ec.score {
		t.Errorf("expand b %v (#%d), c %v (#%d); want the near, empty b first", eb.score, ib, ec.score, ic)
	}

	v.Armies = []game.ArmyView{{ID: 1, Owner: 1, To: "a", Units: []game.UnitSlot{{Unit: "base:marine", Count: 20}}}}
	gs = b.goals(v)
	if gs[0].key() != "defend:a" {
		t.Errorf("goals %v; want defend:a first with 20 Marines inbound against 4", keys(gs))
	}
}

func keys(gs []goal) []string {
	var out []string
	for _, g := range gs {
		out = append(out, g.key())
	}
	return out
}

func TestWeightsAndTheCurrentGoalScaleScores(t *testing.T) {
	b := hard(t)
	v := view([]string{"base:barracks", "", ""}, 4)
	b.remember(v)
	base, _ := find(b.goals(v), "expand:b")

	b.Weights.Expand = 2
	b.current = map[string]bool{"expand:b": true}
	got, _ := find(b.goals(v), "expand:b")
	if math.Abs(got.score-base.score*2*1.25) > 1e-9 {
		t.Errorf("score %v, want %v × 2 (weight) × 1.25 (current)", got.score, base.score)
	}
}

func TestWinConditionsSteerTheGoals(t *testing.T) {
	b := hard(t)
	v := view([]string{"base:barracks", "", ""}, 4)
	b.remember(v)
	scoreOf := func(g goal) float64 { s, _ := find(b.goals(v), g.key()); return s.score }
	plain := scoreOf(goal{kind: expand, target: "b"})

	v.Hold = game.Hold{Seat: 0} // the Bot holds the share
	if got := b.winRules(v, &goal{kind: defend, target: "a"}, 1, 4); got != 3*2 {
		t.Errorf("defend own Capital while holding: ×%v, want ×3 for the hold, ×2 for the Capital", got)
	}
	// 1 Planet of the 3 needed counts as nearing the share (×1.5); holding
	// it replaces that with ×0.5.
	if got := scoreOf(goal{kind: expand, target: "b"}); math.Abs(got-plain/3) > 1e-9 {
		t.Errorf("expand while holding %v, want %v / 1.5 × 0.5", got, plain)
	}

	v.Hold = game.Hold{Seat: 1} // an enemy holds it, from c
	b.seen["c"] = sighting{game.PlanetView{ID: "c", Owner: 1}, v.Time}
	if got := b.winRules(v, &goal{kind: attack, target: "c"}, 1, 4); got != 3 {
		t.Errorf("attack the holder: ×%v, want ×3", got)
	}
}

func TestThePlannerFindsTheCheapestFirstStep(t *testing.T) {
	if a := plan(canBuildTrainer, armySent, 3); a == nil || a.name != "buildTrainer" {
		t.Errorf("no production: first step %v, want buildTrainer", a)
	}
	if a := plan(canBuildTrainer, armySent, 2); a != nil {
		t.Errorf("3 steps needed, depth 2: %v, want none", a.name)
	}
	if a := plan(hasProduction|strongEnough, armySent, 1); a == nil || a.name != "sendArmy" {
		t.Errorf("strong enough: %v, want sendArmy", a)
	}
	if a := plan(armySent, armySent, 3); a != nil {
		t.Errorf("already there: %v, want nothing to do", a.name)
	}
}

func decode(c Command) any {
	switch c.Op {
	case wire.OpOrderArmy:
		return wire.GetRootAsOrderArmy(c.Data, 0).UnPack()
	case wire.OpQueueBuilding:
		return wire.GetRootAsQueueBuilding(c.Data, 0).UnPack()
	case wire.OpQueueUnit:
		return wire.GetRootAsQueueUnit(c.Data, 0).UnPack()
	case wire.OpStartProject:
		return wire.GetRootAsStartProject(c.Data, 0).UnPack()
	case wire.OpExchange:
		return wire.GetRootAsExchange(c.Data, 0).UnPack()
	}
	return nil
}

func TestThinkSendsFirstStepsAsCommands(t *testing.T) {
	b := hard(t)
	v := view([]string{"base:barracks", "base:lab", ""}, 4)
	v.Research.Hand = []string{"base:drill"}
	cmds := b.Think(v)

	var order *wire.OrderArmyT
	var project *wire.StartProjectT
	var build *wire.QueueBuildingT
	seqs := map[uint32]bool{}
	for _, c := range cmds {
		switch x := decode(c).(type) {
		case *wire.OrderArmyT:
			if order != nil {
				t.Errorf("a second order %+v; the Marines were already sent", x)
			}
			order, seqs[x.Seq] = x, true
		case *wire.StartProjectT:
			project, seqs[x.Seq] = x, true
		case *wire.QueueBuildingT:
			build, seqs[x.Seq] = x, true
		case *wire.QueueUnitT:
			seqs[x.Seq] = true
		}
	}
	if order == nil || order.FromPlanet != "a" || order.ToPlanet != "b" || order.Units[0].Count != 4 {
		t.Errorf("order %+v; want a's 4 Marines sent to take the empty b", order)
	}
	if project == nil || project.Tech != "base:drill" || project.Planet != "a" || project.Slot != 1 {
		t.Errorf("project %+v; want the card researched in a's Lab", project)
	}
	if build == nil || build.Building != "base:mine" || build.Slot != 2 {
		t.Errorf("build %+v; want a Mine in a's free slot", build)
	}
	if len(seqs) != len(cmds) {
		t.Errorf("%d commands with %d distinct seqs", len(cmds), len(seqs))
	}

	shallow := New(lineContent(), 0, "base:unsc", "shallow", 1, 0)
	nothing := view([]string{"", "", ""}, 0)
	for _, c := range shallow.Think(nothing) {
		if c.Op == wire.OpOrderArmy || c.Op == wire.OpQueueUnit {
			t.Errorf("depth 2 with no production planned %v; building, training and sending takes 3", c.Op)
		}
	}
}
