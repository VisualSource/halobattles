package battle

import (
	"cmp"
	"math"
	"sync"
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

// search is A*'s working memory, pooled: g and from cover the whole map,
// and the open list keeps its capacity between calls.
type search struct {
	g    []float64
	from []int
	open []node
}

var scratch = sync.Pool{New: func() any { return &search{} }}

type node struct {
	i    int
	f, h float64
}

// less orders the open list: lowest f, then lowest h, then lowest cell.
func (a node) less(b node) bool {
	return cmp.Or(cmp.Compare(a.f, b.f), cmp.Compare(a.h, b.h), cmp.Compare(a.i, b.i)) < 0
}

// push and pop keep open a binary min-heap, typed, so nothing is boxed.
func push(open []node, n node) []node {
	open = append(open, n)
	for i := len(open) - 1; i > 0; {
		p := (i - 1) / 2
		if !open[i].less(open[p]) {
			break
		}
		open[i], open[p] = open[p], open[i]
		i = p
	}
	return open
}

func pop(open []node) (node, []node) {
	top, last := open[0], len(open)-1
	open[0] = open[last]
	open = open[:last]
	for i := 0; ; {
		l, small := 2*i+1, i
		if l < last && open[l].less(open[small]) {
			small = l
		}
		if r := l + 1; r < last && open[r].less(open[small]) {
			small = r
		}
		if small == i {
			break
		}
		open[i], open[small] = open[small], open[i]
		i = small
	}
	return top, open
}

// path finds the cheapest route from start to goal with A*. extra, if set,
// adds a cost for entering a cell on top of its Terrain's: other squads in
// the way, soft enough that a long detour can lose to waiting. If goal can't
// be reached, it goes to the reachable cell nearest it. The result leaves out
// start.
func (f *Field) path(c costs, start, goal Cell, extra func(int) float64) []Cell {
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
	buf := scratch.Get().(*search)
	defer scratch.Put(buf)
	if cap(buf.g) < n {
		buf.g, buf.from = make([]float64, n), make([]int, n)
	}
	g, from := buf.g[:n], buf.from[:n]
	for i := range g {
		g[i], from[i] = math.Inf(1), -1
	}
	s, gi := f.index(start), f.index(goal)
	g[s] = 0
	best, bestH := s, octile(start, goal)
	open := push(buf.open[:0], node{s, bestH * minCost, bestH})
	for len(open) > 0 {
		var cur node
		cur, open = pop(open)
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
			if extra != nil && bi != gi {
				cost += extra(bi)
			}
			if ng := g[cur.i] + cost; ng < g[bi] {
				g[bi], from[bi] = ng, cur.i
				h := octile(b, goal)
				open = push(open, node{bi, ng + h*minCost, h})
			}
		}
	}
	buf.open = open
	length := 0
	for i := best; i != s; i = from[i] {
		length++
	}
	out := make([]Cell, length)
	for i := best; i != s; i = from[i] {
		length--
		out[length] = f.cell(i)
	}
	return out
}
