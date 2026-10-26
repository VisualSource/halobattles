// Package nakama adapts the game to the Nakama runtime. Every handler is
// registered through a recover() wrapper.
package nakama

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

func Init(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	return initializer.RegisterRpc("hello", safeRPC(hello))
}

func hello(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error) {
	b, err := json.Marshal(map[string]string{"message": "Hello from the Halo Battles server"})
	return string(b), err
}
