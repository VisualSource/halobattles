package battle

import "testing"

// The 3D rules (docs/specs/tactical-battle-spec.md#3d-rules-step-4): the
// air layer, height, and line of sight.

// pair is a over b on open ground, nothing else on it: a at the top of a
// column, b straight below it, d cells apart.
func pair(t *testing.T, a, b string, d int) (s *Sim, sa, sb *Squad) {
	t.Helper()
	c := modContent(t)
	s = NewDuel(c, ruleset(c), a, 1, b, 1, 1)
	s.Field.Terrains = append(s.Field.Terrains, "base:forest", "base:peak", "base:water")
	for _, sq := range s.Squads {
		if sq.alive() && sq.Side == Attacker {
			sa = sq
		} else if sq.alive() {
			sb = sq
		}
	}
	at := Cell{10, 10}
	s.relocate(sa, at)
	s.relocate(sb, at.add(Cell{0, d}))
	return s, sa, sb
}

// ground sets a cell's Terrain (an index into the Field's Terrains: 1 forest,
// 2 peak, 3 water) and height.
func ground(s *Sim, c Cell, terrain, height uint8) {
	i := s.Field.index(c)
	s.Field.Terrain[i], s.Field.Height[i] = terrain, height
	s.obscure, s.costCache, s.reach = nil, map[string]costs{}, map[string][]bool{}
}

func TestAircraftFlyOverAnythingAndAboveGroundSquads(t *testing.T) {
	s, hornet, marine := pair(t, "base:hornet", "base:marine", 6)
	// A wall of water and peak right across the field, between them.
	for x := range s.Field.W {
		ground(s, Cell{x, 13}, 3, 0)
		ground(s, Cell{x, 14}, 2, 2)
	}
	if !s.standable(hornet, marine.Cell) {
		t.Fatal("an aircraft can't stand above a ground squad")
	}
	s.apply(Attacker, Order{Kind: Move, Squad: hornet.ID, Cell: marine.Cell})
	for range 10 * s.TPS() {
		s.move()
	}
	if hornet.Cell != marine.Cell {
		t.Errorf("the Hornet stopped at %v; want it over the wall and above the Marines at %v", hornet.Cell, marine.Cell)
	}
	if s.standable(marine, Cell{12, 13}) || s.standable(marine, Cell{12, 14}) {
		t.Error("the Marines can stand on water or a peak")
	}
}

func TestHighGroundAddsRangeAndSightUpToTwoLevels(t *testing.T) {
	for _, tc := range []struct {
		height uint8
		d      int
		hits   bool
	}{
		{0, 5, true},  // the Marine's range
		{0, 6, false}, // beyond it on the level
		{1, 6, true},  // one level up: +1
		{2, 7, true},  // two: +2
		{3, 7, true},  // three still counts two
		{3, 8, false},
	} {
		s, marine, grunt := pair(t, "base:marine", "base:grunt", tc.d)
		marine.sight, grunt.sight = 5, 5 // as far as they shoot: height adds to both alike
		ground(s, marine.Cell, 0, tc.height)
		s.see()
		if got := s.canHit(marine, grunt); got != tc.hits {
			t.Errorf("Marines %d levels up, %d cells away: hit %v, want %v", tc.height, tc.d, got, tc.hits)
		}
		if s.canHit(grunt, marine) && tc.d > 5 {
			t.Errorf("Grunts below hit the Marines %d cells away, beyond their range", tc.d)
		}
	}
}

func TestALineOfSightIsBlockedByARidgeAPeakOrDeepForest(t *testing.T) {
	for _, tc := range []struct {
		name  string
		cells []uint8 // the Terrain on the cells between them, 1 forest, 2 peak; 9 is a cell a level up
		open  bool
	}{
		{"open ground", nil, true},
		{"two forest", []uint8{1, 1}, true},
		{"three forest", []uint8{1, 1, 1}, false},
		{"a peak", []uint8{2}, false},
		{"a ridge", []uint8{9}, false},
	} {
		s, marine, grunt := pair(t, "base:marine", "base:grunt", 4)
		for i, k := range tc.cells {
			c := marine.Cell.add(Cell{0, i + 1})
			if k == 9 {
				ground(s, c, 0, 1)
			} else {
				ground(s, c, k, 0)
			}
		}
		s.see()
		if seen := s.visible[Attacker][grunt.ID]; seen != tc.open {
			t.Errorf("%s: the Marines see the Grunts %v, want %v", tc.name, seen, tc.open)
		}
		if hit := s.canHit(marine, grunt); hit != tc.open {
			t.Errorf("%s: the Marines can fire %v, want %v", tc.name, hit, tc.open)
		}
	}
	// Standing on the ridge, or flying, sees over it.
	s, marine, grunt := pair(t, "base:marine", "base:grunt", 4)
	ground(s, marine.Cell.add(Cell{0, 2}), 0, 1)
	ground(s, marine.Cell, 0, 1)
	s.see()
	if !s.canHit(marine, grunt) {
		t.Error("Marines level with the ridge can't fire over it")
	}
	s, hornet, grunt := pair(t, "base:hornet", "base:grunt", 4)
	ground(s, hornet.Cell.add(Cell{0, 2}), 2, 2)
	s.see()
	if !s.canHit(hornet, grunt) || !s.visible[Defender][hornet.ID] {
		t.Error("a peak blocks the line between an aircraft and the ground")
	}
}

func TestALineOfSightIsTheSameBothWays(t *testing.T) {
	s, marine, grunt := pair(t, "base:marine", "base:grunt", 2)
	at := marine.Cell
	s.relocate(grunt, at.add(Cell{2, 2}))
	ground(s, at.add(Cell{2, 1}), 0, 1) // a ridge beside the diagonal
	s.see()
	if s.canHit(marine, grunt) != s.canHit(grunt, marine) || s.visible[Attacker][grunt.ID] != s.visible[Defender][marine.ID] {
		t.Errorf("Marines fire %v, see %v; Grunts fire %v, see %v: want the same line both ways",
			s.canHit(marine, grunt), s.visible[Attacker][grunt.ID], s.canHit(grunt, marine), s.visible[Defender][marine.ID])
	}
}

func TestTheAIPicksAFiringPositionWithAClearLine(t *testing.T) {
	s, marine, grunt := pair(t, "base:marine", "base:grunt", 4)
	for y := 1; y <= 3; y++ { // forest the whole way across in front of the Marines
		for x := range s.Field.W {
			ground(s, Cell{x, marine.Cell.Y + y}, 1, 0)
		}
	}
	to, ok := s.firingPosition(marine, grunt.Cell, 1, 0)
	if !ok || to == marine.Cell || !s.clearLine(to, grunt.Cell) {
		t.Errorf("firing position %v (found %v); want one off the Marines' cell with a clear line to the Grunts", to, ok)
	}
}
