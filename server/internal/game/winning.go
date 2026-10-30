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
	ReasonAbandoned    = "abandoned"     // every remaining player ran out their Grace Period
)

// Disconnect starts a player's Grace Period. The Match never pauses: their
// queues, Payday and Armies carry on.
func (s *State) Disconnect(seat int, graceMs int64) {
	p := &s.Players[seat]
	p.Disconnected, p.GraceEnds = true, s.Time+graceMs
}

// Reconnect puts a returning player back in their Seat.
func (s *State) Reconnect(seat int) {
	p := &s.Players[seat]
	p.Disconnected, p.GraceEnds = false, 0
}

// Forfeit eliminates a player on the next tick: they surrendered or left.
func (s *State) Forfeit(seat int) {
	s.Players[seat].Forfeiting = true
}

// eliminate takes a player out: their Planets turn neutral, keeping their
// garrisons and buildings, but their Labs are left empty; and their Armies
// are destroyed, whether travelling, waiting or Retreating.
func (s *State) eliminate(seat int, ev *Events) {
	if s.Players[seat].Eliminated {
		return
	}
	s.Players[seat].Eliminated = true
	for _, p := range s.Planets {
		if p.Owner == seat {
			p.Owner, p.Queue, p.UnitQueues, p.Rally, p.Techs = Neutral, nil, nil, 0, nil
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
//
// A Forfeit (surrendering, leaving, or running out the Grace Period)
// eliminates the player first. The last player standing must be connected
// to win; while they're away the Match waits for them to return or run out,
// and with no player left, Bots or not, it's abandoned.
func (s *State) checkWin(c *cs.Content, now int64, ev *Events) {
	for i, p := range s.Players {
		if !p.Eliminated && (p.Forfeiting || p.Disconnected && p.GraceEnds <= now) {
			s.eliminate(i, ev)
		}
	}
	var alive []int
	players := 0 // still in, not Bots
	for _, p := range s.Players {
		if !p.Eliminated {
			alive = append(alive, p.Seat)
			if p.Bot == "" {
				players++
			}
		}
	}
	switch {
	case players == 0: // Bots never keep a Match going alone
		s.end(Result{Winner: Neutral, Reason: ReasonAbandoned}, ev)
		return
	case len(s.Players) == 1:
		// A Match started alone has no one to outlast: only the hold, or a Forfeit, ends it.
	case len(alive) == 1 && !s.Players[alive[0]].Disconnected:
		s.end(Result{Winner: alive[0], Reason: ReasonLastStanding}, ev)
		return
	case len(alive) == 1:
		return // waiting for the last player to return, or run out their grace
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
