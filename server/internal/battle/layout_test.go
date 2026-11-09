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
	sites, starts, post := f.Deploy(buildings, 3, l, 8)
	if post != f.CommandPost {
		t.Errorf("Command Post at %v; want the base's own spot, %v, with no site set", post, f.CommandPost)
	}
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

// The Command Post takes its layout's site before any building (#124); a
// building set there, or whose own site it is, goes on to a free one.
func TestDeployPutsTheCommandPostOnItsSite(t *testing.T) {
	f := &Field{W: 40, H: 40, CommandPost: Cell{20, 20}, Sites: []Cell{{10, 10}, {30, 10}, {10, 30}}}
	two := 2
	sites, _, post := f.Deploy([]string{"a", "b", "c"}, 0, Layout{Sites: map[int]int{0: 2}, Post: &two}, 8)
	if post != f.Sites[2] {
		t.Errorf("Command Post at %v; want site 2, %v", post, f.Sites[2])
	}
	// a was set on site 2, taken: it falls back to its own slot's site, 0; b
	// keeps 1; c's own site is the Command Post's, and none's left.
	if want := []int{0, 1, -1}; !slices.Equal(sites, want) {
		t.Errorf("sites %v; want %v", sites, want)
	}
}
