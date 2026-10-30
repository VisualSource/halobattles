package nakama

import (
	"maps"
	"slices"

	"github.com/VisualSource/halobattles/server/internal/bot"
	"github.com/VisualSource/halobattles/server/internal/game"
)

// botRunner runs one Bot in its own goroutine (ADR 0006). The Match loop
// hands it its newest View after each tick and applies its commands on the
// next, through the same handle as a player's.
type botRunner struct {
	views    chan game.View   // the newest View only
	commands chan bot.Command // what it decided, waiting for the next tick
	rejected chan rejection
	done     chan struct{}
}

type rejection struct {
	seq    uint32
	reason string
}

func runBot(b *bot.Bot) *botRunner {
	r := &botRunner{
		views:    make(chan game.View, 1),
		commands: make(chan bot.Command, maxCommandsPerTick),
		rejected: make(chan rejection, maxCommandsPerTick),
		done:     make(chan struct{}),
	}
	go func() {
		for {
			select {
			case <-r.done:
				return
			case x := <-r.rejected:
				b.Rejected(x.seq, x.reason)
			case v := <-r.views:
				if !b.Due(v.Time) {
					continue
				}
				for _, c := range b.Think(v) {
					select {
					case r.commands <- c:
					default: // a full queue: like a player's flood, the rest is dropped
					}
				}
			}
		}
	}()
	return r
}

// see replaces any View the Bot hasn't read yet with v.
func (r *botRunner) see(v game.View) {
	select {
	case <-r.views:
	default:
	}
	r.views <- v
}

// startBots starts a Bot for each Bot Seat, their first thinks spread over
// one second so they don't all think on one tick.
func (s *matchState) startBots() {
	s.bots = map[string]*botRunner{}
	var seats []int
	for i, p := range s.play.Players {
		if p.Bot != "" {
			seats = append(seats, i)
		}
	}
	for n, i := range seats {
		p := s.play.Players[i]
		offset := int64(1000 * n / len(seats))
		s.bots[p.User] = runBot(bot.New(&s.content.Doc, i, p.Faction, p.Bot, s.seed, offset))
	}
}

// stopBots ends every Bot's goroutine; call it when the Match ends.
func (s *matchState) stopBots() {
	for _, r := range s.bots {
		close(r.done)
	}
	s.bots = nil
}

// botCommands applies what each Bot decided since the last tick, Bots in
// Seat order, and tells each of its refusals. It reports whether any
// command was accepted.
func (s *matchState) botCommands(tick int64) bool {
	changed := false
	for _, user := range slices.Sorted(maps.Keys(s.bots)) {
		r := s.bots[user]
	drain:
		for n := 0; ; n++ {
			select {
			case c := <-r.commands:
				seq, err := s.handle(user, int64(c.Op), c.Data, tick, n)
				s.lastSeq[user] = max(s.lastSeq[user], seq)
				if err == nil {
					changed = true
					continue
				}
				select {
				case r.rejected <- rejection{seq, err.Error()}:
				default: // it hasn't read the last ones yet; it plans again from its View anyway
				}
			default:
				break drain
			}
		}
	}
	return changed
}

// showBots hands each Bot its newest View.
func (s *matchState) showBots() {
	for user, r := range s.bots {
		r.see(s.play.View(&s.content.Doc, s.seat(user)))
	}
}
