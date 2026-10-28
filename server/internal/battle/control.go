package battle

import "slices"

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
	// Build starts a pad turret, Building, on pad Target; Squad is ignored.
	Build
)

// Order is one instruction to one of a side's squads.
type Order struct {
	Kind     OrderKind
	Squad    int
	Cell     Cell
	Target   int    // a squad id, or for Build a pad's index
	Building string // for Build: the pad turret
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
