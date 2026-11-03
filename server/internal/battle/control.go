package battle

import "slices"

// OrderKind is what an Order tells a squad to do.
type OrderKind int

const (
	Move   OrderKind = iota // go to Cell
	Attack                  // fire at Target whenever it can; Target 0 clears it
	Hold                    // stop, and fire at whatever's in range
	// Retreat starts the side's Retreat countdown; Squad is ignored. When it
	// runs out, every squad that can move heads off the field.
	Retreat
	CancelRetreat // calls the countdown off, until it runs out
	// Build starts a pad turret, Building, on pad Target; Squad is ignored.
	Build
	// AttackMove goes to Cell like Move, stopping to fight whatever it meets
	// that it can hit, and going on once nothing is left in range. Last, so
	// logged orders keep their numbers.
	AttackMove
	// Arrive puts a Dropship, Building, in orbit over the Battle with Cargo,
	// Owner's units: they join the side once it lands them.
	Arrive
	// Land sends Drop Target to Landing Zone Point.
	Land
)

// Order is one instruction to one of a side's squads.
type Order struct {
	Kind     OrderKind
	Squad    int
	Cell     Cell
	Target   int     // a squad id, or for Build a pad's index
	Building string  // for Build: the pad turret
	Pace     float64 // for Move: the most it moves a second, so squads keep together; 0 is its own speed
	Cargo    []Slot  `json:",omitempty"` // for Arrive: the troops
	Owner    int     `json:",omitempty"` // for Arrive: whose they are, a Seat
	Point    int     `json:",omitempty"` // for Land: the Landing Zone
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
		if sq.Side == v.Side && sq.alive() && !sq.Dropship { // a Dropship flies itself
			out = append(out, sq)
		}
	}
	return out
}

// Enemies lists the living enemy squads the side can see.
func (v View) Enemies() []*Squad {
	var out []*Squad
	for _, sq := range v.sim.Squads {
		if sq.Side != v.Side && sq.alive() && !sq.Dropship && v.sim.visible[v.Side][sq.ID] {
			out = append(out, sq)
		}
	}
	return out
}
