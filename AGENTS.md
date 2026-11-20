# Agent Guidelines

## Agent skills

### Issue tracker

GitHub issues (`TranPhucKhanhh/GameOnL1-3Ks`). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.

### CI

For CI failures, inspect `gh run view <id> --log-failed` before downloading `browser-results` artifacts.

### Testing

Test commands, local chain ports (`8545`/`9545`/`5173`), and browser suite scope: see `docs/testing.md`.
