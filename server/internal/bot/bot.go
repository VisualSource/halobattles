// Package bot plays a Seat on the galaxy map from its View, sending only
// the commands a player could. See docs/specs/bot-spec.md and ADR 0006.
package bot

import (
	"math/rand/v2"

	"github.com/VisualSource/halobattles/server/internal/game"
	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	flatbuffers "github.com/google/flatbuffers/go"
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
	c          *cs.Content
	faction    string
	rng        *rand.Rand
	next       int64               // Match Time it next thinks at
	seq        uint32              // the last command seq it used
	seen       map[string]sighting // every Planet its Views have shown, as last seen
	current    map[string]bool     // the goals it funded last think, by key
	mix        int                 // a fixed unit mix's next unit
	attacking  map[uint32]string   // the Battles it was attacking in at its last think, to their Planet
	failed     map[string]int      // attacks that failed, by Planet, until it takes it
	prices     map[string]float64  // each Resource's worth, by the Exchange
}

// New makes the Bot for seat, playing faction at difficulty. Its random
// choices draw from its own stream of the Match seed; its first think is
// offset ms in, so Bots don't all think on one tick.
func New(c *cs.Content, seat int, faction, difficulty string, seed uint64, offset int64) *Bot {
	b := &Bot{Seat: seat, c: c, faction: faction, rng: rand.New(rand.NewPCG(seed, uint64(seat)+1000)), next: offset, failed: map[string]int{}, prices: prices(c)}
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

// maxPerThink caps one think's commands, well under the server's per-tick cap.
const maxPerThink = 8

// Think decides from v and returns the commands to send, and schedules the
// next think. Any Exchange comes first; then the Commander's goals are
// funded best first: each gets a plan, and its first action is sent, until
// the budget or maxPerThink runs out.
func (b *Bot) Think(v game.View) []Command {
	b.next = v.Time + int64(b.Difficulty.ThinkSeconds*1000)
	b.remember(v)
	b.learn(v)
	t := b.newTurn(v)
	goals := b.goals(v) // scored with last think's goals still current
	for _, g := range goals {
		t.top[g.kind] = max(t.top[g.kind], g.score)
	}
	b.current = map[string]bool{}
	var out []Command
	if c := b.exchange(t); c != nil {
		out = append(out, *c)
	}
	for _, bt := range v.Battles {
		if c := b.retreat(v, bt); c != nil {
			out = append(out, *c)
		}
	}
	for _, g := range goals {
		if len(out) >= maxPerThink {
			break
		}
		a := plan(b.facts(t, g), goalFact[g.kind], b.Difficulty.PlanDepth)
		if a == nil {
			if plan(b.facts(t.paid(), g), goalFact[g.kind], b.Difficulty.PlanDepth) != nil {
				// The next Payday affords it: save for it. Goals scoring less get nothing that
				// costs, but free moves, like reinforcing, still go.
				for r := range t.budget {
					t.budget[r] = min(t.budget[r], 0)
				}
			}
			continue
		}
		if g.target != "" {
			// What it gathers there stays, even in a think that sends it nothing.
			t.gathering[b.gatherAt(t, g)] = true
		}
		if c := a.issue(b, t, g); c != nil {
			out = append(out, *c)
			b.current[g.key()] = true
		}
	}
	return out
}

func (b *Bot) nextSeq() uint32 {
	b.seq++
	return b.seq
}

// command packs a command's FlatBuffer, as a client would.
func (b *Bot) command(op wire.Op, t interface {
	Pack(*flatbuffers.Builder) flatbuffers.UOffsetT
}) *Command {
	fb := flatbuffers.NewBuilder(64)
	fb.Finish(t.Pack(fb))
	return &Command{Op: op, Data: fb.FinishedBytes()}
}

// Rejected tells the Bot the server refused its command seq.
func (b *Bot) Rejected(seq uint32, reason string) {}
