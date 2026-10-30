// Package bot plays a Seat on the galaxy map from its View, sending only
// the commands a player could. See docs/specs/bot-spec.md and ADR 0006.
package bot

import (
	"math/rand/v2"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// Command is one command a Bot sends: its op and its FlatBuffer, as a
// client would send it.
type Command struct {
	Op   wire.Op
	Data []byte
}

// Weights scale the Commander's goals: its difficulty's times its
// Faction's, 1 neutral.
type Weights struct{ Expand, Attack, Defend, Economy, Army, Research float64 }

// Bot decides for one Seat. It is not safe for concurrent use: one
// goroutine runs it (see the nakama package), or a test calls Think.
type Bot struct {
	Seat       int
	Difficulty cs.BotDifficulty
	Weights    Weights
	rng        *rand.Rand
	next       int64  // Match Time it next thinks at
	seq        uint32 // the last command seq it used
}

// New makes the Bot for seat, playing faction at difficulty. Its random
// choices draw from its own stream of the Match seed; its first think is
// offset ms in, so Bots don't all think on one tick.
func New(c *cs.Content, seat int, faction, difficulty string, seed uint64, offset int64) *Bot {
	b := &Bot{Seat: seat, rng: rand.New(rand.NewPCG(seed, uint64(seat)+1000)), next: offset}
	for _, d := range c.Rulesets[game.RulesetID].BotDifficulties {
		if string(d.ID) == difficulty {
			b.Difficulty = d
		}
	}
	var dw cs.BotGoalWeights
	if b.Difficulty.Weights != nil {
		dw = *b.Difficulty.Weights
	}
	var fw cs.BotWeights
	if ai := c.Factions[faction].Ai; ai != nil && ai.Bot != nil {
		fw = *ai.Bot
	}
	b.Weights = Weights{
		mul(dw.Expand, fw.Expand), mul(dw.Attack, fw.Attack), mul(dw.Defend, fw.Defend),
		mul(dw.Economy, fw.Economy), mul(dw.Army, fw.Army), mul(dw.Research, fw.Research),
	}
	return b
}

// mul is the product of the weights given, a missing one counting as 1.
func mul(ws ...*cs.BotWeight) float64 {
	v := 1.0
	for _, w := range ws {
		if w != nil {
			v *= float64(*w)
		}
	}
	return v
}

// Due reports whether the Bot thinks at Match Time t: once per its
// difficulty's think interval.
func (b *Bot) Due(t int64) bool { return t >= b.next }

// Think decides from v and returns the commands to send, and schedules the
// next think.
func (b *Bot) Think(v game.View) []Command {
	b.next = v.Time + int64(b.Difficulty.ThinkSeconds*1000)
	// shortcut: decides nothing yet; issues #43 to #45 add the Commander and planner.
	return nil
}

// Rejected tells the Bot the server refused its command seq.
func (b *Bot) Rejected(seq uint32, reason string) {}
