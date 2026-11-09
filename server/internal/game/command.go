package game

import (
	"errors"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

// A player commands a Battle's side instead of the AI (#92): their default
// when it starts, which they can change in its setup. It's fixed once the
// fighting starts.

// SetBattleControl sets seat's default for their Battles from now on.
func (s *State) SetBattleControl(seat int, command bool) {
	s.Players[seat].CommandBattles = command
}

// Switch is a side of a Battle changing hands at Tick: to a player
// commanding it, or to the AI. A replay makes each at its tick.
type Switch struct {
	Tick    int         `json:"tick"`
	Side    battle.Side `json:"side"`
	Command bool        `json:"command"`
}

// commands is whether seat commands their side of a Battle starting now: a
// player, not a Bot, who chose to by default. A player away when it starts
// gets the AI, as on a disconnect mid-Battle.
func (s *State) commands(seat int) bool {
	if seat == Neutral || s.Players[seat].Bot != "" || s.Players[seat].Disconnected {
		return false
	}
	return s.Players[seat].CommandBattles
}

// SetBattleCommand sets whether seat commands their side of the Battle on
// planet, over their default: only in its setup.
func (s *State) SetBattleCommand(seat int, planet string, command bool) error {
	b, side, err := s.sideIn(seat, planet)
	switch {
	case err != nil:
		return err
	case b.Sim.Tick >= b.Sim.Setup:
		return errors.New("the fighting has started: who fights it is fixed")
	case s.Players[seat].Bot != "":
		return errors.New("a Bot leaves its Battles to the AI")
	}
	b.control(side, command)
	return nil
}

// control hands side to a player commanding it, or to the AI, from now.
func (b *Battle) control(side battle.Side, command bool) {
	if b.commanded(side) == command {
		return
	}
	b.Switches = append(b.Switches, Switch{b.Sim.Tick, side, command})
	b.Sim.Controllers[side] = nil
	if !command {
		b.Sim.Controllers[side] = battle.NewAI(b.Weights[side])
	}
}

// BattleOrder orders seat's squads in the Battle on planet, which they must
// command. A group sent to a cell keeps its shape round it.
func (s *State) BattleOrder(seat int, planet string, kind battle.OrderKind, squads []int, cell battle.Cell, target int, queue bool) error {
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
	}
	return b.Sim.CommandGroup(side, squads, battle.Order{Kind: kind, Cell: cell, Target: target, Queue: queue})
}

// commanded is whether a player commands side now: as it started, then each
// Switch since.
func (b *Battle) commanded(side battle.Side) bool {
	on := b.Commanded[side]
	for _, sw := range b.Switches {
		if sw.Side == side {
			on = sw.Command
		}
	}
	return on
}

// handOver gives the AI each side seat commands in a Battle, for the rest of
// it: they disconnected.
func (s *State) handOver(seat int) {
	for _, b := range s.Battles {
		for side, who := range [2]int{b.Attacker, b.Defender} {
			if who == seat {
				b.control(battle.Side(side), false)
			}
		}
	}
}
