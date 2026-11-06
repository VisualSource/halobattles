package nakama

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/VisualSource/halobattles/server/internal/battle"
	"github.com/VisualSource/halobattles/server/internal/game"
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

func TestAMatchLogsCommandsEventsAndStats(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HALO_MATCH_LOG", dir)
	h := newLobbyHarness(t)
	r := h.m.content.Doc.Rulesets["base:rules"]
	r.TruceOfferSeconds = 60
	h.m.content.Doc.Rulesets["base:rules"] = r
	h.start()
	h.loop(cmd(u1, wire.OpOfferTruce, &wire.OfferTruceT{Seq: 103, To: 1}), cmd(u1, wire.OpOfferTruce, &wire.OfferTruceT{Seq: 104, To: 0}))
	h.loop()
	s := h.state.(*matchState)
	s.logEvents(game.Events{Paydays: []game.PaydayPaid{{}}})
	s.log.close() // Windows can't remove the temp dir with it open

	got := lines(t, filepath.Join(dir, s.logName()+".jsonl"))
	if v := got[0].Data.(map[string]any)["version"]; v != float64(logVersion) {
		t.Errorf("version %v; want %d", v, logVersion)
	}
	var taken, refused, offered bool
	stats := map[float64]bool{}
	for _, e := range got {
		d, _ := e.Data.(map[string]any)
		switch {
		case e.Kind == "command" && d["command"] == "OfferTruce" && d["rejected"] == nil:
			taken = d["fields"].(map[string]any)["to"] == float64(1)
		case e.Kind == "command" && d["command"] == "OfferTruce":
			refused = d["rejected"] != ""
		case e.Kind == "event" && d["event"] == "truce":
			offered = true
		case e.Kind == "stats" && d["planets"].(float64) > 0:
			stats[d["seat"].(float64)] = true
		}
	}
	if !taken || !refused || !offered || len(stats) != 2 {
		t.Errorf("taken %v, refused %v, offered %v, stats for %v; want the offer, the refusal, its event and both players' stats", taken, refused, offered, stats)
	}
}

func TestEveryCommandIsDecodedForTheLog(t *testing.T) {
	for op := range wire.EnumNamesOp {
		if op != wire.OpNone && op < wire.OpLobbyState && commandFields[op] == nil {
			t.Errorf("%s has no decoder in commandFields", op)
		}
	}
}

func TestABattleLogsWhatEachSideHasLeft(t *testing.T) {
	b := &game.Battle{Sim: &battle.Sim{Reason: battle.Eliminated, Squads: []*battle.Squad{
		{ID: 1, Side: battle.Attacker, Unit: "base:marine", Start: 4, Members: make([]battle.Layers, 1)},
		{ID: 2, Side: battle.Attacker, Unit: "base:marine", Start: 4},
		{ID: 3, Side: battle.Defender, Unit: "base:grunt", Start: 3, Members: make([]battle.Layers, 3)},
	}}}
	r := replay(b, 0, [2]float64{10, 5}).Result
	if r.Reason != battle.Eliminated || r.Start[0]["base:marine"] != 8 || r.Left[0]["base:marine"] != 1 || r.Left[1]["base:grunt"] != 3 || r.Damage != [2]float64{10, 5} {
		t.Errorf("result %+v; want marines 8 in, 1 left; grunts 3 left; the damage kept", r)
	}
}
