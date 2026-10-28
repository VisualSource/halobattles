// Package nakama adapts the game to the Nakama runtime. Every handler is
// registered through a recover() wrapper.
package nakama

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/heroiclabs/nakama-common/runtime"
)

// Init loads the Mods named in HALO_MODS, each from the first folder on
// HALO_MODS_DIR that has it. Bad content returns an error, so Nakama refuses
// to start.
func Init(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	names, path := os.Getenv("HALO_MODS"), os.Getenv("HALO_MODS_DIR")
	if names == "" || path == "" {
		return errors.New("HALO_MODS and HALO_MODS_DIR must be set")
	}
	dirs, err := findMods(names, path)
	if err != nil {
		return err
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

// findMods finds each Mod in names (comma-separated) on path: folders
// separated like PATH, searched in order, so a Mod baked into the image can't
// be replaced by one uploaded to a later folder. A folder that doesn't exist
// is skipped.
func findMods(names, path string) ([]string, error) {
	folders := filepath.SplitList(path)
	var dirs []string
	for _, name := range strings.Split(names, ",") {
		if name = strings.TrimSpace(name); name == "" {
			continue
		}
		found := ""
		for _, f := range folders {
			if st, err := os.Stat(filepath.Join(f, name)); err == nil && st.IsDir() {
				found = filepath.Join(f, name)
				break
			}
		}
		if found == "" {
			return nil, fmt.Errorf("Mod %q isn't in any of %s", name, strings.Join(folders, ", "))
		}
		dirs = append(dirs, found)
	}
	return dirs, nil
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
