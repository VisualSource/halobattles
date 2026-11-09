package battle

import (
	"slices"
	"testing"
)

// Unit behaviours and the Hard AI's fixes (docs/specs/tactical-battle-spec.md#the-hard-ai-step-5).

func unitsOf(t *testing.T, s *Sim, unit string) *Squad {
	t.Helper()
	i := slices.IndexFunc(s.Squads, func(sq *Squad) bool { return sq.Unit == unit })
	if i < 0 {
		t.Fatalf("no %s on the field", unit)
	}
	return s.Squads[i]
}

func movesOf(os []Order, id int) []Order {
	var out []Order
	for _, o := range os {
		if o.Squad == id && o.Kind == Move {
			out = append(out, o)
		}
	}
	return out
}

func TestASquadNearlyWipedOutPullsBackToItsFriendsOnceThenRejoins(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(2)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	hurt, friend := s.Squads[0], s.Squads[1]
	freeAt(t, s, friend, hurt.Cell, 10)
	hurt.Members = hurt.Members[:1] // 1 of 5 left: under 30%
	ai := NewAI(WeightsOf(nil))
	v := View{s, Attacker}
	if m := movesOf(ai.Orders(v), hurt.ID); len(m) != 1 || m[0].Cell != friend.Cell {
		t.Fatalf("moves %v; want one to its friends at %v", m, friend.Cell)
	}
	for s.Tick = 1; s.Tick < pullbackSeconds*s.TPS(); s.Tick++ {
		if m := movesOf(ai.Orders(v), hurt.ID); len(m) > 0 {
			t.Fatalf("tick %d: sent %v while pulling back", s.Tick, m)
		}
	}
	s.Tick++
	if _, pulling := ai.pullback(v, hurt); pulling {
		t.Error("still pulling back after 10 s; want it to rejoin, and not pull back again")
	}
}

func TestAHangBackUnitFiresFromItsFullRangeBehindTheFront(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:rhino-m145d", 1, 0}, {"base:warthog", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	rhino, warthog, grunts := unitsOf(t, s, "base:rhino-m145d"), unitsOf(t, s, "base:warthog"), unitsOf(t, s, "base:grunt")
	freeAt(t, s, grunts, rhino.Cell, 20)
	to, ok := s.firingPosition(rhino, grunts.Cell, 1, 0)
	if !ok || dist(to, grunts.Cell) < rhino.reach-1 {
		t.Errorf("firing position %v, %.1f cells off; want one at about its full range, %.0f", to, dist(to, grunts.Cell), rhino.reach)
	}
	if d := s.standoff(rhino, grunts); d <= rhino.minRange {
		t.Errorf("standoff %.1f; want it to keep past its minRange, %.0f", d, rhino.minRange)
	}
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	if !ai.follower(v, rhino) || ai.follower(v, warthog) {
		t.Error("want the Rhino behind its Task Force's front and the Warthog leading it")
	}
}

func TestAnEscortFiresOnAircraftFirst(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:wolverine", 1, 0}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:banshee", 1, 1}}}})
	wolverine, grunts, banshee := unitsOf(t, s, "base:wolverine"), unitsOf(t, s, "base:grunt"), unitsOf(t, s, "base:banshee")
	freeAt(t, s, grunts, wolverine.Cell, 3)
	freeAt(t, s, banshee, wolverine.Cell, 5)
	s.see()
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	if got := ai.preferred(v, wolverine); got != banshee {
		t.Errorf("the Wolverine prefers %v; want the Banshee over the nearer Grunts", got)
	}
	if !ai.follower(v, wolverine) {
		t.Error("an escort leads its Task Force; want it with the main force")
	}
}

// An escort keeps the aircraft it's firing on while it can hit it, rather
// than switching to whichever is nearer now.
func TestAnEscortKeepsTheAircraftItsFiringOn(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:wolverine", 1, 0}}}},
		Force{Formations: [][]Slot{{{"base:banshee", 1, 0}, {"base:banshee", 1, 1}}}})
	wolverine := unitsOf(t, s, "base:wolverine")
	var banshees []*Squad
	for _, sq := range s.Squads {
		if sq.Unit == "base:banshee" {
			banshees = append(banshees, sq)
		}
	}
	freeAt(t, s, banshees[0], wolverine.Cell, 3)
	freeAt(t, s, banshees[1], wolverine.Cell, 5)
	s.see()
	wolverine.target = banshees[1].ID // the further one, picked when it was nearer
	ai := NewAI(WeightsOf(nil))
	if got := ai.preferred(View{s, Attacker}, wolverine); got != banshees[1] {
		t.Errorf("the Wolverine switches to squad %v; want it to keep the Banshee it's firing on", got.ID)
	}
}

func TestASeekCounterUnitGoesForWhatItCounters(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:odst", 4, 0}}}},
		Force{Formations: [][]Slot{{{"base:grunt", 5, 0}, {"base:ghost", 1, 1}}}})
	odst, grunts, ghost := unitsOf(t, s, "base:odst"), unitsOf(t, s, "base:grunt"), unitsOf(t, s, "base:ghost")
	freeAt(t, s, grunts, odst.Cell, 2)
	freeAt(t, s, ghost, odst.Cell, 4)
	s.see()
	ai := NewAI(WeightsOf(nil))
	if got := ai.preferred(View{s, Attacker}, odst); got != ghost {
		t.Errorf("the ODSTs prefer %v; want the Ghost they counter over the nearer Grunts", got)
	}
}

