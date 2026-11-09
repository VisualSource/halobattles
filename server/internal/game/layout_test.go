package game

import (
	"testing"

	"github.com/VisualSource/halobattles/server/internal/battle"
)

func TestAnOwnerLaysOutTheirDefence(t *testing.T) {
	s, c := fixedMatch(t), lineContent()
	l, err := s.DefenceLayout(c, 0, "a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DefenceLayout(c, 1, "a"); err == nil {
		t.Error("Seat 1 saw Seat 0's layout")
	}
	f := l.Field
	if len(f.Sites) < 2 {
		t.Skip("the base has fewer than 2 sites")
	}
	s.Planets["a"].Buildings[0] = "base:barracks"
	near := battle.Cell{X: f.CommandPost.X, Y: f.CommandPost.Y + 1}
	if err := s.SetDefenceLayout(c, 0, "a", battle.Layout{Sites: map[int]int{0: 1}, Starts: map[int]battle.Cell{2: near}}); err != nil {
		t.Fatal(err)
	}
	if l, _ = s.DefenceLayout(c, 0, "a"); l.BuildingSites[0] != 1 || l.StackStarts[2] != near {
		t.Errorf("sites %v, starts %v; want slot 1 on site 2 and Stack 3 at %v", l.BuildingSites, l.StackStarts, near)
	}
	// The Command Post onto a free site (#124): it stands there.
	zero, one, none := 0, 1, len(f.Sites)
	if err := s.SetDefenceLayout(c, 0, "a", battle.Layout{Sites: map[int]int{0: 1}, Post: &zero}); err != nil {
		t.Fatal(err)
	}
	if l, _ = s.DefenceLayout(c, 0, "a"); l.CommandPost != f.Sites[0] {
		t.Errorf("Command Post at %v; want site 1, %v", l.CommandPost, f.Sites[0])
	}
	for name, bad := range map[string]battle.Layout{
		"a site that isn't":                   {Sites: map[int]int{0: len(f.Sites)}},
		"two on one site":                     {Sites: map[int]int{0: 1, 1: 1}},
		"a fourth Stack":                      {Starts: map[int]battle.Cell{3: near}},
		"the Command Post on a building site": {Sites: map[int]int{0: 1}, Post: &one},
		"the Command Post off the sites":      {Post: &none},
	} {
		if err := s.SetDefenceLayout(c, 0, "a", bad); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	far := battle.Cell{X: f.CommandPost.X + 40, Y: f.CommandPost.Y}
	if err := s.SetDefenceLayout(c, 0, "a", battle.Layout{Sites: map[int]int{0: 1}, Starts: map[int]battle.Cell{0: far, 2: near}}); err != nil {
		t.Fatalf("a Stack far from any: %v; want its start dropped, not the change refused", err)
	}
	if st := s.Planets["a"].Layout.Starts; len(st) != 1 || st[2] != near {
		t.Errorf("starts %v; want only Stack 3's kept", st)
	}
	s.capture(s.Planets["a"], 1, &Events{})
	if p := s.Planets["a"]; p.Layout.Starts != nil || p.Layout.Sites[0] != 1 {
		t.Errorf("after a capture, layout %+v; want the sites kept and the Stacks' starts cleared", p.Layout)
	}
}
