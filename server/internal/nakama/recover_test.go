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

func TestSafeRPCPassesThroughNormalReplies(t *testing.T) {
	rpc := safeRPC(func(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, payload string) (string, error) {
		return "echo:" + payload, nil
	})

	got, err := rpc(context.Background(), nopLogger{}, nil, nil, "hi")
	if err != nil || got != "echo:hi" {
		t.Fatalf("got (%q, %v), want (\"echo:hi\", nil)", got, err)
	}
}
