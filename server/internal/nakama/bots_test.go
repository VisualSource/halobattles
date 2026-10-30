package nakama

import (
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/VisualSource/halobattles/server/internal/bot"
	"github.com/VisualSource/halobattles/server/internal/game"
	"github.com/VisualSource/halobattles/server/internal/gen/wire"
	flatbuffers "github.com/google/flatbuffers/go"
)

// withBot moves the harness to base:b-map (3 starts) and has u1 add a Hard
// Covenant Bot, which takes the third Seat.
func withBot(t *testing.T) *lobbyHarness {
	h := newLobbyHarness(t)
	h.loop(
		cmd(u1, wire.OpSetMap, &wire.SetMapT{Seq: 1, Map: "base:b-map"}),
		cmd(u1, wire.OpAddBot, &wire.AddBotT{Seq: 2, Faction: "base:covenant", Difficulty: "hard"}),
	)
	if r := h.rejection(u1, 2); r != "" {
		t.Fatalf("AddBot rejected: %s", r)
	}
	return h
}

func TestTheHostAddsAndRemovesBots(t *testing.T) {
	h := withBot(t)
	b := h.seat("bot:1")
	if b.Bot != "hard" || !b.Ready || b.Faction != "base:covenant" || b.DisplayName != "Bot 3" {
		t.Errorf("Bot Seat %+v; want a ready Hard Covenant Bot, named by its Seat (no names in this content)", b)
	}
	if h.join(presence{user: "u3", session: "s3"}) {
		t.Error("a player took the Bot's Seat")
	}

	h.loop(
		cmd(u2, wire.OpRemoveBot, &wire.RemoveBotT{Seq: 3, User: "bot:1"}),
		cmd(u1, wire.OpAddBot, &wire.AddBotT{Seq: 3, Faction: "base:unsc", Difficulty: "brutal"}),
		cmd(u1, wire.OpRemoveBot, &wire.RemoveBotT{Seq: 4, User: "u2"}),
	)
	if r := h.rejection(u2, 3); r != "only the Host can do that" {
		t.Errorf("u2 removing the Bot: %q", r)
	}
	if r := h.rejection(u1, 3); r != game.ErrLobbyFull.Error() {
		t.Errorf("a fourth Seat on a 3-start map: %q", r)
	}
	if r := h.rejection(u1, 4); r != "that Seat isn't a Bot's" {
		t.Errorf("removing a player as a Bot: %q", r)
	}

	h.loop(cmd(u1, wire.OpRemoveBot, &wire.RemoveBotT{Seq: 5, User: "bot:1"}))
	if len(h.d.lobby.Seats) != 2 {
		t.Errorf("seats %v after removing the Bot", seatNames(h.d.lobby))
	}
}

func TestALobbyOfOnlyBotsCloses(t *testing.T) {
	h := withBot(t)
	h.leave(u1)
	h.leave(u2)
	h.loop()
	if h.state != nil {
		t.Error("a lobby with only a Bot left should close the Match")
	}
}

func TestABotsGoroutineTakesViewsWithoutBlockingAndStops(t *testing.T) {
	before := runtime.NumGoroutine()
	c := testContent()
	r := runBot(bot.New(&c.Doc, 0, "base:unsc", "hard", 1, 0))

	// The Match loop never waits on a Bot: a View it hasn't read is replaced.
	sent := make(chan struct{})
	go func() {
		for i := range 100 {
			r.see(game.View{Time: int64(i) * 200})
		}
		close(sent)
	}()
	select {
	case <-sent:
	case <-time.After(2 * time.Second):
		t.Fatal("see blocked the Match loop")
	}

	close(r.done)
	for deadline := time.Now().Add(2 * time.Second); runtime.NumGoroutine() > before; {
		if time.Now().After(deadline) {
			t.Fatalf("%d goroutines, %d before: the Bot's didn't stop", runtime.NumGoroutine(), before)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// encode packs a command the way a Bot's would be.
func encode(t packer) []byte {
	b := flatbuffers.NewBuilder(64)
	b.Finish(t.Pack(b))
	return b.FinishedBytes()
}

func TestBotCommandsTakeThePlayersPath(t *testing.T) {
	h := withBot(t)
	h.loop(cmd(u2, wire.OpSetReady, &wire.SetReadyT{Seq: 9, Ready: true}), cmd(u1, wire.OpStartMatch, &wire.StartMatchT{Seq: 10}))
	s := h.state.(*matchState)
	if s.phase != wire.PhasePlay || s.bots["bot:1"] == nil {
		t.Fatalf("phase %v, bots %v; want play with the Bot running", s.phase, s.bots)
	}
	if p := s.play.Players[s.seat("bot:1")]; p.Bot != "hard" {
		t.Fatalf("the Bot's Player %+v", p)
	}

	// Stand in for its goroutine, so the test owns both channels.
	s.stopBots()
	r := &botRunner{
		views:    make(chan game.View, 1),
		commands: make(chan bot.Command, maxCommandsPerTick),
		rejected: make(chan rejection, maxCommandsPerTick),
	}
	s.bots = map[string]*botRunner{"bot:1": r}
	var capital string
	for id, p := range s.play.Planets {
		if p.Capital && p.Owner == s.seat("bot:1") {
			capital = id
		}
	}
	r.commands <- bot.Command{Op: wire.OpSetRallyStack, Data: encode(&wire.SetRallyStackT{Seq: 1, Planet: capital, Stack: 2})}
	r.commands <- bot.Command{Op: wire.OpQueueBuilding, Data: encode(&wire.QueueBuildingT{Seq: 2, Planet: capital, Slot: 0, Building: "base:nope"})}
	h.loop()

	if got := s.play.Planets[capital].Rally; got != 2 {
		t.Errorf("Rally Stack %d; the Bot's SetRallyStack wasn't applied", got)
	}
	select {
	case x := <-r.rejected:
		if x.seq != 2 || !strings.Contains(x.reason, "can't build") {
			t.Errorf("rejection %+v", x)
		}
	default:
		t.Error("the Bot wasn't told its command was refused")
	}
	if s.lastSeq["bot:1"] != 2 {
		t.Errorf("last seq %d, want 2", s.lastSeq["bot:1"])
	}
}
