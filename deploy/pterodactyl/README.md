# Deploying on Pterodactyl

The primary way to run the halobattles server. The image is Nakama 3.41.0 with the game's plugin and the base Mod baked in; the egg runs it under Wings. Background: [docs/research/pterodactyl-hosting.md](../../docs/research/pterodactyl-hosting.md).

| File | What it is |
|---|---|
| `Dockerfile` | Builds the plugin with the matching pluginbuilder, then the server image |
| `entrypoint.sh` | Migrates the database, then starts Nakama from the egg's variables |
| `egg-halobattles.json` | The egg to import into the panel |
| `smoke.sh` | Runs the image the way Wings does and checks it |

## Build and check the image

From the repo root:

```bash
mise run image         # builds localhost/halobattles:dev
mise run image:smoke   # runs it like Wings and checks port, keys, content and shutdown
```

The smoke test runs the container with a read-only root, as uid 988, with no capabilities, only `/home/container` and `/tmp` writable, on port 8350, against a throwaway Postgres. It fails if Nakama ignores the keys it was given.

Push it where the panel's nodes can pull it; the egg expects `docker.io/visualsource/halobattles:latest`:

```bash
podman tag localhost/halobattles:dev docker.io/visualsource/halobattles:latest
podman push docker.io/visualsource/halobattles:latest
```

## Set up the servers

1. **Database.** Create a server on the community Postgres 16 egg ([parkervcp/eggs](https://github.com/parkervcp/eggs/tree/master/database/sql/postgres)) and make a `nakama` database and user. The panel's Database Hosts feature is MySQL only and won't do.
2. **Egg.** Import `egg-halobattles.json` under a nest (Admin → Nests → Import Egg).
3. **Server.** Create a server on the egg. Its primary allocation is the port Caddy proxies to (see below); only Caddy needs to reach it. Fill in the variables:
   - `DB_ADDRESS`: `user:password@node-ip:port/nakama`, pointing at the database server's allocation.
   - `SERVER_KEY`: what the client is built with (`VITE_NAKAMA_SERVER_KEY`).
   - The session, refresh, HTTP and console signing keys: long random strings, each different, e.g. `openssl rand -hex 32`.
   - `CONSOLE_PASSWORD`: at least 12 characters.
   - `CONSOLE_PORT`: leave empty to keep the admin console private; to reach it, add a second allocation and enter its port.
4. **Start it.** The panel marks it running when Nakama logs `Startup done`; Stop sends `^C` and Nakama shuts down cleanly.

## Adding Mods

No rebuild needed. The image looks for Mods on `HALO_MODS_DIR`, `/nakama/mods:/home/container/mods`, in that order:

1. Upload the Mod over SFTP into the server's `mods/` folder, as a folder named after it (its `mod.jsonc` `name`).
2. Add it to the **Mods** variable, after `base`: `base,my-mod`.
3. Restart. Every Match starts over, as on any restart.

The image's own Mods are found first, so an upload can't replace `base`. If a Mod is in no folder, or its content is broken, the server doesn't start and its log says why; check Mods with `halo-mod check` before uploading. Content reaches the client through the server, so a content-only Mod needs nothing more. A Mod with assets also needs them on the client's static host, under `/mods/<name>/`.

## Caddy and the client

Caddy, already in front of the panel, terminates TLS and puts the game on one domain. It serves the built client and proxies Nakama's paths to the game server's allocation, WebSockets included. The game port then doesn't need to be public.

```caddyfile
battles.example.com {
	# Nakama: the HTTP API, the realtime socket, and its healthcheck.
	@nakama path /v2/* /ws /healthcheck
	reverse_proxy @nakama <node-ip>:<primary-allocation-port>

	# The client: a single-page app, so unknown paths get index.html.
	root * /srv/halobattles/client
	try_files {path} /index.html
	file_server
}
```

Build the client for that domain and copy `client/dist/` to the `root`:

```bash
VITE_NAKAMA_HOST=battles.example.com VITE_NAKAMA_PORT=443 VITE_NAKAMA_SSL=true VITE_NAKAMA_SERVER_KEY=<the egg's SERVER_KEY> pnpm -C client build
```

These are fixed at build time, so changing the domain or the server key means rebuilding the client. The client's Mod assets (`/mods/…`, copied into `dist/` by the build) must match the Mods in the image.

To reach the admin console, give the server a second allocation, set `CONSOLE_PORT` to it, and add another site, e.g. `console.battles.example.com { reverse_proxy <node-ip>:<console-port> }`.

## Things to know

- **Restarts end every Match.** Match state is in memory; Postgres keeps only accounts.
- **Upgrading Nakama** means bumping, together: both image tags in the `Dockerfile`, Go in `server/go.mod` and `mise.toml`, and `nakama-common`.
- **TLS** is Caddy's job (above). Nakama's own SSL flags aren't meant for production.
- **Hidden variables** are hidden from the server's owner in the panel, not from the node: anyone with Wings or Docker access on it can read them.
