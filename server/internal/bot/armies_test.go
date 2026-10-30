package bot

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

func marines(n int) [game.StacksPerPlanet]game.Stack {
	return [game.StacksPerPlanet]game.Stack{{{Unit: "base:marine", Count: n}}}
}

func TestAHomeGuardStaysAgainstTheEnemyNextDoor(t *testing.T) {
	b := hard(t)
	v := view(nil, 10) // a Marine scores 25
	b.seen = map[string]sighting{"b": {game.PlanetView{ID: "b", Owner: 1, Stacks: marines(8)}, v.Time}}
	// threat: half of b's 200; a Capital keeps half again: 150, 6 Marines.
	units, strength, kept := b.spare(b.newTurn(v), v.Planets[0])
	if strength != 100 || len(units) != 1 || units[0].Count != 4 || kept[0][0].Count != 6 {
		t.Errorf("spare %v (%v), kept %v; want 4 Marines out, 6 home", strength, units, kept)
	}
}

func TestArmiesGatherAtTheStagingPlanetAndGoAtTheMargin(t *testing.T) {
	b := hard(t)
	c := goal{kind: expand, target: "c"} // 10 Marines: 250, so 375 at the 1.5 margin
	order := func(cmd *Command) *wire.OrderArmyT {
		if cmd == nil {
			return nil
		}
		return decode(*cmd).(*wire.OrderArmyT)
	}

	v := both(view(nil, 20)) // 500 on a; b is a Lane nearer c
	tt := b.newTurn(v)
	if b.facts(tt, c)&strongEnough != 0 {
		t.Error("ready with nothing at the staging Planet b")
	}
	if o := order(b.gather(tt, c)); o == nil || o.FromPlanet != "a" || o.ToPlanet != "b" {
		t.Errorf("gathered %+v; want a's Marines sent to stage at b", o)
	}

	v.Planets[0].Stacks, v.Planets[1].Stacks = [game.StacksPerPlanet]game.Stack{}, marines(10) // 250 at b: short
	if o := order(b.sendArmy(b.newTurn(v), c)); o != nil {
		t.Errorf("attacked with 250 of the 375 needed: %+v", o)
	}

	v.Armies = []game.ArmyView{{Owner: 0, To: "b", Destination: "b", Units: []game.UnitSlot{{Unit: "base:marine", Count: 10}}}}
	tt = b.newTurn(v)
	if b.facts(tt, c)&strongEnough == 0 {
		t.Error("not ready with 10 more Marines on their way to b")
	}
	if o := order(b.sendArmy(tt, c)); o != nil {
		t.Errorf("went before the rest arrived: %+v", o)
	}

	v.Armies, v.Planets[1].Stacks = nil, marines(20)
	if o := order(b.sendArmy(b.newTurn(v), c)); o == nil || o.FromPlanet != "b" || o.ToPlanet != "c" || o.Units[0].Count != 20 {
		t.Errorf("ordered %+v; want b's 20 Marines at c", o)
	}

	v.Battles = []game.BattleView{{ID: 1, Planet: "c", Attacker: 0, Defender: game.Neutral}}
	if o := order(b.sendArmy(b.newTurn(v), c)); o != nil {
		t.Errorf("sent a second wave while attacking c: %+v", o)
	}
}

// e — a — b — c: c is staged from b, e from a. b's 10 Marines are too few
// for c's 10 at the 1.5 margin, so c's goal trains rather than gathers; e's
// goal mustn't pull b's units to a, or the next think c's pulls them back.
func TestTwoTargetsDontPullEachOthersStagedUnits(t *testing.T) {
	c := lineContent()
	m := c.Maps["base:line"]
	m.Planets = append(m.Planets[:3], cs.MapPlanet{ID: "e", Type: "base:std"})
	m.Lanes = []cs.Lane{{From: "e", To: "a"}, {From: "a", To: "b"}, {From: "b", To: "c"}}
	m.Garrisons = map[string]cs.Stacks{"c": {{{Unit: "base:marine", Count: 10}}}, "e": {{{Unit: "base:marine", Count: 20}}}}
	c.Maps["base:line"] = m
	b := New(c, 0, "base:unsc", "hard", 1, 0)
	v := both(view([]string{"base:barracks", "", ""}, 0))
	v.Planets[1].Stacks = marines(10)
	for _, cmd := range b.Think(v) {
		if o, ok := decode(cmd).(*wire.OrderArmyT); ok && o.FromPlanet == "b" && o.ToPlanet == "a" {
			t.Error("pulled the Marines staged at b for c back to a for e")
		}
	}
}

