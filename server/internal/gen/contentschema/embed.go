// Package contentschema holds the content JSON Schemas (copied from
// schema/content by `mise run gen`) and the Go types generated from them.
package contentschema

import "embed"

//go:embed *.schema.json
var Files embed.FS
