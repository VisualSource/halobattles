package bot

import (
	"errors"
	"path/filepath"
	"testing"

	modcontent "github.com/VisualSource/halobattles/server/internal/content"
	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// apply runs a Bot's command on s, as the server's handler would.
func apply(s *game.State, c *cs.Content, seat int, cmd Command) error {
	switch cmd.Op {
	case wire.OpQueueBuilding:
		x := wire.GetRootAsQueueBuilding(cmd.Data, 0)
		return s.QueueBuilding(c, seat, string(x.Planet()), int(x.Slot()), string(x.Building()))
	case wire.OpQueueUnit:
		x := wire.GetRootAsQueueUnit(cmd.Data, 0)
		return s.QueueUnit(c, seat, string(x.Planet()), int(x.Slot()), string(x.Unit()), int(x.Count()))
	case wire.OpOrderArmy:
		x := wire.GetRootAsOrderArmy(cmd.Data, 0).UnPack()
		var units []game.ArmyUnits
		for _, u := range x.Units {
			units = append(units, game.ArmyUnits{Stack: int(u.Stack), Unit: u.Unit, Count: int(u.Count)})
		}
		return s.OrderArmy(seat, x.FromPlanet, units, x.ToPlanet, int(x.ToStack))
	case wire.OpStartProject:
		x := wire.GetRootAsStartProject(cmd.Data, 0)
		return s.StartProject(c, seat, string(x.Tech()), string(x.Planet()), int(x.Slot()))
	case wire.OpBattleRetreat:
		return s.RetreatFromBattle(seat, string(wire.GetRootAsBattleRetreat(cmd.Data, 0).Planet()), false)
	case wire.OpExchange:
		x := wire.GetRootAsExchange(cmd.Data, 0)
		return s.Exchange(c, seat, string(x.Give()), string(x.Get()), int(x.Amount()))
	}
	return errors.New("not a command a Bot sends")
}

// A Bot alone on the sandbox from its Starting Kit, for 10 minutes of
// Match Time at the server's 5 ticks a second.
func TestABotBuildsTrainsAndResearchesWithoutDebt(t *testing.T) {
	for _, faction := range []string{"base:unsc", "base:covenant"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(faction+"/"+difficulty, func(t *testing.T) { playAlone(t, faction, difficulty) })
		}
	}
}

func playAlone(t *testing.T, faction, difficulty string) {
	base, err := modcontent.Load([]string{filepath.Join("..", "..", "..", "mods", "base")})
	if err != nil {
		t.Fatal(err)
	}
	c := &base.Doc
	// Not marked a Bot: a Match with no human in it is abandoned.
	s, err := game.StartMatch(c, "base:sandbox", []game.SeatSetup{{User: "u", Faction: faction}},
		c.Rulesets[game.RulesetID].StartingResources, 1)
	if err != nil {
		t.Fatal(err)
	}
	income := s.View(c, 0).Economy.Projected["base:credits"]
	b := New(c, 0, faction, difficulty, 1, 0)
	accepted := map[wire.Op]int{}
	waiting, samples, lost := 0, 0, 0
	taken := map[string]bool{}
	for now := int64(200); now <= 10*60_000; now += 200 {
		ev := s.Advance(c, now)
		if s.Result != nil {
			break // won: nothing moves after
		}
		v := s.View(c, 0)
		for _, x := range ev.Ended {
			if x.Winner != 0 { // alone on the map, every Battle is its attack
				lost++
			}
		}
		for _, x := range ev.Captures {
			taken[x.Planet] = true
		}
		for r, a := range v.Economy.Resources {
			if a < 0 {
				t.Fatalf("%d ms: in debt, %d %s", now, a, r)
			}
		}
		if now%10_000 == 0 { // a field with a hand has no Project: its Research is wasted
			for f := range v.Research.Rates {
				samples++
				if len(v.Research.Hands[f]) > 0 {
					waiting++
				}
			}
		}
		if !b.Due(now) {
			continue
		}
		for _, cmd := range b.Think(v) {
			if err := apply(s, c, 0, cmd); err != nil {
				t.Errorf("%d ms: op %v refused: %v", now, cmd.Op, err)
			}
			accepted[cmd.Op]++
		}
	}
	v := s.View(c, 0)
	if got := v.Economy.Projected["base:credits"]; got < 2*income {
		t.Errorf("Credits a Payday %d, from %d at the start; want its economy to have at least doubled it", got, income)
	}
	if accepted[wire.OpQueueUnit] == 0 {
		t.Error("never trained")
	}
	if waiting > samples/10 {
		t.Errorf("a field left waiting with a hand in %d of %d samples; want at most 10%%", waiting, samples)
	}
	t.Logf("took %v, lost %d Battles", taken, lost)
	// The Outpost is empty, Ridge and Depot weakly held, Vault strongly.
	if !taken["outpost"] {
		t.Error("never took the empty Outpost")
	}
	if difficulty != "easy" && (lost > 0 || !taken["ridge"] && !taken["depot"]) {
		t.Errorf("took %v, lost %d Battles; want a weak Planet taken, and no attack it couldn't win", taken, lost)
	}
}
