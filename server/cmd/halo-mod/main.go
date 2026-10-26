// Command halo-mod validates Mods with the same loader the server uses.
//
//	halo-mod check <mod dir>...
//
// Every Mod a checked Mod depends on must be listed too, base included.
package main

import (
	"fmt"
	"os"

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
	fmt.Printf("ok: %d resources, %d rulesets, hash %s\n", len(c.Doc.Resources), len(c.Doc.Rulesets), c.Hash)
}
