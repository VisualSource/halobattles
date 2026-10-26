## Project

- Specs: `docs/specs/game-design-spec.md` (rules) and `docs/specs/technical-architecture-spec.md` (architecture).
- Priority: gameplay and data-driven content come before infrastructure. Earlier versions stalled on infra and auth churn before any gameplay existed, and never loaded maps from files.
- Earlier versions are read-only reference: v1 (Node, tRPC, three.js SVG; the only one with a playable loop) at github.com/VisualSource/halobattles, v2 (Nakama Go, lobby only) and v3 (Nakama Go, data structures only). Their archives, `/home/collinb/repos/archive/halobattles.rar` and `halowars.rar`, hold keys (`rsakey.pem`, `nakama/local.yml`): take ideas and code from them, and keep every key and config file out of this repo.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`VisualSource/halobattles`, via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), applied as GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
