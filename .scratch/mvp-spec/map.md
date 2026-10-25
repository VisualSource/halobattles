# Halo Battles MVP spec

Label: wayfinder:map

## Destination

A game-design spec and a technical-architecture spec for the Halo Battles MVP, detailed enough to cut implementation tickets from.

## Notes

- Domain: real-time multiplayer grand strategy (Empire at War galaxy-map play + Stellaris-style resource management), Halo setting. Vocabulary in [GLOSSARY.md](../../GLOSSARY.md); use its terms.
- Grilling and research sessions should call the `grilling` and `domain-modeling` skills; record new terms in GLOSSARY.md and hard-to-reverse choices as ADRs in `docs/adr/`.
- Locked going in (from charting, 2026-10-25):
  - Real-time; 2–4 player online PvP. Bots later.
  - Factions for MVP: UNSC and Covenant.
  - Battle = ground only, automatic round-based, Planet is Locked while it runs; players only watch.
  - Planet model carried from v1: 3 Stacks, ~3 building slots, timed build queues.
  - Resources: Credits, Materials, Command Points (supply cap), defined as Mod data. No research/tech tree.
  - Vision: owned Planets + neighbours one Lane away; server filters per player.
  - Win: capture enemy Capitals, or hold a configurable share of Planets (per map).
  - Server: Nakama, **Go runtime**, authoritative match handler. Auth: Nakama device auth.
  - Match state in memory only (saving long-running Matches is a nice-to-have, in fog).
  - Client: browser; three.js WebGL renderer with HTML overlay for UI. SVGRenderer dropped.
  - Content is data-driven; the base game is itself a Mod. WASM Plugins later.
  - Fresh repo; prior versions are reference only.
- Prior versions (read-only reference, extracted during charting): v1 Node/tRPC/three SVG — the only one with a playable loop (Dijkstra lanes, timed queues, worker battles; github.com/VisualSource/halobattles); v2 Nakama Go lobby-only (Dec 2024); v3 Nakama Go data structures only (Aug–Sep 2025). Recurring failure: infra/auth churn before gameplay; maps never loaded from file. Archives at `/home/collinb/repos/archive/halobattles.rar` and `halowars.rar` — they contain keys (`rsakey.pem`, `nakama/local.yml`); never copy those in.
- Standing preference: gameplay and data-driven content before infrastructure.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [What are the Nakama Go runtime constraints?](issues/01-nakama-go-runtime-constraints.md): pin Nakama 3.41.0 with the pluginbuilder image, exact version match, no hot reload; 1–10 Hz tick; per-player `BroadcastMessage` handles vision; a handler panic crashes the whole server; wazero works in-plugin with memory and deadline limits; keep match state serialisable for later snapshots.
- [What does prior art in mod formats look like?](issues/04-mod-format-prior-art.md): copy Factorio's model (base game as a mod, `info.json` with versioned dependencies, mod-qualified asset paths); JSONC plus a draft-7 JSON Schema subset validated in Go and typed in TS; a semantic cross-reference pass after merging; server merges, hashes and serves content, clients cache it by hash.

## Not yet specified

- WASM Plugin API surface: which hooks, what data a Plugin sees, how it is sandboxed and metered. Waits on the Mod data model and the Nakama/wazero research.
- Saving and resuming long-running Matches.
- Bots: AI opponents filling empty seats.
- Spies and richer vision rules.
- Tech tree / unlocks.
- Lobby and matchmaking UX (map pick, faction pick, ready-up, reconnect).
- Assembling the final game-design and technical-architecture spec documents from resolved tickets.

## Out of scope

- Tactical Battles (player-controlled battles): wanted eventually, far beyond MVP.
- Space battles / orbital layer: not designed yet; MVP Battles are ground only.
- Tauri desktop client: blocked on Linux webkitgtk; browser-first keeps it possible later.
- Steam auth: device auth is enough for MVP.
- Real art and Halo IP licensing for public release.
- Pops / population simulation.
