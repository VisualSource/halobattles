package battle

import (
	"math"
	"math/rand/v2"
)

// perlin is 2D gradient noise over a seeded permutation, after Ken Perlin's
// improved noise.
type perlin struct {
	p      [512]uint8
	dx, dy float64 // where in the noise this field starts
}

func newPerlin(rng *rand.Rand) *perlin {
	n := &perlin{dx: rng.Float64() * 256, dy: rng.Float64() * 256}
	for i, v := range rng.Perm(256) {
		n.p[i], n.p[i+256] = uint8(v), uint8(v)
	}
	return n
}

// octaves sums octaves of noise at (x, y), each at twice the frequency and
// persistence times the amplitude of the last. Its scale doesn't matter:
// the generator ranks the values.
func (n *perlin) octaves(x, y float64, count int, persistence float64) float64 {
	sum, amp := 0.0, 1.0
	for range count {
		sum += amp * n.at(x+n.dx, y+n.dy)
		x, y, amp = x*2, y*2, amp*persistence
	}
	return sum
}

func (n *perlin) at(x, y float64) float64 {
	fx, fy := math.Floor(x), math.Floor(y)
	xi, yi := int(fx)&255, int(fy)&255
	xf, yf := x-fx, y-fy
	u, v := fade(xf), fade(yf)
	p := &n.p
	aa, ab := p[int(p[xi])+yi], p[int(p[xi])+yi+1]
	ba, bb := p[int(p[xi+1])+yi], p[int(p[xi+1])+yi+1]
	return lerp(v,
		lerp(u, grad(aa, xf, yf), grad(ba, xf-1, yf)),
		lerp(u, grad(ab, xf, yf-1), grad(bb, xf-1, yf-1)))
}

func fade(t float64) float64       { return t * t * t * (t*(t*6-15) + 10) }
func lerp(t, a, b float64) float64 { return a + t*(b-a) }

// grad is the dot product of (x, y) with one of eight gradients.
func grad(h uint8, x, y float64) float64 {
	switch h & 7 {
	case 0:
		return x + y
	case 1:
		return x - y
	case 2:
		return -x + y
	case 3:
		return -x - y
	case 4:
		return x
	case 5:
		return -x
	case 6:
		return y
	}
	return -y
}
