package battle

import "slices"

// Reinforcements (#57): a Dropship over the Battle, waiting in orbit until
// it's sent to a Landing Zone its side holds, by a commanding player or, after
// the Ruleset's landingDelay, by the sim. It flies in from the corner opposite
// the Landing Zone, drops its troops round it, and flies back out, once a
// Battle. It never fires and can't be fired on (#100 adds anti-air).

// DropState is where a Dropship is.
type DropState int

const (
	Orbit  DropState = iota // waiting to be sent
	Flying                  // on its way in, or out once it has landed its troops
	Done                    // gone back out: it can't land again this Battle
)

// Drop is one Dropship and the troops it carries.
type Drop struct {
	Side   Side
	Owner  int // the player whose units these are, a Seat: the sim only carries it
	Unit   string
	Cargo  []Slot
	State  DropState
	Point  int  // the Landing Zone it's sent to, once it is
	At     int  // the tick it arrived in orbit
	Squad  int  // the Dropship's squad, once it's flying
	Landed bool // its troops are on the field
	from   Cell // the corner it came in at, and goes out by
}

// TroopCount is how many troops a Drop carries.
func (d Drop) TroopCount() int {
	n := 0
	for _, sl := range d.Cargo {
		n += sl.Count
	}
	return n
}

// SendsAt is the tick the sim sends a Drop still in orbit, if nobody has.
func (s *Sim) SendsAt(d Drop) int {
	return d.At + ticks(s.rules.LandingDelay)
}

// arrive puts a Dropship in orbit: an Arrive order, logged, so replays land
// the same troops.
func (s *Sim) arrive(side Side, o Order) {
	if _, ok := s.content.Units[o.Building]; !ok || len(o.Cargo) == 0 {
		return
	}
	s.Drops = append(s.Drops, Drop{Side: side, Owner: o.Owner, Unit: o.Building, Cargo: slices.Clone(o.Cargo), At: s.Tick, Point: -1})
}

// CanLand is why side can't send Drop k to Landing Zone p, or nil.
func (s *Sim) CanLand(side Side, k, p int) error {
	switch {
	case k < 0 || k >= len(s.Drops) || s.Drops[k].Side != side:
		return errNoDrop
	case s.Drops[k].State != Orbit:
		return errDropUsed
	case p < 0 || p >= len(s.Points) || s.Points[p].Owner != side:
		return errNotHeld
	case s.setup():
		return errDropSetup
	case s.Retreating[side]:
		return errDropRetreat
	}
	return nil
}

var (
	errNoDrop      = dropError("no such Dropship")
	errDropUsed    = dropError("that Dropship has already landed its troops this Battle")
	errNotHeld     = dropError("land at a Landing Zone your side holds")
	errDropSetup   = dropError("Dropships wait for the fighting to start")
	errDropRetreat = dropError("your side is Retreating")
)

type dropError string

func (e dropError) Error() string { return string(e) }

// launch sends Drop k to Landing Zone p: its Dropship takes the field at the
// corner farthest from it, and flies there.
func (s *Sim) launch(k, p int) {
	d := &s.Drops[k]
	at := s.Points[p].Cell
	f := s.Field
	corners := []Cell{{0, 0}, {f.W - 1, 0}, {0, f.H - 1}, {f.W - 1, f.H - 1}}
	from := corners[0]
	for _, c := range corners[1:] {
		if dist2(c, at) > dist2(from, at) {
			from = c
		}
	}
	cb := s.content.Units[d.Unit].Combat
	sq := &Squad{Side: d.Side, Unit: d.Unit, Dropship: true, Drop: k + 1, Formation: -1, Slot: -1}
	s.stats(sq, &cb)
	sq.Members = []Layers{sq.layers(&cb)}
	s.place(sq, from)
	sq.goal = at
	sq.path = f.path(s.costsFor(sq.class), sq.Cell, at, nil)
	d.State, d.Point, d.Squad, d.from = Flying, p, sq.ID, sq.Cell
	s.see() // the visibility tables grow with it
}

// dropships sends Drops that have waited out the landing delay, lands the
// troops of those that have reached their Landing Zone, and takes those that
// have flown back out off the field.
func (s *Sim) dropships() {
	if s.setup() {
		return
	}
	for k := range s.Drops {
		d := &s.Drops[k]
		switch d.State {
		case Orbit:
			if s.Tick >= s.SendsAt(*d) && !s.Retreating[d.Side] {
				if p := s.landingFor(d.Side); p >= 0 {
					s.launch(k, p)
				}
			}
		case Flying:
			sq := s.squad(d.Squad)
			switch {
			case !d.Landed && len(sq.path) == 0:
				s.unload(k)
				sq.goal = d.from
				sq.path = s.Field.path(s.costsFor(sq.class), sq.Cell, d.from, nil)
			case d.Landed && len(sq.path) == 0:
				sq.Escaped, d.State = true, Done // out the way it came
				s.layer(sq)[s.Field.index(sq.Cell)] = 0
			}
		}
	}
}

// landingFor is the Landing Zone the sim sends side's Dropships to: the one
// it holds nearest the Command Post, the attacker's way in and the
// defender's home; -1 holding none, so it waits in orbit.
func (s *Sim) landingFor(side Side) int {
	best := -1
	cp := s.Field.CommandPost
	for i, p := range s.Points {
		if p.Owner == side && (best < 0 || dist2(p.Cell, cp) < dist2(s.Points[best].Cell, cp)) {
			best = i
		}
	}
	return best
}

// unload drops Drop k's troops round its Landing Zone: new squads, with
// their Drop, that the side's AI takes into its plans as it next thinks.
func (s *Sim) unload(k int) {
	d := &s.Drops[k]
	at := s.Points[d.Point].Cell
	first := len(s.Squads)
	for i, sl := range d.Cargo {
		sl.Cell = i
		s.addUnit(d.Side, 0, sl, at.add(along[s.Edge].scale(i%5-2)).add(inward[s.Edge].scale(i/5)))
	}
	for _, sq := range s.Squads[first:] {
		// Landing after its side's Retreat began: straight back out with the rest.
		sq.Drop, sq.retreating = k+1, s.Retreating[d.Side]
	}
	d.Landed = true
	s.see()
}
