package battle

import (
	"slices"
	"testing"
)

func TestDeployFollowsTheLayout(t *testing.T) {
	f := &Field{W: 40, H: 40, CommandPost: Cell{20, 20},
		Sites: []Cell{{10, 10}, {30, 10}, {10, 30}}, UnitStarts: []Cell{{15, 15}, {25, 15}}}
	buildings := []string{"a", "b", "", "d", "e"}
	l := Layout{
		Sites:  map[int]int{1: 0, 2: 1}, // slot 2 is empty, so its placement counts for nothing
		Starts: map[int]Cell{0: {30, 12}, 1: {0, 0}},
	}
	sites, starts := f.Deploy(buildings, 3, l, 8)
	// b takes its placed site; a, displaced, and d, past the sites, the free
	// ones in turn; e, with none left, goes by the Command Post.
	if want := []int{1, 0, -1, 2, -1}; !slices.Equal(sites, want) {
		t.Errorf("sites %v; want %v", sites, want)
	}
	// Stack 1 by a building; Stack 2 too far from any, so at its unit start;
	// Stack 3, past the base's starts, at the Command Post.
	if want := []Cell{{30, 12}, {25, 15}, f.CommandPost}; !slices.Equal(starts, want) {
		t.Errorf("starts %v; want %v", starts, want)
	}
}
