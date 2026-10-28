package nakama

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestModsAreFoundOnTheSearchPathInOrder(t *testing.T) {
	image, uploads := t.TempDir(), t.TempDir()
	for _, d := range []string{
		filepath.Join(image, "base"),
		filepath.Join(uploads, "base"), // an upload can't replace the image's
		filepath.Join(uploads, "covenant-plus"),
	} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	missing := filepath.Join(t.TempDir(), "nope")
	path := strings.Join([]string{image, missing, uploads}, string(filepath.ListSeparator))

	got, err := findMods("base, covenant-plus", path)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{filepath.Join(image, "base"), filepath.Join(uploads, "covenant-plus")}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("found %v, want %v", got, want)
	}

	if _, err := findMods("base,flood", path); err == nil || !strings.Contains(err.Error(), `"flood"`) {
		t.Errorf("a Mod in no folder: err = %v", err)
	}
}
