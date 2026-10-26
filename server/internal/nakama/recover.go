package nakama

import (
	"context"
	"database/sql"
	"runtime/debug"

	"github.com/heroiclabs/nakama-common/runtime"
)

const codeInternal = 13 // gRPC INTERNAL

type rpcFunc = func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error)

// safeRPC turns a panic into an internal error. Nakama doesn't recover(),
// so an unrecovered panic in any handler takes down the whole server.
func safeRPC(fn rpcFunc) rpcFunc {
	return func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (out string, err error) {
		defer func() {
			if r := recover(); r != nil {
				logger.Error("rpc panic: %v\n%s", r, debug.Stack())
				out, err = "", runtime.NewError("internal error", codeInternal)
			}
		}()
		return fn(ctx, logger, db, nk, payload)
	}
}
