# Halo Battles MVP: technical-architecture spec

How the MVP is built. Terms follow [GLOSSARY.md](../../GLOSSARY.md). The rules this runs are in the [game-design spec](game-design-spec.md).

Hard-to-reverse choices are recorded as ADRs:

- [ADR 0001: Content format](../../docs/adr/0001-content-format.md): JSONC with a JSON Schema source of truth, override by id with explicit Patches.
- [ADR 0002: Wire format](../../docs/adr/0002-flatbuffers-wire-format.md): FlatBuffers over the protobuf socket, kept separate from the content schema.

## System overview

```
browser client (React + three.js)
   │  nakama-js socket, protobuf adapter, FlatBuffers payloads (:7350)
   │  get_content / create_match RPCs
   │  static /mods/<mod>/… assets (Vite dev server, or dist/ in a build)
   ▼
Nakama 3.41.0 (Go plugin .so)  ──  Postgres 16 (accounts only; no Match state)
   ├─ internal/nakama: match handler, RPCs, View diffing, encoding
   ├─ internal/game:   pure rules and Battles
   └─ internal/content: Mod load, merge, validate, hash
```

- Real-time, server-authoritative. The server holds the full state, and each player is sent only their **View**.
- **Match state is in memory only.** A server restart loses every Match. Saving Matches is post-MVP, but state is kept serialisable from day one.
- Auth is Nakama device auth.

## Server runtime: Nakama Go

- **Version pin:** Nakama v3.41.0, Go 1.27.1, nakama-common v1.48.0. Build with `heroiclabs/nakama-pluginbuilder:3.41.0`, run on `heroiclabs/nakama:3.41.0`, and vendor dependencies. Pinning is exact: if the Go toolchain or any shared dependency differs, the `.so` fails to load at startup. There is no hot reload and no Windows build.
- **Match handler:** `MatchLoop` runs at **5 Hz** (Nakama allows 1–60). Each tick it gets every message buffered since the last one (sender presence, int64 opcode, raw bytes, receive time). It runs even when the Match is empty.
- **Backpressure:** a full input queue (128) drops messages, and a full call queue (128) closes the Match. Inbound client messages are capped at 4096 bytes.
- **Panics crash the whole server**, because Nakama doesn't `recover()`. The adapter wraps every handler call in `recover()` (see [Repo layout](#repo-layout)).
- **Per-player sends:** `BroadcastMessage` with a list of presences sends one filtered payload to one player.
- **Lobby listing:** a JSON match label (max 2 KB, batched about every 1 s, searchable) plus `MatchList`. `MatchJoinAttempt` sees join metadata and can reject.
- **Later, not MVP:**
  - Plugins: wazero v1.12.0 links into the plugin with no conflicts. It enforces a memory cap and a context-deadline CPU cutoff, but has no fuel metering, so it would need a per-call deadline well under one tick.
  - Saving Matches: periodic `nk.StorageWrite` snapshots (the only thing that survives a crash), `MatchTerminate` and `RegisterShutdown` (only with `shutdown_grace_sec > 0`), and resuming via `MatchCreate` with a new Match id.

## Content and Mod data model

Format choice: [ADR 0001](../../docs/adr/0001-content-format.md).

### Ids

- Content ids are strings namespaced by Mod, like `base:marine`. A reference without a prefix resolves to the Mod that makes it.
- Map Planet ids are local to their map and have no namespace.
- All ids are ASCII only (`[a-z0-9_:-]`, enforced by the schema), so Go's and JS's `<` agree. Every "lowest id" tie-break uses that byte-wise order.
- Player tie-breaks use the Seat index, never the Nakama user id.

### Mods, load order and overrides

- The base game is itself a Mod, `base`, which is always loaded first.
- Each Mod has a `mod.jsonc` manifest: `name` (also its id namespace), `version` (semver), `title`, and `dependencies` as Factorio-style strings (`"base >= 1.0"`, `"? foo"` optional, `"! bar"` incompatible). There is no game-version field; depending on `base` does that job. There is no `plugins` field.
- Load order is dependency depth, then name.
- **One override rule for every kind.** A later Mod either:
  - replaces a definition by id, saying so explicitly; or
  - writes a **Patch**, an RFC 7396 JSON Merge Patch (`{"patch": "base:marine", "combat": {"hp": 60}}`), where `null` deletes a field and arrays are replaced whole.
- Defining an existing id without marking it as a replacement is a load error.

### Files

