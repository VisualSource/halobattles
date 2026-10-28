package battle

import (
	"cmp"
	"container/heap"
	"math"
)

const diagonal = 1.5 // a diagonal step costs this many straight ones

// step is one of the 8 moves, straight ones first.
var steps = [8]Cell{{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}}

// costs is the cost of entering each cell for one Unit Class; 0 is blocked.
type costs []float64

// costsFor reads the Terrain movement table for a Unit Class.
func (s *Sim) costsFor(class string) costs {
	if c, ok := s.costCache[class]; ok {
		return c
	}
	byTerrain := make([]float64, len(s.Field.Terrains))
	for i, id := range s.Field.Terrains {
		byTerrain[i] = s.content.Terrains[id].Movement[class]
	}
	c := make(costs, len(s.Field.Terrain))
	for i, t := range s.Field.Terrain {
		c[i] = byTerrain[t]
	}
	s.costCache[class] = c
	return c
}

// stepCost is the cost of moving from a to its neighbour b, or 0 if it can't:
// b is blocked, or the step is a diagonal past a blocked corner.
func (f *Field) stepCost(c costs, a, b Cell) float64 {
	if b.X < 0 || b.Y < 0 || b.X >= f.W || b.Y >= f.H {
		return 0
	}
	cost := c[f.index(b)]
	if cost == 0 {
		return 0
	}
	if a.X != b.X && a.Y != b.Y {
		if c[f.index(Cell{a.X, b.Y})] == 0 || c[f.index(Cell{b.X, a.Y})] == 0 {
			return 0
		}
		cost *= diagonal
	}
	return cost
}

// octile is the cheapest a path between two cells could be at cost 1 per cell.
func octile(a, b Cell) float64 {
	dx, dy := math.Abs(float64(a.X-b.X)), math.Abs(float64(a.Y-b.Y))
	return max(dx, dy) + (diagonal-1)*min(dx, dy)
}

type node struct {
	i    int
	f, h float64
}

type nodes []node

func (n nodes) Len() int { return len(n) }
func (n nodes) Less(a, b int) bool {
	return cmp.Or(cmp.Compare(n[a].f, n[b].f), cmp.Compare(n[a].h, n[b].h), cmp.Compare(n[a].i, n[b].i)) < 0
}
func (n nodes) Swap(a, b int) { n[a], n[b] = n[b], n[a] }
func (n *nodes) Push(x any)   { *n = append(*n, x.(node)) }
func (n *nodes) Pop() any {
	old := *n
	x := old[len(old)-1]
	*n = old[:len(old)-1]
	return x
}

// path finds the cheapest route from start to goal with A*, avoiding cells
// blocked reports. If goal can't be reached, it goes to the reachable cell
// nearest it. The result leaves out start.
func (f *Field) path(c costs, start, goal Cell, blocked func(int) bool) []Cell {
	minCost := math.Inf(1)
	for _, v := range c {
		if v > 0 {
			minCost = min(minCost, v)
		}
	}
	if math.IsInf(minCost, 1) {
		return nil
	}
	n := f.W * f.H
	g := make([]float64, n)
	from := make([]int, n)
	for i := range g {
		g[i], from[i] = math.Inf(1), -1
	}
	s, gi := f.index(start), f.index(goal)
	g[s] = 0
	best, bestH := s, octile(start, goal)
	open := &nodes{{s, bestH * minCost, bestH}}
	for open.Len() > 0 {
		cur := heap.Pop(open).(node)
		if cur.i == gi {
			best = gi
			break
		}
		if cur.f > g[cur.i]+cur.h*minCost {
			continue // a stale entry
		}
		if cur.h < bestH {
			best, bestH = cur.i, cur.h
		}
		a := f.cell(cur.i)
		for _, d := range steps {
			b := Cell{a.X + d.X, a.Y + d.Y}
			cost := f.stepCost(c, a, b)
			if cost == 0 {
				continue
			}
			bi := f.index(b)
			if bi != gi && blocked != nil && blocked(bi) {
				continue
			}
			if ng := g[cur.i] + cost; ng < g[bi] {
				g[bi], from[bi] = ng, cur.i
				h := octile(b, goal)
				heap.Push(open, node{bi, ng + h*minCost, h})
			}
		}
	}
	var out []Cell
	for i := best; i != s; i = from[i] {
		out = append(out, f.cell(i))
	}
	for l, r := 0, len(out)-1; l < r; l, r = l+1, r-1 {
		out[l], out[r] = out[r], out[l]
	}
	return out
}
