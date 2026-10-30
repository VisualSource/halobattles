package nakama

import (
	"context"
	"database/sql"
	"testing"

	"github.com/heroiclabs/nakama-common/runtime"
)

type nopLogger struct{ runtime.Logger }

func (nopLogger) Error(string, ...interface{}) {}

func TestPanickingRPCReturnsErrorInsteadOfCrashing(t *testing.T) {
	rpc := safeRPC(func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error) {
		panic("boom")
	})

	_, err := rpc(context.Background(), nopLogger{}, nil, nil, "")
	if err == nil {
		t.Fatal("want an error from a panicking handler, got nil")
	}
}

type panickingMatch struct{ runtime.Match }

func (panickingMatch) MatchLoop(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, runtime.MatchDispatcher, int64, interface{}, []runtime.MatchData) interface{} {
	panic("boom")
}

func (panickingMatch) MatchJoinAttempt(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, runtime.MatchDispatcher, int64, interface{}, runtime.Presence, map[string]string) (interface{}, bool, string) {
	panic("boom")
}

func TestPanickingMatchEndsThatMatchInsteadOfCrashing(t *testing.T) {
	m := safeMatch{panickingMatch{}}

	if state := m.MatchLoop(context.Background(), nopLogger{}, nil, nil, nil, 0, "state", nil); state != nil {
		t.Errorf("MatchLoop after a panic returned %v, want nil to end the Match", state)
	}
	if _, ok, _ := m.MatchJoinAttempt(context.Background(), nopLogger{}, nil, nil, nil, 0, "state", nil, nil); ok {
		t.Error("a panicking join attempt should be rejected")
	}
}

func TestACrashedMatchStopsItsBots(t *testing.T) {
	m := safeMatch{panickingMatch{}}
	r := &botRunner{done: make(chan struct{})}
	state := &matchState{bots: map[string]*botRunner{"bot:1": r}}

	m.MatchLoop(context.Background(), nopLogger{}, nil, nil, nil, 0, state, nil)

	select {
	case <-r.done:
	default:
		t.Error("the Bot's goroutine was left running after its Match ended")
	}
}

func TestSafeRPCPassesThroughNormalReplies(t *testing.T) {
	rpc := safeRPC(func(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, payload string) (string, error) {
		return "echo:" + payload, nil
	})

	got, err := rpc(context.Background(), nopLogger{}, nil, nil, "hi")
	if err != nil || got != "echo:hi" {
		t.Fatalf("got (%q, %v), want (\"echo:hi\", nil)", got, err)
	}
}
