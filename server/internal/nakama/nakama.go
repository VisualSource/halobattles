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

	if err := initializer.RegisterRpc("hello", safeRPC(hello)); err != nil {
		return err
	}
	return initializer.RegisterRpc("get_content", safeRPC(getContent(c)))
}

func hello(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error) {
	b, err := json.Marshal(map[string]string{"message": "Hello from the Halo Battles server"})
	return string(b), err
}
