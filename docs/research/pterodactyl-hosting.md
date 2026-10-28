# Hosting the halobattles server on Pterodactyl

Researched 2026-10-26. Status: **built** on 2026-10-28; see [deploy/pterodactyl/](../../deploy/pterodactyl/README.md). Building it settled these:

- **Fixed in the build:** the sketch's `--logger.stdout true` ended Nakama's flag parsing at `true`, so every flag after it, keys included, was silently dropped and the stock keys were used. A bool needs `--logger.stdout=true`.
- **Verified** under Wings' constraints:
  - Nakama runs with a read-only root, as an arbitrary uid, writing nothing outside `/home/container`;
  - `useradd` works on bookworm-slim;
  - JSON log lines carry `Startup done`, so Wings sees it;
  - SIGINT shuts down cleanly with exit 0.
- **Changed:** the entrypoint builds Nakama's command from the egg's variables instead of evaluating the startup line, so keys aren't shell-evaluated or echoed. The install script does nothing: flags replace the YAML file.

## Verdict

**It can be done.** No stock egg or yolk fits, so three things have to be built:

1. **A custom image** built `FROM heroiclabs/nakama:3.41.0`, with `halobattles.so` and `mods/` baked in.
2. **A small egg.**
   - The primary allocation becomes `socket.port`.
   - An optional second allocation becomes `console.port`.
   - Keys and the database address are egg variables.
3. **A Postgres database somewhere else.** The recommended option is a second Pterodactyl server running the community Postgres 16 egg. The panel's built-in "Database Hosts" feature can't be used: it only supports MySQL, and Nakama needs a Postgres wire-compatible database.

There is no hard blocker. The real constraints are:
- Wings' read-only root filesystem.
- The `.so` toolchain must match the Nakama version exactly.
- The browser client needs the public host and port when it is built.

## How the server runs today

- **Local setup.** docker-compose runs `heroiclabs/nakama:3.41.0` plus `postgres:16`. The entrypoint runs `nakama migrate up`, then `exec nakama --config /nakama/data/local.yml`. Ports 7349, 7350 and 7351 are published. ([deploy/compose.yml](../../deploy/compose.yml))
- **Mounts.** Three things are mounted into the container:
  - `deploy/local.yml` is mounted at `/nakama/data/local.yml`. It holds the stock dev keys and `match.label_update_interval_ms: 200`. ([deploy/local.yml](../../deploy/local.yml))
  - `server/build` is mounted at `/nakama/data/modules`.
  - `mods/` is mounted at `/nakama/data/mods`, read-only.
