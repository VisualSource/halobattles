package nakama

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/VisualSource/halobattles/server/internal/content"
)

func TestGetContentSendsDocumentOnlyWhenHashDiffers(t *testing.T) {
	rpc := getContent(&content.Content{JSON: []byte(`{"resources":{}}`), Hash: "abc"})
	call := func(payload string) map[string]json.RawMessage {
		t.Helper()
		out, err := rpc(context.Background(), nopLogger{}, nil, nil, payload)
		if err != nil {
			t.Fatalf("get_content(%q): %v", payload, err)
		}
		var reply map[string]json.RawMessage
		if err := json.Unmarshal([]byte(out), &reply); err != nil {
			t.Fatal(err)
		}
		return reply
	}

	for _, payload := range []string{"", "{}", `{"hash":"old"}`} {
		reply := call(payload)
		if string(reply["hash"]) != `"abc"` || string(reply["content"]) != `{"resources":{}}` {
			t.Errorf("payload %q: want hash and content, got %v", payload, reply)
		}
	}

	reply := call(`{"hash":"abc"}`)
	if _, has := reply["content"]; has || string(reply["hash"]) != `"abc"` {
		t.Errorf("matching hash: want {hash} alone, got %v", reply)
	}
}
