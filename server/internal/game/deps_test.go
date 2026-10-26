package game

import (
	"os/exec"
	"strings"
	"testing"
)

func TestGameDoesNotDependOnNakama(t *testing.T) {
	out, err := exec.Command("go", "list", "-deps", ".").Output()
	if err != nil {
		t.Fatal(err)
	}
	for _, dep := range strings.Fields(string(out)) {
		if strings.HasPrefix(dep, "github.com/heroiclabs/") {
			t.Errorf("internal/game depends on %s; keep Nakama out of the rules", dep)
		}
	}
}
