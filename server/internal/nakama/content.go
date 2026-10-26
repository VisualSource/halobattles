package nakama

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/VisualSource/halobattles/server/internal/content"
	"github.com/heroiclabs/nakama-common/runtime"
)

// getContent replies {hash} when the client's cached hash is current, and
// {hash, content} otherwise. Both replies are built once.
func getContent(c *content.Content) rpcFunc {
	full, _ := json.Marshal(map[string]any{"hash": c.Hash, "content": json.RawMessage(c.JSON)})
	same, _ := json.Marshal(map[string]string{"hash": c.Hash})

	return func(_ context.Context, _ runtime.Logger, _ *sql.DB, _ runtime.NakamaModule, payload string) (string, error) {
		var req struct {
			Hash string `json:"hash"`
		}
		if payload != "" {
			if err := json.Unmarshal([]byte(payload), &req); err != nil {
				return "", runtime.NewError("payload must be {\"hash\"?: string}", codeInvalidArgument)
			}
		}
		if req.Hash == c.Hash {
			return string(same), nil
		}
		return string(full), nil
	}
}
