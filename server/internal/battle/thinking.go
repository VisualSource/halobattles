package battle

import (
	"fmt"
	"maps"
	"slices"
	"strings"
)

// Thinking is what an AI weighed at its last Commander pass, for the Battle
// Lab: every goal it listed, the one each squad took and why, and its Task
// Forces. An AI keeps it only once Think is called.
type Thinking struct {
	Tick    int          `json:"tick"`
	Goals   []GoalScore  `json:"goals"`
	Choices []Choice     `json:"choices"` // by squad id
	Forces  []ForceState `json:"forces"`
}

// GoalScore is one goal the Commander listed, with what it was worth before
// any squad's distance: its value, the enemy strength seen near it, and the
// strength a Task Force wants for it.
type GoalScore struct {
	Goal   string  `json:"goal"`
	Cell   Cell    `json:"cell"`
	Target int     `json:"target,omitempty"`
	Value  float64 `json:"value"`
	Threat float64 `json:"threat"`
	Need   float64 `json:"need,omitempty"`
	Squads int     `json:"squads"` // the squads that took it
}

// Choice is the goal a squad took, its score, and the factors in it.
type Choice struct {
	Squad int     `json:"squad"`
	Goal  int     `json:"goal"` // an index into Goals
	Score float64 `json:"score"`
	Why   string  `json:"why"`
}

// ForceState is a Task Force: its goal, members, where it gathers, whether
// it has gone in, and the enemy its members fire on together.
type ForceState struct {
	Goal     string `json:"goal"`
	Cell     Cell   `json:"cell"`
	Target   int    `json:"target,omitempty"` // the goal's target
	Members  []int  `json:"members"`
	Stage    Cell   `json:"stage"`
	Going    bool   `json:"going"`
	FormedAt int    `json:"formedAt"`
	FiresOn  int    `json:"firesOn,omitempty"`
}

// Think has the AI keep its Thinking from now on; it's the latest Thinking,
// filled in at each Commander pass.
func (ai *AI) Think() *Thinking {
	if ai.thinking == nil {
		ai.thinking = &Thinking{}
	}
	return ai.thinking
}

// factors are the parts of one squad's score for one goal.
type factors struct {
	value, dist, crowd, matchup, fear, stick float64
}

func (f factors) why() string {
	parts := []string{fmt.Sprintf("worth %.2f", f.value), fmt.Sprintf("÷%.2f far", f.dist)}
	if f.crowd != 1 {
		parts = append(parts, fmt.Sprintf("÷%.2f others on it", f.crowd))
	}
	if f.matchup != 1 {
		parts = append(parts, fmt.Sprintf("×%.2f matchup", f.matchup))
	}
	if f.fear != 1 {
		parts = append(parts, fmt.Sprintf("÷%.2f threat", f.fear))
	}
	if f.stick != 1 {
		parts = append(parts, fmt.Sprintf("×%.2f already on it", f.stick))
	}
	return strings.Join(parts, " ")
}

// think records a Commander pass, if Think was called.
func (ai *AI) think(v View, goals []goal, values, threat, need []float64, assigned []float64, chose map[int]Choice) {
	t := ai.thinking
	if t == nil {
		return
	}
	*t = Thinking{Tick: v.Tick()}
	for i, g := range goals {
		t.Goals = append(t.Goals, GoalScore{
			Goal: goalNames[g.kind], Cell: g.cell, Target: g.target, Value: values[i], Threat: threat[i], Need: need[i], Squads: int(assigned[i]),
		})
	}
	for _, id := range slices.Sorted(maps.Keys(chose)) {
		t.Choices = append(t.Choices, chose[id])
	}
	for _, k := range slices.SortedFunc(maps.Keys(ai.forces), func(a, b forceKey) int {
		return cmpKey(a, b)
	}) {
		tf := ai.forces[k]
		fs := ForceState{
			Goal: goalNames[tf.goal.kind], Cell: tf.goal.cell, Target: tf.goal.target, Stage: tf.stage,
			Going: tf.going, FormedAt: tf.formedAt, FiresOn: tf.target,
		}
		for _, m := range tf.members {
			fs.Members = append(fs.Members, m.ID)
		}
		t.Forces = append(t.Forces, fs)
	}
}

func cmpKey(a, b forceKey) int {
	switch {
	case a.kind != b.kind:
		return int(a.kind) - int(b.kind)
	case a.target != b.target:
		return a.target - b.target
	case a.cell != b.cell:
		if a.cell.X != b.cell.X {
			return a.cell.X - b.cell.X
		}
		return a.cell.Y - b.cell.Y
	}
	return a.n - b.n
}
