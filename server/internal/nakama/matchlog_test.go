package nakama

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/VisualSource/halobattles/server/internal/gen/wire"
)

// lines reads a Match log's lines.
func lines(t *testing.T, path string) []entry {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var out []entry
	for sc := bufio.NewScanner(f); sc.Scan(); {
		var e entry
		if err := json.Unmarshal(sc.Bytes(), &e); err != nil {
			t.Fatalf("a line that isn't JSON: %s", sc.Text())
		}
		out = append(out, e)
	}
	return out
}

func TestAMatchLogsItsStartAndItsBotsThinks(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HALO_MATCH_LOG", dir)
	h := withBot(t)
	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 9, Ready: true}), cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 10}))
	s := h.state.(*matchState)
	path := filepath.Join(dir, s.logName()+".jsonl")

	// The Bot thinks on its own goroutine, once the loop has shown it a View.
	thought := func() bool {
		for _, e := range lines(t, path) {
			if e.Kind == "think" {
				return true
			}
		}
		return false
	}
	for deadline := time.Now().Add(2 * time.Second); !thought(); {
		if time.Now().After(deadline) {
			t.Fatal("no think logged")
		}
		h.loop()
		time.Sleep(10 * time.Millisecond)
	}
	s.stopBots()

	got := lines(t, path)
	if got[0].Kind != "match" || got[0].Data.(map[string]any)["map"] != "base:b-map" {
		t.Errorf("first line %+v; want the Match's start", got[0])
	}
	think := got[len(got)-1]
	if seat := think.Data.(map[string]any)["seat"]; think.Kind != "think" || seat != float64(s.seat("bot:1")) {
		t.Errorf("last line %+v; want the Bot's think", think)
	}
	s.log.write("think", 0, nil)
	if n := len(lines(t, path)); n != len(got) {
		t.Errorf("%d lines after the log closed, %d before", n, len(got))
	}
}
