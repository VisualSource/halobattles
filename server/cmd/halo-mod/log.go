package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"
)

// logLine is one line of a Match log (see the architecture spec's Match logs).
type logLine struct {
	Kind string          `json:"kind"`
	Time int64           `json:"time"`
	Data json.RawMessage `json:"data"`
}

// summarize writes a Match log's summary: each Battle, each player's stats
// over the Match, and refused commands grouped by reason.
func summarize(r io.Reader, w io.Writer) error {
	var (
		names   = map[int]string{-1: "Neutral"}
		battles []string
		stats   = map[int][]string{}
		refused = map[string][]string{} // by reason, the commands
		ended   string
	)
	sc := bufio.NewScanner(r)
	sc.Buffer(nil, 16<<20) // a Battle's line holds its whole setup
	for sc.Scan() {
		var l logLine
		if err := json.Unmarshal(sc.Bytes(), &l); err != nil {
			return fmt.Errorf("a line that isn't JSON: %w", err)
		}
		at := clock(l.Time)
		switch l.Kind {
		case "match":
			var m struct {
				Version int
				Map     string
				Seats   []struct{ DisplayName, Faction, Bot string }
			}
			if err := json.Unmarshal(l.Data, &m); err != nil {
				return err
			}
			fmt.Fprintf(w, "Match on %s, log version %d\n", m.Map, m.Version)
			for i, s := range m.Seats {
				names[i] = s.DisplayName
				who := s.Faction
				if s.Bot != "" {
					who += ", Bot " + s.Bot
				}
				fmt.Fprintf(w, "  %d %s (%s)\n", i, s.DisplayName, who)
			}
		case "battle":
			var b struct {
				Battle             uint32
				Planet             string
				Attacker, Defender int
				Winner             int
				Ticks, Rate        int
				Result             struct {
					Reason      string
					Start, Left [2]map[string]int
					Damage      [2]float64
				}
			}
			if err := json.Unmarshal(l.Data, &b); err != nil {
				return err
			}
			won := "attacker"
			if b.Winner != b.Attacker {
				won = "defender"
			}
			line := fmt.Sprintf("  #%d %s %s: %s -> %s, %s won in %ds", b.Battle, at, b.Planet, names[b.Attacker], names[b.Defender], won, b.Ticks/max(b.Rate, 5))
			if b.Result.Reason != "" { // logs before version 1 have no result
				line += fmt.Sprintf(" (%s)\n    attacker %s, dealt %.0f\n    defender %s, dealt %.0f", b.Result.Reason,
					forces(b.Result.Start[0], b.Result.Left[0]), b.Result.Damage[0], forces(b.Result.Start[1], b.Result.Left[1]), b.Result.Damage[1])
			}
			battles = append(battles, line)
		case "stats":
			var s struct {
				Seat                                int
				Resources, Income                   map[string]int
				CommandPointsUsed, CommandPointsCap int
				Planets, Stacked, Moving            int
			}
			if err := json.Unmarshal(l.Data, &s); err != nil {
				return err
			}
			stats[s.Seat] = append(stats[s.Seat], fmt.Sprintf("    %s  %d Planets, %d units (%d moving), CP %d/%d, have %s, income %s",
				at, s.Planets, s.Stacked+s.Moving, s.Moving, s.CommandPointsUsed, s.CommandPointsCap, amounts(s.Resources), amounts(s.Income)))
		case "command":
			var c struct {
				Seat     int
				Command  string
				Rejected string
			}
			if err := json.Unmarshal(l.Data, &c); err != nil {
				return err
			}
			if c.Rejected != "" {
				refused[c.Rejected] = append(refused[c.Rejected], fmt.Sprintf("%s %s", names[c.Seat], c.Command))
			}
		case "end":
			var e struct {
				Winner int
				Reason string
			}
			if err := json.Unmarshal(l.Data, &e); err != nil {
				return err
			}
			ended = fmt.Sprintf("Ended at %s: %s won (%s)", at, names[e.Winner], e.Reason)
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	fmt.Fprintf(w, "\nBattles (%d)\n", len(battles))
	for _, b := range battles {
		fmt.Fprintln(w, b)
	}
	fmt.Fprintln(w, "\nStats at each Payday")
	for _, seat := range slices.Sorted(maps.Keys(stats)) {
		fmt.Fprintf(w, "  %s\n%s\n", names[seat], strings.Join(stats[seat], "\n"))
	}
	fmt.Fprintln(w, "\nRefused commands")
	reasons := slices.Collect(maps.Keys(refused))
	slices.SortFunc(reasons, func(a, b string) int { return len(refused[b]) - len(refused[a]) }) // most first
	for _, reason := range reasons {
		fmt.Fprintf(w, "  %dx %q: %s\n", len(refused[reason]), reason, strings.Join(slices.Compact(slices.Sorted(slices.Values(refused[reason]))), ", "))
	}
	if ended != "" {
		fmt.Fprintf(w, "\n%s\n", ended)
	}
	return nil
}

// clock is a Match Time as m:ss.
func clock(ms int64) string { return fmt.Sprintf("%d:%02d", ms/60000, ms/1000%60) }

// forces is each unit's members at the start and left: "marine 8→1, warthog 2→0".
func forces(start, left map[string]int) string {
	var out []string
	for _, u := range slices.Sorted(maps.Keys(start)) {
		out = append(out, fmt.Sprintf("%s %d→%d", local(u), start[u], left[u]))
	}
	return strings.Join(out, ", ")
}

// amounts is a Resource map as "credits 400, materials 100".
func amounts(m map[string]int) string {
	var out []string
	for _, r := range slices.Sorted(maps.Keys(m)) {
		out = append(out, fmt.Sprintf("%s %d", local(r), m[r]))
	}
	return strings.Join(out, ", ")
}

// local is an id without its Mod: "base:marine" → "marine".
func local(id string) string { return id[strings.Index(id, ":")+1:] }
