package battle

import (
	"cmp"
	"slices"
)

// OrderKind is what an Order tells a squad to do.
type OrderKind int

const (
	Move   OrderKind = iota // go to Cell
	Attack                  // fire at Target whenever it can
	Hold                    // stop, and fire at whatever's in range
	// Retreat starts the side's Retreat countdown; Squad is ignored. When it
	// runs out, every squad that can move heads off the field.
	Retreat
	CancelRetreat // calls the countdown off, until it runs out
)

// Order is one instruction to one of a side's squads.
type Order struct {
	Kind   OrderKind
	Squad  int
	Cell   Cell
	Target int
}

// Controller drives one side: each tick it reads the side's View and returns
// orders. The AI is one; a player will be another.
type Controller interface {
	Orders(v View) []Order
}

// View is what one side knows: the Field, the Control Points, its own squads
// and the enemies it can see.
//
// shortcut: it hands out *Squad, so a Controller could read or change more
// than its side should; fine while every Controller is ours, tighten before
// Plugins drive a side.
type View struct {
	sim  *Sim
	Side Side
}

func (v View) Tick() int       { return v.sim.Tick }
func (v View) Field() *Field   { return v.sim.Field }
func (v View) Points() []Point { return slices.Clone(v.sim.Points) }

// Own lists the side's living squads.
func (v View) Own() []*Squad {
	var out []*Squad
	for _, sq := range v.sim.Squads {
		if sq.Side == v.Side && sq.alive() {
			out = append(out, sq)
		}
	}
	return out
}

// Enemies lists the living enemy squads the side can see.
func (v View) Enemies() []*Squad {
	var out []*Squad
	for _, sq := range v.sim.Squads {
		if sq.Side != v.Side && sq.alive() && v.sim.visible[v.Side][sq.ID] {
			out = append(out, sq)
		}
	}
	return out
}

// Rush is a placeholder AI until the GOAP one. Once a second each squad
// attack-moves: the nearest enemy it can see within its Sight and can hit
// comes first, and once that enemy is in range it stops to fire. Otherwise
// it heads for the nearest Control Point its side doesn't hold.
type Rush struct{}

func (Rush) Orders(v View) []Order {
	var out []Order
	enemies := v.Enemies()
	nearest := func(from Cell, cells []Cell) Cell {
		return slices.MinFunc(cells, func(a, b Cell) int {
			return cmp.Or(cmp.Compare(dist2(from, a), dist2(from, b)), cmp.Compare(v.Field().index(a), v.Field().index(b)))
		})
	}
	for _, sq := range v.Own() {
		if sq.speed == 0 || (v.Tick()+sq.ID)%TicksPerSecond != 0 {
			continue // staggered, so squads don't all plan on the same tick
		}
		var foes []Cell
		for _, e := range enemies {
			if v.sim.tier(sq, e) != None && dist(sq.Cell, e.Cell) <= sq.sight {
				foes = append(foes, e.Cell)
			}
		}
		if len(foes) > 0 {
			foe := nearest(sq.Cell, foes)
			if d := dist(sq.Cell, foe); d <= sq.reach && d >= sq.minRange {
				if len(sq.path) > 0 {
					out = append(out, Order{Kind: Hold, Squad: sq.ID})
				}
				continue
			}
			out = append(out, Order{Kind: Move, Squad: sq.ID, Cell: foe})
			continue
		}
		var goals []Cell
		for _, p := range v.Points() {
			if p.Owner != v.Side {
				goals = append(goals, p.Cell)
			}
		}
		if len(goals) == 0 {
			continue
		}
		goal := nearest(sq.Cell, goals)
		if goal != sq.goal || (len(sq.path) == 0 && dist(sq.Cell, goal) > closeEnough) {
			out = append(out, Order{Kind: Move, Squad: sq.ID, Cell: goal})
		}
	}
	return out
}
