// Command halo-mod validates Mods with the same loader the server uses.
//
//	halo-mod check <mod dir>...
//
// Every Mod a checked Mod depends on must be listed too, base included.
package main

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"

	"github.com/VisualSource/halobattles/server/internal/content"
)

func main() {
	if len(os.Args) < 3 || os.Args[1] != "check" {
		fmt.Fprintln(os.Stderr, "usage: halo-mod check <mod dir>...")
		os.Exit(2)
	}
	c, err := content.Load(os.Args[2:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var doc map[string]map[string]json.RawMessage
	if err := json.Unmarshal(c.JSON, &doc); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var counts []string
	for _, kind := range slices.Sorted(maps.Keys(doc)) {
		counts = append(counts, fmt.Sprintf("%d %s", len(doc[kind]), kind))
	}
	fmt.Printf("ok: %s\nhash %s\n", strings.Join(counts, ", "), c.Hash)
}
