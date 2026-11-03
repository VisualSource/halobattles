package game

import (
	"strings"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

// commandedBattle is Seat 0 attacking b's Grunts with 10 Marines, commanding.
func commandedBattle(t *testing.T) (*State, *Battle) {
	t.Helper()
	s, c := fixedMatch(t), lineContent()
	s.SetBattleControl(0, true)
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	return s, onlyBattle(t, s)
}

func TestACommandedSideHasNoAI(t *testing.T) {
	s, b := commandedBattle(t)
	if !b.Commanded[battle.Attacker] || b.Sim.Controllers[battle.Attacker] != nil || b.Sim.Controllers[battle.Defender] == nil {
		t.Fatalf("commanded %v, controllers %v; want the attacker's to be the player's alone", b.Commanded, b.Sim.Controllers)
	}
	if !s.View(lineContent(), 0).Battles[0].Commanded {
		t.Error("the attacker's view doesn't say it's theirs to command")
	}
}

func TestAnArmyCanBeLeftToTheAIOverTheDefault(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.SetBattleControl(0, true)
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	if err := s.SetArmyControl(0, onlyArmy(t, s).ID, false); err != nil {
		t.Fatal(err)
	}
	s.Advance(c, 30_000)
	if b := onlyBattle(t, s); b.Commanded[battle.Attacker] {
		t.Error("the Army was set to Auto, but its Battle is commanded")
	}
}

func TestABotNeverCommands(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.Players[0].Bot, s.Players[0].CommandBattles = "easy", true
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Advance(c, 30_000)
	if b := onlyBattle(t, s); b.Commanded[battle.Attacker] || b.Sim.Controllers[battle.Attacker] == nil {
		t.Error("a Bot's Battle has no AI")
	}
}

func TestABattleThatStartsWhileYouAreAwayGetsTheAI(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	s.SetBattleControl(0, true)
	_ = s.OrderArmy(0, "a", marines(10), "b", 1)
	s.Disconnect(0, 120_000)
	s.Advance(c, 30_000)
	if b := onlyBattle(t, s); b.Commanded[battle.Attacker] || b.Sim.Controllers[battle.Attacker] == nil {
		t.Error("a Battle started while its commander was away has nobody running their side")
	}
}

func TestATooLongOrderIsRefused(t *testing.T) {
	s, b := commandedBattle(t)
	b.Sim.Tick = b.Sim.Setup
	ids := make([]int, len(b.Sim.Squads)+1)
	if err := s.BattleOrder(0, "b", battle.Hold, ids, battle.Cell{}, 0); err == nil || len(b.Sim.Log) != 0 {
		t.Errorf("err %v, %d logged; want a list longer than the Battle's squads refused, nothing logged", err, len(b.Sim.Log))
	}
}

func TestBattleOrdersGoToTheSquadsOfASideYouCommand(t *testing.T) {
	s, b := commandedBattle(t)
	marine := b.Sim.Squads[0]
	to := battle.Cell{X: b.Sim.Field.W / 2, Y: b.Sim.Field.H / 2}
	if err := s.BattleOrder(0, "b", battle.Move, []int{marine.ID}, to, 0); err == nil || !strings.Contains(err.Error(), "until the fighting starts") {
		t.Errorf("a move in setup: err %v", err)
	}
	b.Sim.Tick = b.Sim.Setup
	if err := s.BattleOrder(0, "b", battle.Move, []int{marine.ID}, to, 0); err != nil {
		t.Fatal(err)
	}
	if got := b.Sim.Log; len(got) != 1 || got[0].Order.Kind != battle.Move || got[0].Order.Squad != marine.ID {
		t.Errorf("logged %+v; want the Move, for replays", got)
	}

	s.Disconnect(0, 60_000)
	if b.Sim.Controllers[battle.Attacker] == nil || b.HandedOver[battle.Attacker] != b.Sim.Tick+1 {
		t.Fatalf("after a disconnect: controller %v, handed over %d; want the AI from now", b.Sim.Controllers[battle.Attacker], b.HandedOver)
	}
	s.Reconnect(0)
	if err := s.BattleOrder(0, "b", battle.Hold, []int{marine.ID}, to, 0); err == nil {
		t.Error("back from a disconnect, they took the Battle back from the AI")
	}
}