func TestARaiderPrefersRaidingBuildings(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:ghost", 1, 0}, {"base:revenant", 1, 1}}}},
		Force{Formations: [][]Slot{{{"base:marine", 1, 0}}}, Buildings: []string{"base:barracks"}})
	ghost, revenant, barracks := unitsOf(t, s, "base:ghost"), unitsOf(t, s, "base:revenant"), unitsOf(t, s, "base:barracks")
	at := Cell{10, 10}
	freeAt(t, s, ghost, at, 0)
	freeAt(t, s, revenant, at, 2)
	s.relocate(barracks, at.add(Cell{5, 0})) // in Sight, nearer than the Command Post, far enough that only a raider turns aside for it
	s.see()
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	ai.command(v, v.Own(), v.Enemies())
	if g := ai.plans[ghost.ID].goal; g.kind != raid || g.target != barracks.ID {
		t.Errorf("the Ghost's goal %s; want to raid the Barracks", goalNames[g.kind])
	}
	if g := ai.plans[revenant.ID].goal; g.kind == raid {
		t.Error("the Revenant, no raider, raids too; want it on the assault, so the Ghost's raid is its behaviour")
	}
}

func TestTheAttackerMassesOnTheAssault(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(8)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	ai.command(v, v.Own(), v.Enemies())
	for _, sq := range v.Own() {
		if p := ai.plans[sq.ID]; ai.roles[sq.ID] == noRole && (p == nil || p.goal.kind != assault) {
			t.Errorf("squad %d's goal %v; want every squad without a role (scout, skirmisher) on the assault, none touring pads", sq.ID, p)
		}
	}
}

func TestASquadGivesUpAChaseItHasNoShotIn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	m, grunts := s.Squads[0], unitsOf(t, s, "base:grunt")
	freeAt(t, s, grunts, m.Cell, 7) // in Sight, out of range
	s.see()
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	chase := goal{kind: kill, cell: grunts.Cell, target: grunts.ID}
	s.Tick = (chaseSeconds + 1) * s.TPS()
	ai.plans[m.ID] = &plan{goal: chase, inRangeAt: 0}
	ai.command(v, v.Own(), v.Enemies())
	if ai.plans[m.ID].goal.same(chase) {
		t.Fatal("still chasing after 7 s without a shot")
	}
	ai.plans[m.ID] = &plan{goal: chase, inRangeAt: s.Tick} // say the Commander offers it again at once
	s.Tick += s.TPS()
	ai.command(v, v.Own(), v.Enemies())
	if ai.plans[m.ID].goal.same(chase) {
		t.Error("took the chase it gave up straight back")
	}
}

// The chase clock runs only once its Task Force is going: a walk in while it
// gathers isn't a chase with no shot.
func TestAChaseClockWaitsWhileItsForceGathers(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 5, 0}}}})
	m, grunts := s.Squads[0], unitsOf(t, s, "base:grunt")
	freeAt(t, s, grunts, m.Cell, 7)
	s.see()
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	chase := goal{kind: kill, cell: grunts.Cell, target: grunts.ID}
	s.Tick = (chaseSeconds+1)*s.TPS() + 1 // between the Commander's passes
	ai.plans[m.ID] = &plan{goal: chase, inRangeAt: 0}
	ai.forceOf = map[int]*taskForce{m.ID: {goal: chase, members: []*Squad{m}, near: map[int]bool{}}} // still gathering
	ai.Orders(v)
	s.Tick += s.TPS() - 1
	ai.command(v, v.Own(), v.Enemies())
	if _, gave := ai.gaveUp[[2]int{m.ID, grunts.ID}]; gave {
		t.Error("gave up the chase 7 s in while its Task Force was still gathering")
	}
}

func TestASquadThatFellBackDoesntGoStraightBackIn(t *testing.T) {
	s := aiSim(t, Force{Formations: marines(1)}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	m := s.Squads[0]
	ai, v := NewAI(WeightsOf(nil)), View{s, Attacker}
	s.Tick = 10 * s.TPS()
	ai.rested[m.ID] = s.Tick - s.TPS() // back from falling back a second ago
	ai.command(v, v.Own(), v.Enemies())
	if g := ai.plans[m.ID].goal; g.kind.forms() {
		t.Errorf("goal %s a second after falling back; want it to wait 5 s before going in", goalNames[g.kind])
	}
	s.Tick += regroupSeconds * s.TPS()
	ai.command(v, v.Own(), v.Enemies())
	if g := ai.plans[m.ID].goal; g.kind != assault {
		t.Errorf("goal %s after 5 s; want it back on the assault", goalNames[g.kind])
	}
}

// The Command Post is a building like the rest to every tier: the Rhino
// counters it, as it counters buildings.
func TestTheCommandPostTakesStructureTiers(t *testing.T) {
	s := aiSim(t, Force{Formations: [][]Slot{{{"base:rhino-m145d", 1, 0}}}}, Force{Formations: [][]Slot{{{"base:grunt", 1, 0}}}})
	if got := s.tier(unitsOf(t, s, "base:rhino-m145d"), s.commandPost()); got != Counter {
		t.Errorf("the Rhino's tier against the Command Post %q; want counter", got)
	}
}
