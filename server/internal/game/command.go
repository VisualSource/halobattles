package game

import (
	"errors"
	"fmt"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

// A player commands a Battle's side instead of the AI (#92): their default,
// or the attacking Army's own choice. It's fixed when the Battle starts.

// SetBattleControl sets seat's default for their Battles from now on.
func (s *State) SetBattleControl(seat int, command bool) {
	s.Players[seat].CommandBattles = command
}

// SetArmyControl sets whether seat commands this Army's Battle.
func (s *State) SetArmyControl(seat int, id uint32, command bool) error {
	a := s.Armies[id]
	if a == nil || a.Owner != seat {
		return fmt.Errorf("you have no Army %d", id)
	}
	a.Command = command
	return nil
}

// commands is whether seat commands their side of a Battle starting now:
// a player, not a Bot, who chose to; an attacker by its Army's choice. A
// player away when it starts gets the AI, as on a disconnect mid-Battle.
func (s *State) commands(seat int, a *Army) bool {
	if seat == Neutral || s.Players[seat].Bot != "" || s.Players[seat].Disconnected {
		return false
	}
	if a != nil {
		return a.Command
	}
	return s.Players[seat].CommandBattles
}

// BattleOrder orders seat's squads in the Battle on planet, which they must
// command. A group sent to a cell keeps its shape round it.
func (s *State) BattleOrder(seat int, planet string, kind battle.OrderKind, squads []int, cell battle.Cell, target int) error {
	b, side, err := s.sideIn(seat, planet)
	if err != nil {
		return err
	}
	switch {
	case !b.commanded(side):
		return errors.New("the AI fights this Battle for you")
	case kind != battle.Move && kind != battle.AttackMove && kind != battle.Attack && kind != battle.Hold:
		return errors.New("that isn't a squad order")
	case len(squads) == 0:
		return errors.New("pick some squads")
	case side == battle.Attacker && b.Sim.Tick < b.Sim.Setup && kind != battle.Attack:
		return errors.New("your squads can't move until the fighting starts")
	}
	return b.Sim.CommandGroup(side, squads, battle.Order{Kind: kind, Cell: cell, Target: target})
}

// commanded is whether a player commands side now.
func (b *Battle) commanded(side battle.Side) bool {
	return b.Commanded[side] && b.HandedOver[side] == 0
}

// handOver gives the AI each side seat commands in a Battle, for the rest of
// it: they disconnected.
func (s *State) handOver(seat int) {
	for _, b := range s.Battles {
		for side, who := range [2]int{b.Attacker, b.Defender} {
			if who == seat && b.commanded(battle.Side(side)) {
				b.HandedOver[side] = b.Sim.Tick + 1
				b.Sim.Controllers[side] = battle.NewAI(b.Weights[side])
			}
		}
	}
}
