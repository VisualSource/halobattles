package game

import cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"

// Result is how a Match ended.
type Result struct {
	Winner int // a Seat, or Neutral for none
	Reason string
}

// Reasons a Match can end.
const (
	ReasonHold         = "hold"          // held the map's share of Planets for its hold time
	ReasonLastStanding = "last-standing" // everyone else was eliminated
)

// eliminate takes a player out: their Planets turn neutral, keeping their
// garrisons and buildings, and their Armies are destroyed, whether
// travelling, waiting or Retreating.
func (s *State) eliminate(seat int, ev *Events) {
	if s.Players[seat].Eliminated {
		return
	}
	s.Players[seat].Eliminated = true
	for _, p := range s.Planets {
		if p.Owner == seat {
			p.Owner, p.Queue, p.UnitQueues, p.Rally = Neutral, nil, nil, 0
		}
	}
	for id, a := range s.Armies {
		if a.Owner == seat {
			delete(s.Armies, id)
		}
	}
	ev.Eliminated = append(ev.Eliminated, seat)
}

// checkWin ends the Match when one player is left, or when one has held more
// than the map's share of Planets for its hold time. Dropping below the
// share cancels the hold.
func (s *State) checkWin(c *cs.Content, now int64, ev *Events) {
	var alive []int
	for _, p := range s.Players {
		if !p.Eliminated {
			alive = append(alive, p.Seat)
		}
	}
	if len(alive) <= 1 {
		winner := Neutral
		if len(alive) == 1 {
			winner = alive[0]
		}
		s.end(Result{Winner: winner, Reason: ReasonLastStanding}, ev)
		return
	}

	win := c.Maps[s.Map].Win
	counts := map[int]int{}
	for _, p := range s.Planets {
		counts[p.Owner]++
	}
	holder := Neutral
	for _, seat := range alive {
		if float64(counts[seat]) > win.PlanetShare*float64(len(s.Planets)) {
			holder = seat // the share is over 0.5, so there's at most one
		}
	}
	if holder != s.HoldSeat {
		s.HoldSeat, s.HoldEnds = holder, 0
		if holder != Neutral {
			s.HoldEnds = now + int64(win.HoldSeconds)*1000
		}
	}
	if holder != Neutral && now >= s.HoldEnds {
		s.end(Result{Winner: holder, Reason: ReasonHold}, ev)
	}
}

func (s *State) end(r Result, ev *Events) {
	s.Result = &r
	ev.MatchEnded = &r
}
