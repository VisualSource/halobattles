package game

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	cs "github.com/VisualSource/halobattles/server/internal/gen/contentschema"
)

// routingCase is one of the routing fixtures shared with the client.
type routingCase struct {
	Description string `json:"description"`
	Lanes       []struct {
		From string `json:"from"`
		To   string `json:"to"`
		Time int64  `json:"time"`
	} `json:"lanes"`
	Owners      map[string]int `json:"owners"`
	Player      int            `json:"player"`
	From        string         `json:"from"`
	To          string         `json:"to"`
	Path        []string       `json:"path"`
	Time        int64          `json:"time"`
	Unreachable bool           `json:"unreachable"`
}

func TestRoutingFixtures(t *testing.T) {
	files, _ := filepath.Glob("../../../testdata/routing/*.json")
	if len(files) == 0 {
		t.Fatal("no routing fixtures found")
	}
	for _, f := range files {
		t.Run(filepath.Base(f), func(t *testing.T) {
			b, err := os.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			var tc routingCase
			if err := json.Unmarshal(b, &tc); err != nil {
				t.Fatal(err)
			}
			lanes := map[string]map[string]int64{}
			for _, l := range tc.Lanes {
				for _, e := range [][2]string{{l.From, l.To}, {l.To, l.From}} {
					if lanes[e[0]] == nil {
						lanes[e[0]] = map[string]int64{}
					}
					lanes[e[0]][e[1]] = l.Time
				}
			}
			owned := func(p string) bool { o, ok := tc.Owners[p]; return ok && o == tc.Player }

			path, ms, ok := Route(lanes, owned, tc.From, tc.To)

			switch {
			case tc.Unreachable && ok:
				t.Errorf("%s\ngot %v (%d ms), want unreachable", tc.Description, path, ms)
			case !tc.Unreachable && (!ok || !slices.Equal(path, tc.Path) || ms != tc.Time):
				t.Errorf("%s\ngot %v (%d ms, ok %v), want %v (%d ms)", tc.Description, path, ms, ok, tc.Path, tc.Time)
			}
		})
	}
}

func TestLaneTimes(t *testing.T) {
	c := lineContent()
	c.Rulesets[RulesetID] = func(r cs.Ruleset) cs.Ruleset {
		r.LaneTypes = map[string]float64{"fast": 1, "slow": 2}
		return r
	}(c.Rulesets[RulesetID])
	m := c.Maps["base:line"]
	length, seconds := 30.0, 12.5
	for i := range m.Lanes {
		m.Lanes[i].Time = nil
	}
	m.Planets[1].Position = cs.Position{X: 3, Y: 4} // b is 5 from a, at the origin
	m.Lanes[0].Type = "slow"                        // a - b: 5 × 2
	m.Lanes[1].Length = &length                     // b - c: 30 × 1
	m.Lanes[2].Time = &seconds                      // c - d: explicit
	c.Maps["base:line"] = m

	s, err := StartMatch(c, "base:line", []SeatSetup{{User: "u1", Faction: "base:unsc"}}, nil, 1)
	if err != nil {
		t.Fatal(err)
	}
	if got := [3]int64{s.Lanes["a"]["b"], s.Lanes["c"]["b"], s.Lanes["c"]["d"]}; got != [3]int64{10_000, 30_000, 12_500} {
		t.Errorf("Lane times = %v ms, want [10000 30000 12500]", got)
	}
}
