package battle

import (
	"maps"
	"math"
	"runtime"
	"slices"
	"sync"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// The duel matrix (docs/specs/tactical-battle-spec.md#the-duel-matrix): every
// unit with a peer group against every other, on open ground, with no AI:
// each squad attack-moves on the nearest enemy. Peers (one peer group, across
// Factions) fight in equal numbers and should come out about even; the rest
// fight at equal Command Points, and whoever their tiers favour should win.
// Both come from content, so a Mod states its own. The Lab shows it as a
// table and plays any one duel.

// DuelBudget is the Command Points a side gets.
const DuelBudget = 12

// Draw is the Reason a duel ends with neither side left, or both at the time cap.
const Draw = "draw"

// duelSeconds caps a duel's fighting time.
const duelSeconds = 120

// What a duel's tiers say should happen.
const (
	DuelWin  = "win"  // the row's side should win at least 80%
	DuelEven = "even" // peers: 40–60%
)

// DuelUnits is every unit with a peer group, in id order. A unit without one
// (a placeholder not yet statted) stays out.
func DuelUnits(c *cs.Content) []string {
	var ids []string
	for _, id := range slices.Sorted(maps.Keys(c.Units)) {
		if c.Units[id].PeerGroup != nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func peers(c *cs.Content, a, b string) bool {
	return *c.Units[a].PeerGroup == *c.Units[b].PeerGroup
}

// DuelCounts is how many of a and b fight: as many of each as DuelBudget
// buys of the dearer for peers, else as many as it buys of each.
func DuelCounts(c *cs.Content, a, b string) (na, nb int) {
	n := func(cp int) int { return max(1, int(math.Round(DuelBudget/float64(max(1, cp))))) }
	ca, cb := c.Units[a].CommandPoints, c.Units[b].CommandPoints
	if peers(c, a, b) {
		return n(max(ca, cb)), n(max(ca, cb))
	}
	return n(ca), n(cb)
}

// tierScore orders tiers, best first.
var tierScore = map[string]int{Counter: 4, Advantage: 3, Normal: 2, Disadvantage: 1, None: 0}

// duelTier is a's tier against b's Unit Class.
func duelTier(c *cs.Content, a, b string) string {
	if t, ok := c.Units[a].Combat.Tiers[string(c.Units[b].Combat.UnitClass)]; ok {
		return string(t)
	}
	return Normal
}

// DuelWant is what the tiers say of a's duel with b: DuelWin for a counter
// against anything but a counter back, or the triangle's Advantage against
// Disadvantage or worse; DuelEven for peers on equal tiers; else "".
func DuelWant(c *cs.Content, a, b string) string {
	ta, tb := duelTier(c, a, b), duelTier(c, b, a)
	switch {
	case ta == Counter && tb != Counter || ta == Advantage && tierScore[tb] <= tierScore[Disadvantage]:
		return DuelWin
	case peers(c, a, b) && ta == tb:
		return DuelEven
	}
	return ""
}

// NewDuel is na of a attacking nb of b, seed's duel: on open ground with
// nothing else on it, each side in rows of 5, mirrored, 16 cells apart. Step
// it with DuelStep.
func NewDuel(c *cs.Content, r cs.Ruleset, a string, na int, b string, nb int, seed uint64) *Sim {
	force := func(u string, n int) Force { return Force{Formations: [][]Slot{{{u, n, 0}}}} }
	return NewDuelOf(c, r, force(a, na), force(b, nb), seed)
}

// NewDuelOf is attack against defend as a duel: their units only, laid out
// as NewDuel lays out two.
func NewDuelOf(c *cs.Content, r cs.Ruleset, attack, defend Force, seed uint64) *Sim {
	attack.Buildings, defend.Buildings = nil, nil
	f := openField(64, 48)
	s := New(c, r, f, attack, defend, seed)
	for _, sq := range s.Squads {
		if sq.Building || sq.CommandPost {
			sq.Members = nil // nothing but the two forces
		}
	}
	mid := Cell{f.W / 2, f.H / 2}
	var n [2]int
	for _, sq := range s.Squads {
		if !sq.alive() {
			continue
		}
		i := n[sq.Side]
		n[sq.Side]++
		at := mid.add(Cell{i%5*2 - 4, -8 - i/5})
		if sq.Side == Defender {
			at = mid.add(Cell{i%5*2 - 4, 8 + i/5})
		}
		for _, d := range append([]Cell{{}}, steps[:]...) {
			if c := at.add(d); s.standable(sq, c) {
				s.relocate(sq, c)
				break
			}
		}
	}
	return s
}

// duelAlive is whether side has a fighting squad left.
func (s *Sim) duelAlive(side Side) bool {
	return slices.ContainsFunc(s.Squads, func(sq *Squad) bool { return sq.Side == side && sq.alive() && !sq.Building && !sq.CommandPost })
}

// DuelStep is one tick of a duel: once a second each squad is sent on at the
// nearest enemy, then it moves, sees and fires. It ends the duel when a side
// is gone (Draw if both are) or at the time cap (Draw).
func DuelStep(s *Sim) []Volley {
	if s.Over {
		return nil
	}
	if s.Tick%s.TPS() == 0 {
		for _, sq := range s.Squads {
			var near *Squad
			for _, e := range s.Squads {
				if e.Side != sq.Side && e.alive() && !e.Building && !e.CommandPost && (near == nil || dist2(sq.Cell, e.Cell) < dist2(sq.Cell, near.Cell)) {
					near = e
				}
			}
			// A new order only when it's idle or its enemy has moved off: each
			// order restarts the wait after which a blocked squad goes round.
			if sq.alive() && near != nil && (len(sq.path) == 0 || dist(sq.goal, near.Cell) > 3) {
				s.apply(sq.Side, Order{Kind: AttackMove, Squad: sq.ID, Cell: near.Cell})
			}
		}
	}
	s.move()
	s.see()
	volleys := s.fire()
	s.Tick++
	a, d := s.duelAlive(Attacker), s.duelAlive(Defender)
	switch {
	case a && !d:
		s.Over, s.Winner, s.Reason = true, Attacker, Eliminated
	case d && !a:
		s.Over, s.Winner, s.Reason = true, Defender, Eliminated
	case !a || s.Tick >= duelSeconds*s.TPS():
		s.Over, s.Winner, s.Reason = true, Defender, Draw
	}
	return volleys
}

// fight is one duel, a attacking, and a's share of the win: 1, 0, or 0.5 for a Draw.
func fight(c *cs.Content, r cs.Ruleset, a string, na int, b string, nb int, seed uint64) float64 {
	return outcome(NewDuel(c, r, a, na, b, nb, seed))
}

// outcome plays a duel out: the attacker's share of the win.
func outcome(s *Sim) float64 {
	for !s.Over {
		DuelStep(s)
	}
	switch {
	case s.Reason == Draw:
		return 0.5
	case s.Winner == Attacker:
		return 1
	}
	return 0
}

// duel fights a against b twice, once on each side, since the attacker's
// squads move and fire first, and returns a's share of the wins.
func duel(c *cs.Content, r cs.Ruleset, a, b string, seed uint64) float64 {
	na, nb := DuelCounts(c, a, b)
	return (fight(c, r, a, na, b, nb, seed) + 1 - fight(c, r, b, nb, a, na, seed)) / 2
}

// DuelCell is one pair of the matrix: Rate is how often A beats B over the
// seeds, each duel fought on both sides.
type DuelCell struct {
	A    string  `json:"a"`
	B    string  `json:"b"`
	NA   int     `json:"na"`
	NB   int     `json:"nb"`
	Rate float64 `json:"rate"`
	Want string  `json:"want,omitempty"` // DuelWin, DuelEven or ""
}

// Missed is whether the cell misses what its tiers want.
func (d DuelCell) Missed() bool {
	return d.Want == DuelWin && d.Rate < 0.8 || d.Want == DuelEven && (d.Rate < 0.4 || d.Rate > 0.6)
}

// DuelMatrix fights every ordered pair of DuelUnits, all wanted or only those
// with a DuelWant, over seeds, a pair to a CPU at once, and calls done with
// each cell as it finishes (from any goroutine, one at a time).
func DuelMatrix(c *cs.Content, r cs.Ruleset, seeds uint64, all bool, done func(DuelCell)) {
	units := DuelUnits(c)
	pairs := make(chan DuelCell)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range runtime.NumCPU() {
		wg.Go(func() {
			for d := range pairs {
				wins := 0.0
				for seed := range seeds {
					wins += duel(c, r, d.A, d.B, seed)
				}
				d.Rate = wins / float64(seeds)
				mu.Lock()
				done(d)
				mu.Unlock()
			}
		})
	}
	for _, a := range units {
		for _, b := range units {
			if want := DuelWant(c, a, b); a != b && (all || want != "") {
				na, nb := DuelCounts(c, a, b)
				pairs <- DuelCell{A: a, B: b, NA: na, NB: nb, Want: want}
			}
		}
	}
	close(pairs)
	wg.Wait()
}

// openField is a plain Battlefield for duels and for sim and AI tests, so
// they don't hang on what a seed's generated map holds: open ground
// everywhere, the defender's Command Post at the bottom middle with its unit
// starts and sites round it, three Landing Zones (the first in the middle;
// the attacker lands at the second, up and left of it), and two pads in the
// middle.
func openField(w, h int) *Field {
	f := &Field{W: w, H: h, Terrains: []string{"base:open"}, Terrain: make([]uint8, w*h), Height: make([]uint8, w*h)}
	post := Cell{w / 2, h - 6}
	f.CommandPost = post
	f.UnitStarts = []Cell{post.add(Cell{-4, -3}), post.add(Cell{4, -3}), post.add(Cell{0, -5})}
	f.Sites = []Cell{post.add(Cell{-3, 0}), post.add(Cell{3, 0}), post.add(Cell{-3, 2}), post.add(Cell{3, 2})}
	// The attacker's well in from the edges, so a Retreat from it takes a while.
	f.Points = []Cell{{w / 2, h / 2}, {w * 3 / 10, h * 2 / 5}, {w * 7 / 10, h * 3 / 10}}
	f.Starts = f.Points[1:2]
	f.Pads = []Cell{{w/2 - 6, h/2 + 4}, {w/2 + 6, h/2 + 4}}
	return f
}