```
mymod/
  mod.jsonc
  data/<kind>/*.jsonc     # one definition (with "id") or one Patch per file
  assets/...              # referenced as "__mymod__/icons/marine.png"
```

Kind folders let VS Code attach the right schema by glob. Assets use the `__mod__/` form so they can't be confused with `mod:id`.

### Schemas and validation

- Hand-written JSON Schema, kept to a draft-7 subset with `additionalProperties: false`, is the source of truth.
  - TS types come from `json-schema-to-typescript`, Go structs from `go-jsonschema`.
  - Go validates with `santhosh-tekuri/jsonschema/v6`.
  - Modders get autocomplete by pointing `$schema` at the same files.
- A **semantic pass** runs after merging. It checks cross-references (Factions, units, Unit Classes, Weapon Types, Planet Types, map Planets, assets) and constraints that span definitions (for example, `win.planetShare > 0.5`).
- **Invalid content stops the server.** It refuses to start and lists every error.
- The same validator ships as the `halo-mod check` CLI.

### Kinds and fields

Every definition has an `id` and an inline English `name`. Every asset reference is optional; the client draws a placeholder when one is missing. A "resource map" is `{resourceId: amount}` over stockpile Resources.

- **Resource:** a stockpile only, with an optional `icon`. Command Points is **not** a Resource; it is carried by `commandPoints` and `commandPointBonus` fields.
- **Faction:** an optional `icon` and a **Starting Kit**: the buildings and Stacks (`[{unit, count}]` per Stack) placed on its Capital. Starting resources are not part of the kit.
- **Unit:** `faction`, `cost` (resource map), `buildTime`, `commandPoints`, optional `maxCount` (per player, counted from queue to death), optional `slotLimit` (the most one Unit Slot holds), `combat` (required), optional `icon`.
- **Building:** `faction`, `cost`, `buildTime`, `upkeep` and `yield` (resource maps), `commandPointBonus`, optional `trains: [unitIds]` (makes it a production building with its own unit queue), optional `combat` (makes it armed), optional `icon`. There are no build limits or prerequisites.
- **`combat` block:** `unitClass`, `weaponType`, `shield`, `armor`, `hp`, `damage`, `initiative`, and `tiers: {unitClassId: tierName}`. A Unit Class missing from `tiers` counts as `average`.
- **Unit Class:** an id and a name.
- **Weapon Type:** a multiplier for each layer (`shield`, `armor`, `hp`).
- **Planet Type:** `income` (resource map), `buildingSlots`, `commandPointBonus`, optional `sprite`.
- **Ruleset:** exactly one definition, `base:rules`, which later Mods Patch. Its fields are:
  - the Payday interval;
  - the cancel-after-start and sell refund percentages;
  - Unit Slots per Stack;
  - tier names and their multipliers;
  - Lane types and their multipliers;
  - the Initiative die size, the Round duration and the Round cap;
  - `startingResources`, the defaults the lobby fills in (maps have none of their own);
  - `gracePeriodSeconds`, `resultsSeconds` and `armyVisionSeconds`, in whole seconds and converted to Match Time ms by the server.

  Defaults are in the game-design spec's [Ruleset defaults](game-design-spec.md#ruleset-defaults).
