package battle

import (
	"fmt"
	"slices"
	"testing"
	"time"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

func ruleset(c *cs.Content) cs.Ruleset { return c.Rulesets["base:rules"] }

func newSim(c *cs.Content, attack, defend Force, seed uint64) *Sim {
	r := ruleset(c)
	s := New(c, r, Generate(c, r.Battlefield, nil, seed), attack, defend, seed)
	s.Controllers = [2]Controller{NewAI(WeightsOf(nil)), NewAI(WeightsOf(nil))}
	return s
}

func run(s *Sim) {
	for !s.Over {
		s.Step()
	}
}

// kits are the two Starting Kits' first Stacks, plus the Capital's two
// buildings for the defender.
func kits() (unsc, covenant Force) {
	unsc = Force{Formations: [][]Slot{{{"base:marine", 10, 0}, {"base:warthog", 2, 1}}}}
	covenant = Force{Formations: [][]Slot{{{"base:grunt", 10, 0}, {"base:ghost", 2, 1}}},
		Buildings: []string{"base:hall", "base:warehouse", "", ""}}
	return
}

func TestDeploymentPlacesEverySquadOnItsOwnCell(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	unsc.Formations = append(unsc.Formations, unsc.Formations[0])
	s := newSim(c, unsc, cov, 1)
	if len(s.Squads) != 8 {
		t.Fatalf("%d squads, want 8", len(s.Squads))
	}
	seen := map[Cell]bool{}
	for _, sq := range s.Squads {
		if seen[sq.Cell] && !sq.air {
			t.Errorf("squad %d shares cell %v", sq.ID, sq.Cell)
		}
		seen[sq.Cell] = true
		if s.costsFor(sq.class)[s.Field.index(sq.Cell)] == 0 && !sq.Building {
			t.Errorf("squad %d (%s) on a cell it can't stand on", sq.ID, sq.Unit)
		}
	}
	for _, sq := range s.Squads {
		near := slices.ContainsFunc(s.Field.Points, func(p Cell) bool { return dist(p, sq.Cell) <= 6 })
		if sq.Side == Defender && !near {
			t.Errorf("defender %d at %v, far from every point %v", sq.ID, sq.Cell, s.Field.Points)
		}
	}
	for _, p := range s.Points {
		if p.Owner != Defender {
			t.Errorf("point %v starts with %v", p.Cell, p.Owner)
		}
	}
}

func TestBattleIsDeterministic(t *testing.T) {
	c := baseContent(t)
	result := func() string {
		unsc, cov := kits()
		s := newSim(c, unsc, cov, 42)
		run(s)
		out := fmt.Sprint(s.Tick, s.Winner, s.Reason)
		for _, sq := range s.Squads {
			out += fmt.Sprint(sq.Cell, len(sq.Members))
		}
		return out
	}
	if a, b := result(), result(); a != b {
		t.Errorf("same seed, different Battles:\n%s\n%s", a, b)
	}
}

func TestStartingKitsFightToAnEnd(t *testing.T) {
	c := baseContent(t)
	for seed := range uint64(5) {
		unsc, cov := kits()
		s := newSim(c, unsc, cov, seed)
		volleys := 0
		for !s.Over {
			volleys += len(s.Step())
		}
		if volleys == 0 {
			t.Errorf("seed %d: no one fired", seed)
		}
		if s.Tick > ruleset(c).Battle.TimeCap*TicksPerSecond {
			t.Errorf("seed %d: ran past the time cap", seed)
		}
		t.Logf("seed %d: %v wins by %s after %.1f s", seed, s.Winner, s.Reason, float64(s.Tick)/TicksPerSecond)
	}
}

// clearPoints moves every defender to a free cell out of range of every
// point.
func clearPoints(s *Sim) {
	for _, sq := range s.Squads {
		if sq.Side != Defender {
			continue
		}
		for i := range s.ground {
			c := s.Field.cell(i)
			if s.ground[i] == 0 && !slices.ContainsFunc(s.Points, func(p Point) bool { return dist(p.Cell, c) <= s.rules.CaptureRadius+1 }) {
				s.relocate(sq, c)
				break
			}
		}
	}
}

// stage clears the defenders off the points and puts squad a on point 0.
func stage(s *Sim, a *Squad) {
	clearPoints(s)
	if id := s.ground[s.Field.index(s.Points[0].Cell)]; id != 0 {
		s.relocate(s.squad(id), Cell{0, 0})
	}
	s.relocate(a, s.Points[0].Cell)
}

func TestPointChangesHandsAfterCaptureSeconds(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	a := s.Squads[0]
	stage(s, a)
	need := ticks(s.rules.CaptureSeconds)
	for range need - 1 {
		s.capture()
	}
	if s.Points[0].Owner != Defender || s.Points[0].Progress != need-1 {
		t.Fatalf("after %d ticks: %+v", need-1, s.Points[0])
	}
	s.capture()
	if s.Points[0].Owner != Attacker {
		t.Errorf("after %d ticks: %+v, want the attacker's", need, s.Points[0])
	}
}

func TestContestedPointDoesNotChangeHands(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	stage(s, s.Squads[0])
	d := s.Squads[2] // the Grunts
	p := s.Points[0].Cell
	for _, n := range steps {
		if to := p.add(n); s.ground[s.Field.index(to)] == 0 && s.costsFor(d.class)[s.Field.index(to)] > 0 {
			s.relocate(d, to)
			break
		}
	}
	for range 3 * ticks(s.rules.CaptureSeconds) {
		s.capture()
	}
	if s.Points[0].Owner != Defender || s.Points[0].Progress != 0 {
		t.Errorf("contested point: %+v", s.Points[0])
	}
}

func TestHoldingEnoughPointsWins(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.Controllers = [2]Controller{}
	clearPoints(s)
	for i := range s.rules.HoldPoints {
		s.Points[i].Owner = Attacker
	}
	for range ticks(s.rules.HoldSeconds) - 1 {
		s.capture()
		s.end()
	}
	if s.Over {
		t.Fatalf("over early: %v by %s", s.Winner, s.Reason)
	}
	s.capture()
	s.end()
	if !s.Over || s.Winner != Attacker || s.Reason != HeldPoints {
		t.Errorf("over %v, winner %v, reason %q", s.Over, s.Winner, s.Reason)
	}
}

func TestTimeCapGoesToTheDefender(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.Controllers = [2]Controller{} // nobody moves
	s.Tick = s.rules.TimeCap*TicksPerSecond - 1
	s.end()
	if s.Over {
		t.Fatal("over before the cap")
	}
	s.Tick++
	s.end()
	if !s.Over || s.Winner != Defender || s.Reason != TimeUp {
		t.Errorf("over %v, winner %v, reason %q", s.Over, s.Winner, s.Reason)
	}
}

func TestCoverAndHighGroundChangeTheToHitRoll(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 7)
	a, d := s.Squads[0], s.Squads[2]
	find := func(terrain string, height uint8) Cell {
		ti, _ := slices.BinarySearch(s.Field.Terrains, terrain)
		for i := range s.Field.Terrain {
			if int(s.Field.Terrain[i]) == ti && s.Field.Height[i] == height && s.ground[i] == 0 {
				return s.Field.cell(i)
			}
		}
		t.Fatalf("no free %s at height %d", terrain, height)
		return Cell{}
	}
	s.relocate(a, find("base:open", 1))
	s.relocate(d, find("base:forest", 0))
	if got := s.toHitMod(a, d); got != s.rules.HighGroundToHit-2 {
		t.Errorf("high ground into forest: %d, want %d", got, s.rules.HighGroundToHit-2)
	}
	if got := s.toHitMod(d, a); got != 0 {
		t.Errorf("up the hill onto open ground: %d, want 0", got)
	}
	ghost := s.Squads[3]
	s.Squads[3].air = true // as if it flew
	if got := s.toHitMod(a, ghost); got != 0 {
		t.Errorf("at a flyer: %d, want 0", got)
	}
}

