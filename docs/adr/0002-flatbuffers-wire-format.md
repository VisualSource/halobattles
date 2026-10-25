# Wire format: FlatBuffers over the protobuf socket, separate from the content schema

Match messages between the Go match handler and the browser are FlatBuffers. `.fbs` files are the source of truth, and a pinned `flatc` generates both the Go and the TS code. Each Nakama opcode names one message type with a fixed root table. The nakama-js protobuf socket adapter carries the bytes raw. Content stays JSONC plus JSON Schema (ADR 0001), so the repo has two schema languages, and they never describe the same data: the wire refers to content by its string id only.

We chose a binary format from the start, even though JSON would have been enough at 2–4 players and 5 Hz. Because FlatBuffers has no maps and no "field deleted" semantics, View deltas are entity-level upserts plus removed-id lists rather than Merge Patches, and collections are vectors sorted by a `(key)` id. A dev-only logger decodes traffic to JSON, which makes up for the unreadable devtools traffic.

## Considered Options

- JSON with message types in JSON Schema and the same codegen as content: one schema toolchain, readable traffic, and Merge Patch deltas. Rejected because the user wanted a binary wire format from the start.
- Protobuf: a second binary toolchain with no advantage over FlatBuffers here.
- FlatBuffers over the default JSON socket: rejected, because base64 wrapping (about +33%) would cancel the point of going binary.
