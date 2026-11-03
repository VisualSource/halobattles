package battle

import (
	"errors"
	"math"
)

// maxSpread is the furthest, in cells, a squad of a group move lands from
// where the group was sent: a group strung out across the map closes up.
const maxSpread = 6

// Formation is where each of side's squads, by id, goes when the group is
// sent to at: each keeps its offset from the group's middle, closed up to
// maxSpread, on the nearest cell it can stand on. A squad that isn't the
// side's, or can't move, keeps at.
func (s *Sim) Formation(side Side, ids []int, at Cell) []Cell {
	var mx, my float64
	var group []*Squad
	for _, id := range ids {
		if sq := s.squad(id); sq != nil && sq.Side == side && sq.alive() && sq.speed > 0 {
			group = append(group, sq)
			mx += float64(sq.Cell.X)
			my += float64(sq.Cell.Y)
		}
	}
	out := make([]Cell, len(ids))
	for i := range out {
		out[i] = at
	}
	if len(group) == 0 {
		return out
	}
	mx, my = mx/float64(len(group)), my/float64(len(group))
	spread := 0.0
	for _, sq := range group {
		spread = max(spread, math.Hypot(float64(sq.Cell.X)-mx, float64(sq.Cell.Y)-my))
	}
	scale := 1.0
	if spread > maxSpread {
		scale = maxSpread / spread
	}
	taken := map[Cell]bool{}
	for i, id := range ids {
		sq := s.squad(id)
		if sq == nil || sq.Side != side || !sq.alive() || sq.speed == 0 {
			continue
		}
		want := Cell{
			at.X + int(math.Round((float64(sq.Cell.X)-mx)*scale)),
			at.Y + int(math.Round((float64(sq.Cell.Y)-my)*scale)),
		}
		out[i] = s.nearestStandable(sq, want, taken)
		taken[out[i]] = true
	}
	return out
}

// nearestStandable is the cell nearest want that sq can stand on and no
// other squad of the group is going to, within 4 cells; else want.
func (s *Sim) nearestStandable(sq *Squad, want Cell, taken map[Cell]bool) Cell {
	best, bestD := want, math.Inf(1)
	for y := -4; y <= 4; y++ {
		for x := -4; x <= 4; x++ {
			c := want.add(Cell{x, y})
			if d := float64(x*x + y*y); d < bestD && !taken[c] && s.standable(sq, c) {
				best, bestD = c, d
			}
		}
	}
	return best
}

// CommandGroup gives one order to a group of side's squads, by id, as a
// player's Commands: Move and AttackMove send each to its own cell of a
// Formation round o.Cell. A list longer than the Battle has squads is
// refused, so one message can't flood the log, as is an attacker's move in
// setup, which the sim would drop.
func (s *Sim) CommandGroup(side Side, ids []int, o Order) error {
	if len(ids) > len(s.Squads) {
		return errors.New("too many squads")
	}
	if s.setup() && side == Attacker && o.Kind != Attack {
		return errors.New("your squads can't move until the fighting starts")
	}
	cells := make([]Cell, len(ids))
	if o.Kind == Move || o.Kind == AttackMove {
		cells = s.Formation(side, ids, o.Cell)
	}
	for i, id := range ids {
		o.Squad, o.Cell = id, cells[i]
		s.Command(side, o)
	}
	return nil
}