func TestEveryMemberShoots(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	a, d := s.Squads[0], s.Squads[2] // 10 Marines, 10 Grunts
	for _, sq := range s.Squads {
		if sq != a && sq != d {
			sq.Members = nil
		}
	}
	s.relocate(d, a.Cell.add(Cell{0, 0}))
	near := slices.IndexFunc(steps[:], func(n Cell) bool {
		to := a.Cell.add(n)
		return to.X >= 0 && to.Y >= 0 && to.X < s.Field.W && to.Y < s.Field.H && s.costsFor(d.class)[s.Field.index(to)] > 0
	})
	s.relocate(d, a.Cell.add(steps[near]))
	s.see()
	vs := s.fire()
	if len(vs) == 0 || vs[0].Actor != a.ID || vs[0].Shots != 10 {
		t.Errorf("volleys %+v, want the Marines' first with 10 shots", vs)
	}
}

func TestPathGoesAroundWaterAndNotThroughCorners(t *testing.T) {
	// . . . . .
	// . W W W .
	// . . W . .
	f := &Field{W: 5, H: 3, Terrain: make([]uint8, 15), Height: make([]uint8, 15)}
	c := make(costs, 15)
	for i := range c {
		c[i] = 1
	}
	for _, w := range []Cell{{1, 1}, {2, 1}, {3, 1}, {2, 2}} {
		c[f.index(w)] = 0
	}
	got := f.path(c, Cell{1, 2}, Cell{3, 2}, nil)
	// Every diagonal here would cut a water corner.
	want := []Cell{{0, 2}, {0, 1}, {0, 0}, {1, 0}, {2, 0}, {3, 0}, {4, 0}, {4, 1}, {4, 2}, {3, 2}}
	if !slices.Equal(got, want) {
		t.Errorf("path %v, want %v", got, want)
	}
	if got := f.path(c, Cell{1, 2}, Cell{2, 1}, nil); len(got) == 0 || got[len(got)-1] == (Cell{2, 1}) {
		t.Errorf("into water: %v, want to stop next to it", got)
	}
}

func TestStepFitsTheBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("timing")
	}
	if r := testing.Benchmark(BenchmarkStep); r.NsPerOp() > 2_000_000 {
		t.Errorf("%v per step, over the 2 ms budget", time.Duration(r.NsPerOp()))
	}
}

// BenchmarkStep is the spec's budget: 45 squads a side plus 12 buildings,
// well under 2 ms a step.
func BenchmarkStep(b *testing.B) {
	c := baseContent(b)
	army := func(unit string) [][]Slot {
		var out [][]Slot
		for range 3 {
			var f []Slot
			for cell := range 15 {
				f = append(f, Slot{unit, 10, cell})
			}
			out = append(out, f)
		}
		return out
	}
	buildings := slices.Repeat([]string{"base:plasma-turret", "base:hall"}, 6)
	s := newSim(c, Force{Formations: army("base:marine")}, Force{Formations: army("base:grunt"), Buildings: buildings}, 1)
	b.ResetTimer()
	for b.Loop() {
		if s.Over {
			b.StopTimer()
			s = newSim(c, Force{Formations: army("base:marine")}, Force{Formations: army("base:grunt"), Buildings: buildings}, 1)
			b.StartTimer()
		}
		s.Step()
	}
}

func TestSnapshotsHideWhatASideCantSee(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.see()
	var hidden *Squad
	for _, sq := range s.Squads {
		if sq.Side == Defender && !s.visible[Attacker][sq.ID] {
			hidden = sq
		}
	}
	if hidden == nil {
		t.Fatal("every defender is in the attacker's Sight at the start; the test needs one out of it")
	}
	has := func(snap Snapshot, id int) bool {
		return slices.ContainsFunc(snap.Squads, func(v SquadView) bool { return v.ID == id })
	}
	if has(s.Snapshot(Attacker), hidden.ID) {
		t.Errorf("the attacker's snapshot shows hidden squad %d", hidden.ID)
	}
	if !has(s.Snapshot(Defender), hidden.ID) || !has(s.Snapshot(Attacker), s.Squads[0].ID) {
		t.Error("a side should see all its own squads")
	}

	shot := Volley{Actor: hidden.ID, Target: s.Squads[0].ID, Shots: 1}
	if got := s.VolleysFor(Attacker, []Volley{shot}); len(got) != 1 || got[0].Actor != 0 {
		t.Errorf("fire from the fog at the attacker: %+v, want it shown with the shooter hidden", got)
	}
	unseen := Volley{Actor: hidden.ID, Target: hidden.ID}
	if got := s.VolleysFor(Attacker, []Volley{unseen}); len(got) != 0 {
		t.Errorf("fire the attacker can't see at all: %+v, want none", got)
	}
}

// Regression: a vehicle deployed in a pocket of forest it couldn't leave,
// and the infantry queued behind it waited all Battle.
func TestEveryAttackerGetsMoving(t *testing.T) {
	c := baseContent(t)
	for seed := range uint64(30) {
		unsc, cov := kits()
		unsc.Formations = append(unsc.Formations, []Slot{{"base:marine", 5, 0}, {"base:warthog", 2, 1}, {"base:scorpion", 1, 2}, {"base:hornet", 1, 3}})
		s := newSim(c, unsc, cov, seed)
		start := map[int]Cell{}
		for _, sq := range s.Squads {
			start[sq.ID] = sq.Cell
		}
		moved := map[int]bool{}
		for !s.Over && s.Tick < 300 {
			s.Step()
			for _, sq := range s.Squads {
				moved[sq.ID] = moved[sq.ID] || sq.Cell != start[sq.ID]
			}
		}
		for _, sq := range s.Squads {
			if sq.Side == Attacker && !moved[sq.ID] && sq.alive() {
				t.Errorf("seed %d: %s squad %d never left %v", seed, sq.Unit, sq.ID, sq.Cell)
			}
		}
	}
}