func TestTheAttackCountsAdvantageTiers(t *testing.T) {
	c := lineContent()
	c.Units["base:flamer"] = cs.Unit{Combat: cs.Combat{Hp: 10, Damage: "1d4", UnitClass: "base:infantry",
		Tiers: map[string]cs.CombatTiersValue{"base:infantry": "advantage"}}}
	b := New(c, 0, "base:unsc", "hard", 1, 0)
	g := goal{kind: expand, target: "c"} // 10 Marines
	v := both(view(nil, 0))
	v.Planets[1].Stacks = [game.StacksPerPlanet]game.Stack{{{Unit: "base:flamer", Count: 10}}}
	// The same 250 as c's Marines, but worth 1.5 times that against infantry: enough at the 1.5 margin.
	if !b.ready(b.newTurn(v), g) {
		t.Error("held back 10 Flamers, with Advantage, from 10 Marines")
	}
	v.Planets[1].Stacks = marines(10)
	if b.ready(b.newTurn(v), g) {
		t.Error("ready with 10 Marines against 10, below the 1.5 margin")
	}
}

func TestAFailedAttackAsksMoreOfTheNext(t *testing.T) {
	b := hard(t)
	g := goal{kind: expand, target: "c"} // 10 Marines: 15 is enough at the 1.5 margin
	v := both(view(nil, 0))
	v.Planets[1].Stacks = marines(15)
	v.Planets = append(v.Planets, game.PlanetView{ID: "c", Owner: game.Neutral, Stacks: marines(10)})
	think := func(battle bool) {
		v.Battles = nil
		if battle {
			v.Battles = []game.BattleView{{ID: 1, Planet: "c", Attacker: 0, Defender: game.Neutral}}
		}
		b.remember(v)
		b.learn(v)
	}
	think(true)
	think(false) // over, and c still neutral: it failed
	if b.ready(b.newTurn(v), g) {
		t.Error("ready with the same 15 Marines after an attack on c failed")
	}
	v.Planets[1].Stacks = marines(23) // 575: 250 × 1.5 × 1.5
	if !b.ready(b.newTurn(v), g) {
		t.Error("not ready with half as much again")
	}
	v.Planets[2].Owner = 0
	think(false)
	if b.failed["c"] != 0 {
		t.Error("taking c didn't clear its failures")
	}
}

func TestItRetreatsFromALostBattle(t *testing.T) {
	b := hard(t)
	b.Difficulty.RetreatBelowPercent = 50
	v := view(nil, 0)
	fight := func(own int) game.BattleView {
		return game.BattleView{Planet: "c", Attacker: 0, Defender: game.Neutral, Snapshot: battle.Snapshot{Squads: []battle.SquadView{
			{Side: battle.Attacker, Unit: "base:marine", Count: own},
			{Side: battle.Defender, Unit: "base:marine", Count: 10},
		}}}
	}
	if b.retreat(v, fight(4)) == nil {
		t.Error("stayed with 4 Marines against 10, below half")
	}
	if b.retreat(v, fight(5)) != nil {
		t.Error("Retreated at half the enemy's strength")
	}
	running := fight(1)
	running.RetreatAt = 100
	if b.retreat(v, running) != nil {
		t.Error("Retreated again while already Retreating")
	}
	defending := game.BattleView{Planet: "a", Attacker: 1, Defender: 0, Snapshot: battle.Snapshot{Squads: []battle.SquadView{
		{Side: battle.Defender, Unit: "base:marine", Count: 1},
		{Side: battle.Attacker, Unit: "base:marine", Count: 10},
	}}}
	if b.retreat(v, defending) != nil {
		t.Error("asked to Retreat from its only Planet, which the server refuses")
	}
	if b.retreat(both(v), defending) == nil {
		t.Error("stayed to lose a, with b to Retreat to")
	}
	b.Difficulty.RetreatBelowPercent = 0 // Easy
	if b.retreat(v, fight(1)) != nil {
		t.Error("Easy Retreated")
	}
}
