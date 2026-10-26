// Command server is the Nakama Go runtime module, built with -buildmode=plugin.
package main

import (
	"context"
	"database/sql"

	"github.com/VisualSource/halobattles/server/internal/nakama"
	"github.com/heroiclabs/nakama-common/runtime"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	return nakama.Init(ctx, logger, db, nk, initializer)
}
