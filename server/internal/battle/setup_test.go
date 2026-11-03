package battle

import (
	"math"
	"testing"
)

// setupSim is a Starting Kit Battle with a 15 s setup phase.
func setupSim(t *testing.T, builds bool) *Sim {
	t.Helper()
	c := baseContent(t)
	unsc, cov := kits()
	s := newSim(c, unsc, cov, 3)
	s.Setup = 15 * TicksPerSecond
	s.Builders[Defender] = builds
	return s
}

func TestInSetupOnlyTheDefenderMovesAndNobodyFires(t *testing.T) {
	s := setupSim(t, true)
	at := map[int]Cell{}
	for _, sq := range s.Squads {
		at[sq.ID] = sq.Cell
	}
	for s.Tick < s.Setup {
		if vs := s.Step(); len(vs) > 0 {
			t.Fatalf("tick %d: %d volleys in setup", s.Tick, len(vs))
		}
	}
	if s.Over {
		t.Fatal("decided in setup")
	}
	moved := map[Side]bool{}
	for _, sq := range s.Squads {
		moved[sq.Side] = moved[sq.Side] || sq.Cell != at[sq.ID]
	}
	if moved[Attacker] || !moved[Defender] {
		t.Errorf("moved in setup: %v; want the defender only", moved)
	}
}

func TestADefenderThatCantBuildWaitsOutTheSetup(t *testing.T) {
	s := setupSim(t, false)
	at := map[int]Cell{}
	for _, sq := range s.Squads {
		at[sq.ID] = sq.Cell
	}
	for s.Tick < s.Setup {
		s.Step()
	}
	for _, sq := range s.Squads {
		if sq.Cell != at[sq.ID] {
			t.Errorf("squad %d (%s) moved in setup with no turret to build", sq.ID, sq.Unit)
		}
	}
}

func TestADefenderThatCanBuildTakesAPadInSetup(t *testing.T) {
	s := setupSim(t, true)
	for s.Tick < s.Setup {
		s.Step()
	}
	taken := 0
	for _, p := range s.Pads {
		if p.Owner == Defender {
			taken++
		}
	}
	if taken == 0 {
		t.Errorf("no pad taken in setup: %+v", s.Pads)
	}
}

func TestTheTimeCapAndARetreatInSetupCountFromTheFighting(t *testing.T) {
	s := setupSim(t, false)
	s.Command(Attacker, Order{Kind: Retreat})
	if want := s.Setup + ticks(s.rules.RetreatCountdown); s.RetreatAt[Attacker] != want {
		t.Errorf("Retreat ordered in setup ends at tick %d; want %d, its countdown from the first fighting tick", s.RetreatAt[Attacker], want)
	}
	s.Command(Attacker, Order{Kind: CancelRetreat})
	s.Controllers = [2]Controller{} // nobody moves: it can only end on time
	s.Tick = s.rules.TimeCap * TicksPerSecond
	s.end()
	if s.Over {
		t.Errorf("over by %s at %d ticks with %d of them setup; want the cap on fighting time only", s.Reason, s.Tick, s.Setup)
	}
}

func TestAPadOutOfSightShowsAsLastSeen(t *testing.T) {
	s := setupSim(t, true)
	pad := &s.Pads[0]
	for _, sq := range s.Squads {
		if sq.Side == Attacker && dist2(sq.Cell, pad.Cell) <= int(s.sightOf(sq)*s.sightOf(sq)) {
			t.Skip("the attacker starts in sight of this pad")
		}
	}
	pad.Owner, pad.Turret = Defender, 99
	s.see()
	if got := s.PadsFor(Attacker)[0]; got.Owner != NoSide || got.Turret != 0 {
		t.Errorf("the attacker sees pad %+v out of its Sight; want it as last seen, unowned", got)
	}
	if got := s.PadsFor(Defender)[0]; got.Owner != Defender || got.Turret != 99 {
		t.Errorf("the defender sees its own pad as %+v", got)
	}
	pad.Owner, pad.Turret = Attacker, 0 // taken, out of the defender's Sight
	for _, sq := range s.Squads {
		if sq.Side != Defender {
			continue
		}
		far := s.sightOf(sq) + 2 // buildings too: the test only needs no defender eyes on it
		for i := range s.ground {
			if c := s.Field.cell(i); s.ground[i] == 0 && (sq.Building || s.standable(sq, c)) && dist(c, pad.Cell) > far {
				s.relocate(sq, c)
				break
			}
		}
	}
	for _, sq := range s.Squads {
		if sq.Side == Defender && dist(sq.Cell, pad.Cell) <= s.sightOf(sq) {
			t.Fatalf("defender %d still has the pad in sight", sq.ID)
		}
	}
	s.see()
	if got := s.PadsFor(Defender)[0]; got.Owner != Attacker {
		t.Errorf("the defender lost its pad out of sight but sees it as %+v; want it to know it's the attacker's", got)
	}
	pad.Turret = 98 // built on after: that the defender doesn't learn
	s.see()
	if got := s.PadsFor(Defender)[0]; got.Turret != 0 {
		t.Errorf("the defender sees the attacker's turret %d on a pad out of its Sight", got.Turret)
	}
	pad.Owner, pad.Turret = Defender, 99
	s.see()
	a := s.Squads[0]
	s.relocate(a, pad.Cell.add(Cell{1, 0}))
	s.see()
	if got := s.PadsFor(Attacker)[0]; got.Owner != Defender {
		t.Errorf("the attacker, beside it, sees pad %+v; want it as it is", got)
	}
}

// A squad partway through taking a pad finishes it: the progress made counts,
// and it's in range already, though a fresh start couldn't make it in time.
func TestASquadPartwayThroughAPadKeepsTakingIt(t *testing.T) {
	s := setupSim(t, true)
	ai := NewAI(WeightsOf(nil))
	v := View{s, Defender}
	var sq *Squad
	for _, q := range s.Squads {
		if q.Side == Defender && !q.Building {
			sq = q
			break
		}
	}
	pad := &s.Pads[0]
	freeAt(t, s, sq, pad.Cell, int(s.rules.CaptureRadius))
	back := math.Inf(1)
	for _, p := range s.Points {
		back = min(back, dist(pad.Cell, p.Cell))
	}
	need := ticks(s.rules.CaptureSeconds)
	pad.Taker, pad.Progress = Defender, need-ticks(1) // 1 s to go
	// Time to walk back and take the last second, but not to start afresh.
	s.Tick = s.Setup - int(math.Ceil((back/sq.speed+1.5)*TicksPerSecond))
	if !ai.backInTime(v, sq, pad.Cell) {
		t.Errorf("a squad in range with 1 s of the pad to go gave up on it")
	}
	pad.Taker, pad.Progress = NoSide, 0
	if ai.backInTime(v, sq, pad.Cell) {
		t.Errorf("a fresh 5 s capture fits in %d ticks; want it not to", s.Setup-s.Tick)
	}
}
