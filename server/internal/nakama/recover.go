package nakama

import (
	"context"
	"database/sql"
	"runtime/debug"

	"github.com/heroiclabs/nakama-common/runtime"
)

// gRPC status codes for runtime.NewError.
const (
	codeInvalidArgument = 3
	codeInternal        = 13
)

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

// safeMatch wraps every Match handler call in recover(), for the same
// reason as safeRPC. A panic ends that one Match: its state may be half
// updated, so it isn't safe to keep running.
type safeMatch struct{ m runtime.Match }

func logPanic(logger runtime.Logger, handler string, r any) {
	logger.Error("%s panic, ending the Match: %v\n%s", handler, r, debug.Stack())
}

func (s safeMatch) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (state interface{}, rate int, label string) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchInit", r)
			state, rate, label = nil, tickRate, ""
		}
	}()
	return s.m.MatchInit(ctx, logger, db, nk, params)
}

func (s safeMatch) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (out interface{}, ok bool, reason string) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchJoinAttempt", r)
			out, ok, reason = state, false, "internal error"
		}
	}()
	return s.m.MatchJoinAttempt(ctx, logger, db, nk, dispatcher, tick, state, presence, metadata)
}

func (s safeMatch) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) (out interface{}) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchJoin", r)
			out = nil
		}
	}()
	return s.m.MatchJoin(ctx, logger, db, nk, dispatcher, tick, state, presences)
}

func (s safeMatch) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) (out interface{}) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchLeave", r)
			out = nil
		}
	}()
	return s.m.MatchLeave(ctx, logger, db, nk, dispatcher, tick, state, presences)
}

func (s safeMatch) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) (out interface{}) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchLoop", r)
			out = nil
		}
	}()
	return s.m.MatchLoop(ctx, logger, db, nk, dispatcher, tick, state, messages)
}

func (s safeMatch) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) (out interface{}) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchTerminate", r)
			out = nil
		}
	}()
	return s.m.MatchTerminate(ctx, logger, db, nk, dispatcher, tick, state, graceSeconds)
}

func (s safeMatch) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (out interface{}, reply string) {
	defer func() {
		if r := recover(); r != nil {
			logPanic(logger, "MatchSignal", r)
			out, reply = nil, ""
		}
	}()
	return s.m.MatchSignal(ctx, logger, db, nk, dispatcher, tick, state, data)
}