- **Map:**
  - `planets`: a local id, `name`, `type` (a Planet Type), 2D `position {x, y}`, an optional `overrides` (a Patch on its type's values), and an optional `model`: `planet` (the default) or `ring`, which the client draws as a Halo ring.
  - `lanes`: `{from, to, type}`. Optional `length` defaults to the straight-line distance; optional `time` overrides length × multiplier.
  - `garrisons`: neutral starting forces per Planet, as up to 3 Stacks of `[{unit, count}]`, from any Faction. A garrison on a `starts` Planet applies only when that start is unused.
  - `starts`: a list of Planet ids. Its length is the maximum player count; a used start is its player's Capital. There is also `minPlayers`.
  - `win`: `{planetShare, holdSeconds}`.

### Which Mods run, and delivery

- The server config lists the enabled Mods, and every Match on that server uses all of them. The lobby picks only the map, the Factions and the starting resources.
- At startup the server merges, validates and hashes the content into **one JSON document in the file shape**, keyed `kind → id → definition`, with every Patch applied.
- Clients fetch that document, cache it by hash, and type it with the same generated TS types. They never handle load order or Patches. Players never install Mods.

### Plugin seams (names only)

The Plugin API is post-MVP. The spec names only where it will attach:

1. After content merge
2. Payday income
3. Battle target choice
4. Battle hit damage
5. Planet captured
6. Win check

## Wire protocol and state sync

Encoding: [ADR 0002](../../docs/adr/0002-flatbuffers-wire-format.md).

### Encoding

- **FlatBuffers.** `.fbs` files are the source of truth for wire messages, and a pinned `flatc` generates Go and TS. Content stays in JSON Schema, so the two schema languages never describe the same data; the wire refers to content by string id only.
- **One Nakama opcode per message type**, each with a fixed root table and no union envelope. Opcodes 1–99 are client commands, and 100+ are server messages.
- The client uses the nakama-js **protobuf socket adapter**, so the bytes travel raw with no base64.
- **Ids:** Match entities (Armies, queue items, Battles) take `uint32` ids from one monotonic counter per Match. Planets, Lanes and content keep their string ids.
- **Collections** are vectors of tables keyed by id with `(key)`, so they're sorted and support binary search.
- **Debugging:** dev client builds decode every message with the object API and log it as JSON. A server debug log sits behind a Nakama runtime env flag and is off by default.

### Phases

- `lobby` → `play` → `results`.
- **`lobby`:** `LobbyState {phase, host, map, startingResources, seats: [{user, displayName, faction, ready}]}` is sent whole to everyone on join and on every lobby change, with no deltas.
- **`play`:** starts with each player's `ViewFull`.
- **`results`:** starts with `MatchEnded`. The Match terminates after the results duration, or once everyone has left.
- A command sent in the wrong phase is rejected.

### Sync model

- Each tick the server computes every player's View with `view(state, player)`, a pure function and **the only place vision is enforced**. It diffs that View against the last one sent to the player.
- `ViewFull` is sent on join and rejoin. After that, `ViewDelta` is sent only when something changed.
- Deltas work at the **entity level**: vectors of whole upserted entities (Planets, Armies, queue items, Battles, the player's own Resources and Command Points), plus removed-id vectors (`removedArmies`, `removedQueueItems`, and so on). An entity that leaves vision shows up as removed.
- The public per-player part of the View has every player's Planet count, `connected`, `graceEndsAt` (Match Time), and any running win-hold countdown.
- `ViewFull` carries the content hash and the Ruleset. If the client's cached content doesn't match the hash, it refetches before rendering.

### Events

These one-off messages travel on a side channel, alongside the View:

| Event | Sent to |
|---|---|
| `CommandRejected {seq, reason}` | the sender |
| `PaydayPaid {net per Resource}` | that player |
| `BattleStarted {planet, roster}` | the two sides |
| `BattleRound {planet, round, actions}` | the two sides |
| `BattleEnded {planet, winner}` | viewers who can see the Planet |
| `PlanetCaptured {planet, from, to}` | viewers who can see the Planet |
| `PlayerEliminated {player}` | everyone |
| `MatchEnded {winner, reason}` | everyone |

`MatchEnded` with `winner: none, reason: abandoned` ends a Match whose remaining players all ran out their Grace Periods.

### Time

- Payday, Battle Rounds, queue completions, Lane arrivals and Grace Period expiries are scheduled on **Match Time** (ms since the Match started). Each fires on the first tick after it's due.
- Every message carries the current Match Time, and the client keeps a clock offset from it.
- Lane hops, queue items, the next Round and the next Payday are sent as start/end Match Time pairs, and the client interpolates between them. A paused queue (debt or Locked) carries `paused` plus the progress remaining instead of an end time.

### Commands

Every command carries a client-assigned `seq`.

| Command | Phase | Who |
|---|---|---|
| `SetFaction {faction}` | lobby | any Seat |
| `SetReady {ready}` | lobby | any Seat |
| `SetMap {map}` | lobby | Host |
| `SetStartingResources {amounts per Resource}` | lobby | Host |
| `StartMatch` | lobby | Host |
| `QueueBuilding {planet, slot, building}` | play | owner |
| `QueueUnit {planet, building slot, unit, count}` | play | owner |
| `CancelQueueItem {itemId}` | play | owner |
| `SellBuilding {planet, slot}` | play | owner |
| `MoveUnits {planet, fromStack, toStack, unit, count}` | play | owner |
| `SetRallyStack {planet, stack}` | play | owner |
| `OrderArmy {fromPlanet, units: [{stack, unit, count}], toPlanet, toStack}` | play | owner |
| `ReorderArmy {army, toPlanet, toStack}` | play | owner |
| `Surrender` | play | any Seat |

- In `QueueUnit`, `count` expands into that many queue items, each reserving its own Command Points.
- Leaving uses the socket's own match leave, not a command. Leaving in `lobby` frees the Seat; leaving in `play` is a Forfeit.

### Trust boundary

- There is **no client prediction**. A command shows as pending until the View changes or a `CommandRejected` arrives.
- The server validates each command on the tick that processes it, against authoritative state: schema, size (< 4096 B), phase, ownership or Host role, Lock, debt, cost, Command Point cap, free slot, and route existence. Lobby validation adds the Seat cap on `SetMap` and the 0–1,000,000 whole-number range for every Resource on `SetStartingResources`.
- Each player is capped at **20 commands per tick**, and anything past that is rejected, so nobody can flood the 128-message input queue.

### Vision

- **Static map:** Planets, Lanes and Planet Types come from content, so every client always has them. Capitals are not static: they are decided at Start.
- **Visible Planets you don't own:** the owner, the `capital` flag, the Locked flag, buildings, and Stack contents (unit types and counts). Their queues stay hidden.
- **Armies:** visible while on a Lane with at least one endpoint in your vision. You see only the current hop, never the final destination.
- **Battles:** only the two sides get the roster, the Round events, and the roster's current state in their View. Anyone else with vision sees the Locked flag and `BattleEnded`.
- **Never sent:** other players' Resources and Command Points.
- **Last-seen cache:** the dynamic details of a Planet outside vision are absent from the View. The client keeps a local last-seen copy, shown greyed with its age, and loses it on reload.

### Battles on the wire

- `BattleStarted` carries a roster: per-Battle combatant ids, each with its unit type, side, and starting Shield, Armor and HP.
- `BattleRound` carries the Round's actions in Initiative order: `{actor, target, weapon, shieldDmg, armorDmg, hpDmg, killed}`.
- A side that reconnects mid-Battle sees where the Battle stands now, from its View. It doesn't get a replay.
- Each Battle's RNG is seeded from the Match seed plus the Battle id, and the resolver is a pure function of (forces, seed).

### Lobby listing and joining

- A `create_match` RPC calls `MatchCreate` with no parameters and returns the Match id.
- The JSON match label is `{phase, map, seats, max}`. The open list filters on it to show `lobby`-phase Matches with a free Seat.
- In `lobby`, `MatchJoinAttempt` admits anyone while a Seat is free. After Start, it admits only returning Seats, identified by Nakama user id, and each gets a `ViewFull`.
- On Start, the server shuffles the map's `starts`, assigns one to each Seat, applies each Faction's Starting Kit to its start, and garrisons unused starts.

## Client architecture

### Stack

React 19, Vite, strict TypeScript, TanStack Router, and Zustand **vanilla** stores, so the scene can subscribe without React. three.js is used directly, with **no react-three-fiber**.

### Routes

- `/`: the main menu. Device auth runs silently in the root route's `beforeLoad`; there is no login screen, only a display-name prompt the first time. From here a player creates a Match (`create_match`, no form), opens one from the list, or pastes an Invite (a bare Match id works too). A three.js flyover of a Halo ring and a gas giant runs behind the menu, the name prompt and the joining and connection screens.
- `/match/$matchId`: a layout route that owns the `MatchConnection`. It opens the connection in its loader and closes it on leave, so the lobby and play share one socket. A reload rejoins through this loader.
  - Child routes: `lobby` → `play` → `results`. **The server's phase drives navigation**: a phase change redirects to the matching child, and a URL that doesn't match the phase redirects back.
  - **`lobby`:** one screen with the Seat list (name, Faction, ready, and open Seats), your own Faction, Host-only map and resource controls, and a bottom bar with the Host's Start button, which stays disabled until Start is allowed, or everyone else's ready toggle. The Faction opens a full-screen picker that previews each Faction's starting kit; the map opens a dialog listing every map with a miniature of its Planets and Lanes.
  - **`results`:** the winner, the reason and "Back to menu".

### State: three stores, one writer each

1. **Match store:** the current View (or `LobbyState`) as plain TS objects in `Map`s keyed by id. Only the connection layer writes it. Everything else reads it.
2. **Local store:** selection, the hovered Planet, pending commands by `seq`, the last-seen Planet cache, and the clock offset.
3. **Scene:** owns no game state. It subscribes to both stores and updates three.js objects imperatively. React components read the stores through selectors.

### Connection layer

`MatchConnection` owns the nakama-js socket and protobuf adapter. It:

- maps opcodes to FlatBuffers decoders;
- **unpacks** every message to plain objects at the edge, so nothing else imports FlatBuffers types;
- writes the Match store, and sends events (toasts, Battle playback) to an event bus;
- assigns `seq` and settles pending commands.

Dev builds log the unpacked messages as JSON.

### Galaxy scene

- A **perspective camera at a fixed tilt** (30° from the horizontal, a narrow 17° field of view from far back, like EaW's galaxy map) looks at the map on the XZ plane, for a 2.5D view. It opens zoomed to fit the whole map, but never closer than a view 690 world units tall, so a small map sits in open space and Planets stay small markers; zooms with the wheel by moving closer or further, from 0.6× that fit up to 4×, pans by drag, WASD or the arrow keys, and **never rotates**. Panning stops where the view would leave the map: the point it looks at stays within the map's bounds plus a margin of half the map or half the minimum view, whichever is larger.
- Under the map lies a **galaxy disc**: a generated spiral, seeded by the map's id, lying flat far below the map (350 units, on the line of sight through its centre), so the Planets float over it and slide across it when panning. A low ambient light and a strong side sun give each Planet a lit and a dark side.
- Behind the map, a **backdrop** of stars and faint nebulae, seeded by the map's id and coloured from the theme, sits in screen space: it ignores zoom and pans with parallax (stars at 30% of the map's speed, nebulae at 15%).
- Planet labels use **CSS2DRenderer** with plain DOM elements the scene creates: name, owner colour, Locked icon, a construction pip, and a pile per Stack (ovals stacked by unit count, the three in a triangle with the middle one raised). Only your own Stack piles are interactive: they can be dragged (see [Ordering](#ordering)).
- A `requestAnimationFrame` loop places Armies on Lanes by lerping each hop's start/end Match Time against `performance.now() + offset`.
- A Locked marker shows on Planets with a Battle.

### HUD

React, fixed to the screen, not anchored to 3D.

- **Planet panel:**
  - **Owned:** Building Slots (an empty slot opens a building picker for `QueueBuilding`; a filled slot can be sold), the construction queue, one unit queue per production building (`QueueUnit` with a count, plus cancel), the 3 Stack grids of Unit Slots with drag-to-any-cell, in the same Stack or another (`MoveUnits` with a target cell), and a right-click split, and a Rally Stack toggle.
  - **Visible, not owned:** read-only owner, buildings and Stacks. Queues are hidden.
  - **Out of vision:** the last-seen copy, greyed, with its age.
  - **Locked:** commands are disabled, and "Watch Battle" is offered if you are a side.
- **Battle panel:** a DOM `BattleView` showing both sides' Unit Slot grids with Shield, Armor and HP bars. It animates each Round's actions in order across the Round duration and reuses the Stack grid component. It sits behind its own module, so a 3D or Tactical Battle view can replace it later.
- **Player badges:** a disconnected badge with a forfeit countdown (from `graceEndsAt`) for each player.
- **Animating between ticks:** progress bars use CSS animations set once per change (from the current progress to 100% over the remaining ms). A paused queue freezes its bar. Countdown text (Payday, win-hold, forfeit) ticks from a 1 Hz `useMatchNow` hook.

### Ordering

Empire at War style: the map shows each Planet's three Stacks, and an order is a drag.

1. Drag one of your Stack piles onto another Planet to send that whole Stack with `OrderArmy`. Dropped on one of that Planet's piles, it lands in that Stack (`toStack`); dropped on the Planet itself, it lands in the Rally Stack, or Stack 1 when attacking. The same goes for re-ordering an Army. To send part of a Stack, first split it in the Stacks window.
2. Drag one of your Armies onto a Planet to send `ReorderArmy`.
3. `toStack` is the target's Rally Stack if you own it, otherwise Stack 1.
4. A click without dragging selects the Planet or Army and opens its panel. Escape cancels a drag and clears the selection. There is no box-select.
5. The keyboard path is each Stack's "Send to…" picker in the Planet panel.

- While dragging over a target, a **route preview** comes from a client-side TS port of the server's Dijkstra over static Lanes, using the owners you can see (out of vision: as last seen, else neutral). A ring on the target shows a move (green), an attack (red) or no route (grey). The server's route stays authoritative.
- **Pending commands:** the affected control shows a pending state (a greyed row or a slot spinner). It clears when the View changes the entity, or turns into a toast with the reason on `CommandRejected`.

### Content and assets

- Before joining, the client calls `get_content` with the hash of its **Cache API** copy, if it has one. It stores whatever comes back, then builds typed lookups such as `content.units.get("base:marine")`.
- One `assetUrl()` function maps `__mod__/path` to `/mods/<mod>/path` and is the only code that knows how assets are served. three.js loaders and `<img>` load assets lazily, with a placeholder while loading or when no asset exists. The base Mod ships no art, so placeholders are the norm.

### Platform

- Desktop only: mouse and keyboard, minimum 1280×720.
- The client uses only fetch, WebSocket, the Cache API and the DOM. The server URL lives in one config module. A future Tauri build would wrap the same bundle, so no abstraction layer is built now.

## Repo layout

A fresh repo; prior versions are reference only and their keys must never be copied in.

```
server/                  one Go module
  internal/game/         pure rules and Battles; injected clock and RNG; no nakama-common imports
  internal/nakama/       match handler, RPCs, FlatBuffers encoding, View diffing, recover() on every handler call
  internal/content/      load, merge, validate and hash Mods
  internal/gen/          generated Go (content structs, FlatBuffers)
  cmd/halo-mod/          validator CLI
client/                  Vite + React; generated TS in src/gen/
mods/base/               the base game Mod
schema/content/          JSON Schema (ADR 0001)
schema/wire/             .fbs (ADR 0002)
testdata/                shared fixtures, including routing/*.json
deploy/                  compose, local.yml, runtime.env
```

### Toolchain and codegen

- **mise** pins Go 1.27.1, Node, pnpm and flatc, and is the task runner: `gen`, `dev`, `test`, `check`.
- `go-jsonschema` is pinned with a `tool` directive in `server/go.mod`. `json-schema-to-typescript` is a pnpm devDependency.
- Generated code is committed, and `check` fails if `gen` leaves a diff.
- `vendor/` is gitignored. The build task runs `go mod vendor` just before the pluginbuilder `-buildmode=plugin` build.

### Local stack

- docker-compose runs `nakama:3.41.0` and Postgres 16, nothing else.
- `deploy/local.yml` holds only Nakama's stock dev keys, commented "dev only". `deploy/*.prod.yml` and `*.pem` are gitignored.
- `mods/` is bind-mounted at `/nakama/data/mods`. `runtime.env` sets `HALO_MODS=base,…` and `HALO_MODS_DIR`.
- `InitModule` loads, merges, validates and hashes the Mods, and returns an error on failure, so Nakama refuses to start.

### Serving content and assets

- **Content:** a `get_content` RPC takes an optional `{hash}`. If it matches the server's hash, the reply is `{hash}` alone ("unchanged"); otherwise it is `{hash, content}`, the merged document. That is one round trip whether the cache hits or misses. `ViewFull` still carries the hash as a check.
- **Assets:** static files at `/mods/<mod>/…`, served by Vite in dev (from the repo's `mods/`) and copied into `dist/mods/` by `vite build`, so `assetUrl()` has one rule. The static host must carry the same Mods as the server (accepted for MVP).
- The client connects to Nakama directly on `:7350`, with no proxy.

### Dev loop

- `mise run dev` starts compose, runs watchexec on `server/**/*.go` to rebuild the `.so` with pluginbuilder and then `docker compose restart nakama`, and runs Vite with HMR.
- A restart drops in-memory Matches, which is fine in dev. Editing content needs only a Nakama restart.
- Most rule and Battle work runs in plain `go test` against `internal/game`.

### Tests and checks

- **Go:** `go test ./...`, `go vet` and gofmt (no golangci-lint yet).
- **Client:** Vitest (Match store delta application, `MatchConnection` decoding, pending-command settlement), `tsc --noEmit` and Biome.
- **Content:** `halo-mod check mods/base`.
- **Routing:** `testdata/routing/*.json` holds shared Dijkstra cases: Planets, Lanes, owners, player, from and to, then the expected path and total time, or unreachable. Times are integer milliseconds, and ties go to the lowest Planet-id sequence, compared element by element in byte-wise order. A Go table test and a Vitest test both run them, so the two implementations can't drift.
- `mise run check` runs all of the above, plus the gen clean-diff check and a pluginbuilder build of the `.so` to catch version mismatches.
- **No CI for MVP.** A mise-managed `pre-push` hook runs the fast subset: gen diff, `go test`, Vitest, `tsc` and `halo-mod check`. The pluginbuilder build runs manually through `check`.
