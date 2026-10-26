// Package nakama adapts the game to the Nakama runtime. Every handler is
// registered through a recover() wrapper.
package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/heroiclabs/nakama-common/runtime"
)

// Init loads the Mods named in HALO_MODS from HALO_MODS_DIR. Bad content
// returns an error, so Nakama refuses to start.
func Init(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	names, dir := os.Getenv("HALO_MODS"), os.Getenv("HALO_MODS_DIR")
	if names == "" || dir == "" {
		return errors.New("HALO_MODS and HALO_MODS_DIR must be set")
	}
	var dirs []string
	for _, name := range strings.Split(names, ",") {
		if name = strings.TrimSpace(name); name != "" {
			dirs = append(dirs, filepath.Join(dir, name))
		}
	}
	c, err := content.Load(dirs)
	if err != nil {
		return err
	}
	logger.Info("content loaded: mods=%s hash=%s", names, c.Hash)

	if err := initializer.RegisterRpc("get_content", safeRPC(getContent(c))); err != nil {
		return err
	}
	if err := initializer.RegisterMatch(matchModule, func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule) (runtime.Match, error) {
		return safeMatch{&match{content: c}}, nil
	}); err != nil {
		return err
	}
	return initializer.RegisterRpc("create_match", safeRPC(createMatch))
}

// createMatch starts an empty Match; its first joiner becomes Host.
func createMatch(ctx context.Context, _ runtime.Logger, _ *sql.DB, nk runtime.NakamaModule, _ string) (string, error) {
	id, err := nk.MatchCreate(ctx, matchModule, nil)
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(map[string]string{"matchId": id})
	return string(b), err
}
