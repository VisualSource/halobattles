# Halo Battles

Needs [mise](https://mise.jdx.dev) and Podman (or Docker: set `CONTAINER=docker`). Works on Linux and Windows. The server `.so` builds and runs in Linux containers either way.

```sh
mise install        # Go, Node, pnpm, flatc, watchexec, docker-compose at pinned versions
mise run setup      # client deps + pre-push hook
mise run dev        # Nakama + Postgres, .so rebuild on Go changes, Vite with HMR
```

Open http://localhost:5173. Other tasks: `mise run test`, `mise run check`, `mise run gen`.

**Windows:** tasks are POSIX shell, so point mise at Git Bash in your global `~/.config/mise/config.toml` (mise ignores this in project files, and won't accept a path with spaces):

```toml
[settings]
windows_default_inline_shell_args = "C:\\PROGRA~1\\Git\\bin\\bash.exe -c"
```

Podman users on Windows need a running machine: `podman machine init && podman machine start`.

Specs live in [docs/specs](docs/specs), terms in [GLOSSARY.md](GLOSSARY.md).
