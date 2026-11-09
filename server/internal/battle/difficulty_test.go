package battle

import (
	"fmt"
	"strings"
	"testing"
)

// Battle AI difficulty (docs/specs/tactical-battle-spec.md#difficulty-step-5c).

func limited(l Limits) *AI {
	w := WeightsOf(nil)
	w.Limits = l
	return NewAI(w)
}

func TestTheCommanderReplansAtItsDifficultysPace(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	m := s.Squads[0]
	ai, v := limited(Limits{Replan: 1.5}), View{s, Attacker}
	s.Tick = 10 // a second in: Hard's pass, not Normal's
	ai.Orders(v)
	if ai.plans[m.ID] != nil {
		t.Fatal("handed out goals at 1 s; want every 1.5 s")
	}
	s.Tick = 15
	ai.Orders(v)
	if ai.plans[m.ID] == nil {
		t.Error("no goals at 1.5 s")
	}
}

func TestANewSightingCountsOnlyAfterTheReactionTime(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	grunt := unitsOf(t, s, "base:grunt")
	ai, v := limited(Limits{React: 0.6}), View{s, Attacker}
	s.Tick = 100
	if got := ai.noticed(v, []*Squad{grunt}); len(got) != 0 {
		t.Fatal("reacted to a sighting at once; want after 0.6 s")
	}
	s.Tick = 106
	if got := ai.noticed(v, []*Squad{grunt}); len(got) != 1 {
		t.Fatal("still not reacting 0.6 s after the sighting")
	}
	ai.noticed(v, nil) // out of view
	if got := ai.noticed(v, []*Squad{grunt}); len(got) != 0 {
		t.Error("back in view, it reacted at once; want the reaction time afresh")
	}
}

// Somewhere on the field a Marine squad's best two goals (Grunts beside it,
// the Command Post) score within 20%;
// an AI that always takes the second-best there picks differently from Hard.
func TestAnEasyAITakesItsSecondBestGoalWhenItsClose(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	cpPhase(s)
	m := s.Squads[0]
	v := View{s, Attacker}
	for y := 2; y < s.Field.H-2; y += 2 {
		for x := 2; x < s.Field.W-2; x += 2 {
			if !s.standable(m, Cell{x, y}) {
				continue
			}
			s.relocate(m, Cell{x, y})
			if g := unitsOf(t, s, "base:grunt"); dist(g.Cell, m.Cell) > 3 {
				freeAt(t, s, g, m.Cell, 2) // an enemy to chase, against the Command Post far off
			}
			s.see()
			hard, easy := limited(Limits{}), limited(Limits{SecondBest: 1})
			th := easy.Think()
			hard.command(v, v.Own(), v.Enemies())
			easy.command(v, v.Own(), v.Enemies())
			if !hard.plans[m.ID].goal.same(easy.plans[m.ID].goal) {
				// The Lab's reason is the goal it took's: its own worth.
				ch := th.Choices[0]
				if want := fmt.Sprintf("worth %.2f", th.Goals[ch.Goal].Value); !strings.HasPrefix(ch.Why, want) {
					t.Errorf("why %q for a goal worth %.2f; want the second-best goal's own reason", ch.Why, th.Goals[ch.Goal].Value)
				}
				return
			}
		}
	}
	t.Error("nowhere did the second-best goal get taken")
}

func TestAnAIWithoutTacticsNeitherGathersNorFocusesFireNorKites(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(6)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	ai, v := limited(Limits{NoTactics: true}), View{s, Attacker}
	g := goal{kind: capture, cell: s.Points[0].Cell}
	ai.form(v, []goal{g}, [][]*Squad{v.Own()})
	for _, tf := range ai.forces {
		if !tf.going {
			t.Fatal("a Task Force gathers; want it in at once")
		}
		tf.target = unitsOf(t, s, "base:grunt").ID
	}
	m := s.Squads[0]
	if o := ai.aim(v, m, ai.forceOf[m.ID]); len(o) != 0 {
		t.Errorf("aim %v; want no focus fire", o)
	}
	ws := Force{Formations: [][]Slot{{{"base:warthog", 1, 0}}}}
	s = aiSim(t, ws, Force{Formations: [][]Slot{{{"base:marine", 5, 0}}}})
	w, marines := unitsOf(t, s, "base:warthog"), unitsOf(t, s, "base:marine")
	if s.standoff(w, marines) == 0 {
		t.Fatal("the Warthog doesn't kite Marines at all; the test needs one that does")
	}
	if d := ai.standoff(s, w, marines); d != 0 {
		t.Errorf("standoff %.1f; want no kiting", d)
	}
}

func TestAnAIWithoutBehavioursNeitherPullsBackNorSeeksCounters(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:odst", 4, 0}, {"base:marine", 5, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 1, 1}}}})
	odst, ghost := unitsOf(t, s, "base:odst"), unitsOf(t, s, "base:ghost")
	freeAt(t, s, unitsOf(t, s, "base:grunt"), odst.Cell, 2)
	freeAt(t, s, ghost, odst.Cell, 4)
	s.see()
	ai, v := limited(Limits{NoBehaviors: true}), View{s, Attacker}
	ai.own = v.Own()
	if got := ai.preferred(v, odst); got != nil {
		t.Errorf("the ODSTs seek %v out; want no seekCounter", got.Unit)
	}
	odst.Members = odst.Members[:1]
	if _, pulling := ai.pullback(v, odst); pulling {
		t.Error("pulls back; want no pullback")
	}
}
