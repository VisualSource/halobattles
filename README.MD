# Halo Battles

Needs [mise](https://mise.jdx.dev) and Docker. The server `.so` builds and runs in Linux containers only; on Windows, tasks run in Git Bash.

```sh
mise install        # Go, Node, pnpm, flatc, watchexec at pinned versions
mise run setup      # client deps + pre-push hook
mise run dev        # Nakama + Postgres, plugin rebuild on Go changes, Vite with HMR
```

Open http://localhost:5173. Other tasks: `mise run test`, `mise run check`, `mise run gen`.

Specs live in [docs/specs](docs/specs), terms in [GLOSSARY.md](GLOSSARY.md).