func TestRetreatWaitsOutItsCountdownAndCanBeCalledOff(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	countdown := ticks(s.rules.RetreatCountdown)

	s.Command(Attacker, Order{Kind: Retreat})
	if s.RetreatAt[Attacker] != countdown || len(s.Log) != 1 {
		t.Fatalf("RetreatAt %d, log %v; want the countdown to end at tick %d, logged", s.RetreatAt[Attacker], s.Log, countdown)
	}
	s.Step()
	s.Command(Attacker, Order{Kind: CancelRetreat})
	if s.RetreatAt[Attacker] != 0 {
		t.Fatal("a Retreat in its countdown should be called off")
	}

	s.Command(Attacker, Order{Kind: Retreat})
	for s.Tick < s.RetreatAt[Attacker] { // it starts in the step for that tick
		s.Step()
	}
	if s.Retreating[Attacker] {
		t.Fatal("Retreating before the countdown ran out")
	}
	s.Step()
	if !s.Retreating[Attacker] {
		t.Fatal("not Retreating once the countdown ran out")
	}
	s.Command(Attacker, Order{Kind: CancelRetreat})
	if s.RetreatAt[Attacker] == 0 {
		t.Error("a Retreat under way can't be called off")
	}
}

func TestARetreatingAttackerLeavesTheFieldAndLoses(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.Command(Attacker, Order{Kind: Retreat})
	for !s.Over {
		for _, v := range s.Step() {
			if s.Retreating[Attacker] && s.squad(v.Actor).Side == Attacker {
				t.Fatalf("tick %d: a Retreating squad fired", s.Tick)
			}
		}
	}
	if s.Winner != Defender || s.Reason != Retreated {
		t.Errorf("winner %v by %q, want the defender by retreat", s.Winner, s.Reason)
	}
	for _, sq := range s.Squads {
		if sq.Side == Attacker && len(sq.Members) > 0 && !sq.Escaped {
			t.Errorf("attacker squad %d alive but still on the field", sq.ID)
		}
		if sq.Escaped && s.depth(s.Edge, sq.Cell) >= s.deployDepth {
			t.Errorf("squad %d escaped from %v, outside its exit strip", sq.ID, sq.Cell)
		}
	}
	if !slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Escaped }) {
		t.Error("nobody escaped")
	}
}

func TestARetreatingDefenderLeavesItsBuildingsBehind(t *testing.T) {
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.Controllers = [2]Controller{} // the attacker sits still
	s.Command(Defender, Order{Kind: Retreat})
	for !s.Over {
		s.Step()
	}
	if s.Winner != Attacker || s.Reason != Retreated {
		t.Errorf("winner %v by %q, want the attacker as the defender left", s.Winner, s.Reason)
	}
	for _, sq := range s.Squads {
		if sq.Building && (sq.Escaped || !sq.alive()) {
			t.Errorf("building %s escaped or died; it should stay", sq.Unit)
		}
	}
}

func TestASquadInTheWayIsCostlyNotAWall(t *testing.T) {
	// . . . . . . . . .
	// W W W W f W W W .    f: a friendly squad in the only near gap
	// . . . . . . . . .
	f := &Field{W: 9, H: 3, Terrain: make([]uint8, 27), Height: make([]uint8, 27)}
	c := make(costs, 27)
	for i := range c {
		c[i] = 1
	}
	for x := range 8 {
		if x != 4 {
			c[f.index(Cell{x, 1})] = 0
		}
	}
	friend := f.index(Cell{4, 1})
	crowd := func(i int) float64 {
		if i == friend {
			return friendCost
		}
		return 0
	}
	if got := f.path(c, Cell{4, 0}, Cell{4, 2}, crowd); !slices.Contains(got, Cell{4, 1}) {
		t.Errorf("path %v: with the far gap a long way round, it should queue through the friend", got)
	}
	if got := f.path(c, Cell{7, 0}, Cell{7, 2}, crowd); slices.Contains(got, Cell{4, 1}) {
		t.Errorf("path %v: with a free gap next to it, it should go round the friend", got)
	}
}
