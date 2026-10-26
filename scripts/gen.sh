#!/usr/bin/env bash
# Regenerates code from schema/ (run from the repo root by `mise run gen`).
# Output is generated into a temp dir and copied over only where it changed,
# so a no-op gen doesn't touch files the dev watcher would rebuild on.
set -euo pipefail

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# sync SRC DST: make DST's generated files match SRC, writing only changes.
# Files in DST that SRC lacks are removed, except hand-written embed.go.
sync() {
  local src=$1 dst=$2 f
  mkdir -p "$dst"
  (cd "$src" && find . -type f) | while read -r f; do
    mkdir -p "$dst/$(dirname "$f")"
    cmp -s "$src/$f" "$dst/$f" || cp "$src/$f" "$dst/$f"
  done
  (cd "$dst" && find . -type f ! -name embed.go) | while read -r f; do
    [ -e "$src/$f" ] || rm "$dst/$f"
  done
}

# Content: Go embeds the schemas (go:embed can't reach outside the module),
# plus Go and TS types.
mkdir -p "$tmp/contentschema" "$tmp/ts"
cp schema/content/*.schema.json "$tmp/contentschema/"
(cd server && go tool go-jsonschema -p contentschema -t --capitalization ID --tags json --only-models \
  --disable-custom-types-for-maps -o "$tmp/contentschema/types.go" \
  ../schema/content/content.schema.json ../schema/content/mod.schema.json)
pnpm -C client exec json2ts -i ../schema/content/content.schema.json -o "$tmp/ts/content.ts" \
  --cwd ../schema/content --bannerComment '// Generated from schema/content by mise run gen. Do not edit.'

# Wire: FlatBuffers.
flatc --go --gen-object-api -o "$tmp/go" schema/wire/*.fbs
gofmt -w "$tmp/go"
flatc --ts --gen-object-api -o "$tmp/ts" schema/wire/*.fbs

sync "$tmp/contentschema" server/internal/gen/contentschema
sync "$tmp/go/wire" server/internal/gen/wire
sync "$tmp/ts" client/src/gen
