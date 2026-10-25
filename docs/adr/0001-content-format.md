# Content format: JSONC + JSON Schema source of truth, override-by-id with explicit Patches

Mod content is JSONC with namespaced string ids. A later Mod changes existing content only by explicitly replacing a definition, or by applying an RFC 7396 Merge Patch to it. Redefining an id without saying so is a load error. We chose one override rule for every kind because Paradox's per-folder duplicate-id rules are the trap we wanted to avoid, and OpenRA-style deep merge would need a custom merge engine.

Hand-written draft-7-subset JSON Schemas are the single source of truth. Go structs (`go-jsonschema`) and TS types (`json-schema-to-typescript`) are both generated from them, so neither the server nor the client owns the format and neither can drift.

## Considered Options

- TypeBox schemas authored in TS, with hand-written Go structs: rejected, because the Go side would drift.
- Go structs as the source of truth, with schemas generated from them: rejected, because modders and the client would get a format shaped by Go.
- YAML: may come later behind the same schemas. The maintained Go YAML library had no stable release when we chose.