- **Mod settings.** The plugin reads `HALO_MODS` and `HALO_MODS_DIR` with `os.Getenv`. If either is missing, or the content is invalid, it returns an error and Nakama refuses to start. Plain container env vars are enough here, which suits egg variables. ([deploy/runtime.env](../../deploy/runtime.env), [server/internal/nakama/nakama.go:19-36](../../server/internal/nakama/nakama.go))
- **Plugin build.** The plugin is built with `heroiclabs/nakama-pluginbuilder:3.41.0` using `-buildmode=plugin -trimpath -mod=vendor`. The repo pins Go `1.27.1` and `nakama-common v1.48.0`. ([mise.toml](../../mise.toml), [server/go.mod](../../server/go.mod))
- **Upstream images.**
  - Upstream builds Nakama 3.41.0 and the pluginbuilder on `golang:1.27.1-bookworm`.
  - The runtime image is `debian:bookworm-slim` with `ENTRYPOINT ["tini","--","/nakama/nakama"]`.
  - Sources: [nakama build/Dockerfile@v3.41.0](https://github.com/heroiclabs/nakama/blob/v3.41.0/build/Dockerfile), [pluginbuilder Dockerfile@v3.41.0](https://github.com/heroiclabs/nakama/blob/v3.41.0/build/pluginbuilder/Dockerfile).
- **Version pairing.** A plugin must be built with the same Go version as the Nakama binary, and Nakama 3.41.0 pairs with nakama-common 1.48.0. ([Go runtime docs](https://heroiclabs.com/docs/nakama/server-framework/go-runtime/))
- **What survives a restart.** Postgres holds accounts only. Match state is in memory, so a restart loses every Match. ([technical-architecture-spec.md](../specs/technical-architecture-spec.md))
- **Client connection.** The client connects straight to `:7350`. `VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_SSL` and `VITE_NAKAMA_SERVER_KEY` are fixed at build time. Mod assets come from the static client host. ([client/src/config.ts](../../client/src/config.ts))

## How the Talos egg is built

Source: `VisualSource/Talos`, files `egg-talos.json` and `apps/talos/Dockerfile`.

- **Format:** `PTDL_v2`, exported from the panel.
- **Image:** one entry, `docker.io/visualsource/talos:latest`.
- **Startup:** `/home/container/talos`. This setting has no effect, because Wings doesn't override the entrypoint, so the image's `ENTRYPOINT ["./talos"]` runs instead.
- **Config:**
  - `files: {}`
  - `startup.done: "Client ready:"`
  - `stop: "^C"`
  - a custom log file
- **Install script:** none.
- **Variables:** about 12 plain env vars, with Laravel validation rules such as `required|string|in:…`.
- **Image pattern:**
  - A multi-stage build that leaves the app outside `/home/container`.
  - `adduser … --home /home/container container`
  - `USER container`
  - `ENV USER=container HOME=/home/container`

The halobattles image can follow the same pattern.

## Pterodactyl constraints

- **Image rules.** The image needs a `container` user with home `/home/container`, `WORKDIR /home/container`, and an entrypoint that expands `{{VAR}}` in `$STARTUP` and runs it. ([creating_a_custom_image.md](https://github.com/pterodactyl/documentation/blob/master/community/config/eggs/creating_a_custom_image.md))
- **No shell operators in startup.** The yolks entrypoint ends in `exec env ${PARSED}`, so `migrate && start` can't go in the startup line. ([yolks entrypoint.sh](https://github.com/pterodactyl/yolks/blob/master/oses/debian/entrypoint.sh))
- **How Wings creates the container** ([wings container.go](https://github.com/pterodactyl/wings/blob/develop/environment/docker/container.go)):
  - No Cmd or Entrypoint override.
  - It runs as the Wings uid:gid.
  - `ReadonlyRootfs: true`. Only `/home/container` and a `/tmp` tmpfs are writable.
  - `no-new-privileges`, and capabilities are dropped.
  - Docker `HEALTHCHECK` doesn't matter. Wings decides a server is up only from the `done` log line.
- **Ports.** Each allocation binds host port = container port, TCP and UDP, so Nakama must listen on the real allocated port. Only `SERVER_PORT` (the primary allocation) is a default variable. ([wings allocations.go](https://github.com/pterodactyl/wings/blob/develop/environment/allocations.go), [creating_a_custom_egg.md](https://github.com/pterodactyl/documentation/blob/master/community/config/eggs/creating_a_custom_egg.md))
- **Egg features.**
  - YAML config-file rewriting with `{{server.build.default.port}}` and `{{env.X}}`.
  - A `done` string, and `stop: ^C`.
  - Hidden variables are still readable from the environment, so they are not secret from the server owner.
- **One container per server.** There is no compose and no sidecar. Mounts are only for host paths an admin has allow-listed. ([mounts.md](https://github.com/pterodactyl/documentation/blob/master/guides/mounts.md))

## Proposed image and egg (untested sketch)

### Image: `deploy/pterodactyl/Dockerfile`

```dockerfile
FROM docker.io/heroiclabs/nakama-pluginbuilder:3.41.0 AS so
WORKDIR /builder
COPY server/ .
RUN go mod vendor && go build -buildmode=plugin -trimpath -mod=vendor -o /out/halobattles.so .

FROM docker.io/heroiclabs/nakama:3.41.0
# Outside /home/container: the server volume is mounted over it at runtime.
COPY --from=so /out/halobattles.so /nakama/modules/halobattles.so
COPY mods/ /nakama/mods/
COPY deploy/pterodactyl/entrypoint.sh /entrypoint.sh
# a+rX: Wings runs the container under its own uid.
RUN chmod -R a+rX /nakama /entrypoint.sh \
 && useradd -m -d /home/container container
USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container
ENTRYPOINT ["tini", "--", "/bin/bash", "/entrypoint.sh"]
```

```bash
#!/bin/bash
# entrypoint.sh: migrate, then hand off to the egg's STARTUP
cd /home/container || exit 1
/nakama/nakama migrate up --database.address "$DB_ADDRESS" || exit 1
PARSED=$(echo "${STARTUP}" | sed -e 's/{{/${/g' -e 's/}}/}/g' | eval echo "$(cat -)")
echo "container@pterodactyl~ $PARSED"
exec env ${PARSED}
```

`go mod vendor` needs network access during the build. The other option is to copy in a `vendor/` folder produced by `mise run vendor`.

### Egg

- **Startup:**
  ```
  /nakama/nakama --config /home/container/halobattles.yml --database.address {{DB_ADDRESS}} --socket.port {{SERVER_PORT}} --socket.server_key {{SERVER_KEY}} --console.port {{CONSOLE_PORT}} --runtime.path /nakama/modules --data_dir /home/container/data --logger.stdout true
  ```
- **`done`:** `"Startup done"`. ([main.go@v3.41.0](https://github.com/heroiclabs/nakama/blob/v3.41.0/main.go))
- **`stop`:** `^C`. Nakama traps SIGINT and SIGTERM.
- **`files`:** `{}`. Command-line flags do the work, so there is no YAML to rewrite.
- **Install script:** writes `/mnt/server/halobattles.yml` with the non-secret parts of `local.yml` (`name`, `match.label_update_interval_ms: 200`).

| Variable | Default | Notes |
|---|---|---|
| `DB_ADDRESS` | (none) | `user:pass@host:5432/nakama`. Required, hidden. |
| `SERVER_KEY` | (none) | Must match the client's `VITE_NAKAMA_SERVER_KEY` |
| `CONSOLE_PORT` | (none) | Admin types in the second allocation's port number |
| `NAKAMA_CONSOLE_USERNAME` / `_PASSWORD` / `_SIGNING_KEY` | (none) | Feed the `--console.*` flags |
| `SESSION_ENCRYPTION_KEY`, `SESSION_REFRESH_ENCRYPTION_KEY`, `RUNTIME_HTTP_KEY` | (none) | Feed the `--session.*` flags and `--runtime.http_key` |
| `HALO_MODS` | `base` | Read by the plugin |
| `HALO_MODS_DIR` | `/nakama/mods` | Not editable |

**Allocations:**
- **Primary:** the HTTP and WebSocket API, which the client needs.
- **gRPC:** binds to `socket.port - 1`. The gateway reaches it over loopback, so it needs no allocation. ([api.go@v3.41.0](https://github.com/heroiclabs/nakama/blob/v3.41.0/server/api.go))
- **Console:** an optional second allocation. Leave it unallocated to keep the console private.

## Database options

1. **A separate Pterodactyl server running the parkervcp Postgres 16 egg (recommended).** Image `ghcr.io/parkervcp/yolks:postgres_16`. Nakama reaches it at the node IP and its allocated port. ([parkervcp/eggs postgres](https://github.com/parkervcp/eggs/tree/master/database/sql/postgres))
2. **An external managed Postgres or CockroachDB.** Nakama requires "CockroachDB or another Postgres wire-compatible server". ([nakama README](https://github.com/heroiclabs/nakama/blob/master/README.md), [configuration](https://heroiclabs.com/docs/nakama/getting-started/configuration/))
3. **The panel's Database Hosts feature: not usable.** It creates databases with MySQL-dialect SQL, and Pelican hardcodes `'driver' => 'mysql'`. Nakama has no MySQL support. ([panel DatabaseRepository.php](https://github.com/pterodactyl/panel/blob/1.0-develop/app/Repositories/Eloquent/DatabaseRepository.php), [pelican DatabaseHost.php](https://github.com/pelican-dev/panel/blob/main/app/Models/DatabaseHost.php))

## Risks and open questions

- **Version lockstep.** These must change together on every Nakama upgrade: the image tag, the pluginbuilder tag, `go` in `go.mod`, Go in `mise.toml`, and `nakama-common`. Building the `.so` inside the image's multi-stage build keeps them consistent.
- **The client is built for one server.** Host, port, SSL and key are baked in at build time. A Pterodactyl-assigned port therefore needs either a client rebuild or a reverse proxy.
- **TLS.** Nakama's own SSL flags are "NOT recommended for production". Expect a TLS-terminating proxy outside Pterodactyl for `wss://`.
- **Mods in two places.** The static asset host and the image must carry the same mods. *Done:* `HALO_MODS_DIR` is now a search path, so the image finds its own Mods and then any uploaded to the server's `mods/` folder over SFTP; only Mods with assets also need the static host.
- **Restarts end Matches.** A restart or reinstall ends every in-memory Match.
- **Not verified:**
  - Whether Nakama writes anything outside `data_dir` under a read-only rootfs.
  - Whether `useradd` works on bookworm-slim as written.
  - Whether an extra allocation's port can be referenced automatically. No default variable was found for it, hence the manual `CONSOLE_PORT`.
  - Whether Nakama's TTY output disturbs Wings' log parsing.
  - The `docs.pterodactyl.io` pages returned 404, so the docs were read from their GitHub source instead.
