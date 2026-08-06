---
name: tend-onboard
disable-model-invocation: true
description: Detects a SvelteKit + TS repo's stack and writes .claude/tend/config.yaml so the other tend-* skills run at full precision instead of conservative core-tier defaults. Use once when installing tend into a repo, or after a major dependency/stack change. Not for day-to-day scanning — see tend-security/perf/refactor/a11y/tests for that.
---

# Tend Onboard — *the installer*

Detect this repo's stack, determine which capability modules apply, and write `.claude/tend/config.yaml` so the other `tend-*` skills stop running at conservative core-tier defaults. Runs once per install (or after a stack change) — not a scanning skill itself.

## Phase 1 — Investigate

Spawn a single Explore-subagent investigation of the repo (the same shape as `do-security-audit`'s Phase 1 stack triage, but broader): read `package.json`, lockfile, config files (`svelte.config.js`, `vite.config.ts`, `biome.json`, `.env.example`), and grep for code signatures. The subagent should report back, not act — it makes no edits.

MANDATORY READ [`references/module-signals.md`](references/module-signals.md) before spawning — the exact dependency and code-signature signals for each of the 5 capability modules.

Ask the subagent to report:
1. Core stack confirmation (SvelteKit + Svelte 5 + TS strict + Biome + Vitest + pnpm) — flag anything missing or different; a missing core piece means core-tier tend skills will need to fall back further than usual.
2. Which of the 5 modules apply, with evidence (dependency name + version, or file:line for pattern-only signatures).
3. Repo-knowledge seeds: existing off-limits conventions (generated files, vendored code, lockfiles), any naming pattern for "superseded" or "@deprecated" helpers, any existing feature-flag or auth-token module names worth recording.

## Phase 2 — Resolve ambiguity

Dependency-detectable modules (`data`, `validation`, `realtime`) auto-activate on a confirmed dependency — no confirmation needed.

Pattern-only modules (`auth`, `feature-flags`) auto-activate only when the subagent found a clear code signature (a local token-signing function, a feature-flag constants module). If the signal is weak or absent, do not guess — ask the user once: "Does this repo have [auth / feature flags]? (y)es, activate manually / (n)o, skip." Never silently activate a pattern-only module on inference alone.

## Phase 3 — Write config

Write `.claude/tend/config.yaml` following [`references/config-schema.md`](references/config-schema.md) exactly — the other 6 skills' Phase 0 parses this file assuming that exact shape; do not freelance the structure.

- `modules:` — the resolved list from Phase 2.
- `skills.<name>.off-limits` — start empty unless Phase 1 found an existing convention worth encoding (e.g., a generated-file glob).
- `skills.<name>.notes` — leave empty on first install. If the user has existing operational-learnings docs (journal files, a wiki, postmortems) they want seeded in, ask once whether to import any; never invent notes from nothing.

Run `node scripts/validate-config.mjs .claude/tend/config.yaml` after writing. Fix any reported errors before finishing — a malformed config is worse than no config, because the other skills trust its shape without re-validating.

## Phase 4 — Report

Show the written config. Tell the user which skills are now sharpened (module-aware) versus still running core-tier (no modules detected — this is a valid, common outcome, not a failure).

## NEVER

- **NEVER auto-activate a pattern-only module (`auth`, `feature-flags`) without a clear code signature.** Instead: ask once per ambiguous module. Why: a false-positive activation makes downstream skills load an irrelevant reference pack and produce module-flavored findings that don't apply to this repo.
- **NEVER invent `notes:` content.** Instead: leave `notes:` empty unless the user explicitly provides source material to seed from. Why: fabricated "learnings" look authoritative in config and will be trusted uncritically by every skill that reads them.
- **NEVER overwrite an existing `.claude/tend/config.yaml` without confirming.** Instead: if one exists, show the diff between old and proposed new, and ask before replacing — a re-run after a stack change should merge/update, not blindly clobber hand-edited `off-limits`/`notes` entries.
- **NEVER skip the validator after writing.** Instead: always run `scripts/validate-config.mjs` and fix errors before reporting success. Why: every other tend skill's Phase 0 trusts this file's shape without re-checking it.

## Files

- `references/module-signals.md` — dependency + code-signature detection rules for all 5 modules (loaded Phase 1)
- `references/config-schema.md` — the exact `config.yaml` shape (loaded Phase 3)
- `scripts/validate-config.mjs` — structural validator for the constrained YAML subset this schema uses
