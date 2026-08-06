---
name: tend-onboard
disable-model-invocation: true
description: Detects a SvelteKit + TS repo's stack and writes .claude/tend/config.yaml so the other tend-* skills run at full precision instead of conservative core-tier defaults. Optionally installs the unattended sweep workflow (opt-in, cadence chosen by the user). Use once when installing tend into a repo, or after a major dependency/stack change. Not for day-to-day scanning — see tend-security/perf/refactor/a11y/tests for that.
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

## Phase 4 — Offer unattended mode

Ask the user once (same one-question posture as Phase 2 — never assume, never install silently):

> "Want scheduled tend runs? (a) GitHub Action — I'll install a workflow that runs one skill per scheduled day and opens a PR per fix / (r) Claude cloud Routine — I'll print setup steps / (n) no, keep everything manual [default]"

Skipped, unanswered, or (n): do nothing — manual invocation stays the whole story, and this phase can be revisited by re-running onboarding.

**(a) GitHub Action.** Ask for the cadence: default `Mon/Wed/Fri 06:00 UTC` (`0 6 * * 1,3,5`), or `weekdays daily` (`0 6 * * 1-5`), or `weekly` (`0 6 * * 1`), or a raw 5-field cron the user supplies. Copy [`assets/tend-sweep.yml`](assets/tend-sweep.yml) to `.github/workflows/tend-sweep.yml`, replacing the cron on the line marked `# tend-onboard: cadence` with the chosen one. Do not edit the template asset itself, and do not modify any other line of the copy. Then tell the user the remaining manual steps: add an `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) repo secret, optionally set a `TEND_PR_CAP` repo variable (default 2), and commit the workflow file themselves — onboarding never commits.

The workflow is an external wrapper, not a change to any skill: it invokes one skill per run as a user-level slash command, the skill still stops at the diff, and a deterministic steward step (not the skill, not a model) commits and opens the PR. Backpressure is built in: rotation advances past the most recent tend PR, an open-PR cap skips runs before Claude ever starts, and a human merges everything.

**(r) Claude cloud Routine.** Print these steps — this skill cannot create Routines itself:

1. Create a Claude Code cloud session attached to this repo, with push access.
2. From it, create a Routine on the chosen cron, fresh session per fire.
3. The Routine prompt cannot be `/tend-<skill>` directly (scheduled prompts cannot invoke `disable-model-invocation` skills). It must mirror the wrapper semantics instead: check `gh pr list --label tend --state open` and stop at the cap; pick the next skill in the cycle (security → perf → refactor → a11y → tests) after the most recent tend PR; read that skill's `SKILL.md` and execute its phases exactly as written, honoring its NEVER rules during execution; only if a diff remains, then — as the wrapper, outside the skill — branch `tend/<skill>-<date>`, commit, push, and open a PR labeled `tend` whose body is the skill's finding block.

**Re-run behavior.** If `.github/workflows/tend-sweep.yml` already exists, don't re-ask from scratch: show its current cadence next to the shipped template's, mention anything else that differs, and confirm before touching the file — same posture as the config re-run rule above.

## Phase 5 — Report

Show the written config. Tell the user which skills are now sharpened (module-aware) versus still running core-tier (no modules detected — this is a valid, common outcome, not a failure). State whether unattended mode is installed, and at what cadence, or that everything stays manual.

## NEVER

- **NEVER auto-activate a pattern-only module (`auth`, `feature-flags`) without a clear code signature.** Instead: ask once per ambiguous module. Why: a false-positive activation makes downstream skills load an irrelevant reference pack and produce module-flavored findings that don't apply to this repo.
- **NEVER invent `notes:` content.** Instead: leave `notes:` empty unless the user explicitly provides source material to seed from. Why: fabricated "learnings" look authoritative in config and will be trusted uncritically by every skill that reads them.
- **NEVER overwrite an existing `.claude/tend/config.yaml` without confirming.** Instead: if one exists, show the diff between old and proposed new, and ask before replacing — a re-run after a stack change should merge/update, not blindly clobber hand-edited `off-limits`/`notes` entries.
- **NEVER skip the validator after writing.** Instead: always run `scripts/validate-config.mjs` and fix errors before reporting success. Why: every other tend skill's Phase 0 trusts this file's shape without re-checking it.
- **NEVER install the sweep workflow without an explicit yes, and never commit it.** Instead: write `.github/workflows/tend-sweep.yml` only on an explicit (a) answer, and leave committing it to the user. Why: unattended runs are the one thing this pack must never opt anyone into silently — the 84-PR backlog it replaced started exactly that way.
- **NEVER put `tend-onboard` or `tend-docs` into unattended rotation.** Instead: keep the sweep's rotation to the 5 scanners; `docs` is dispatch-only in the template and `onboard` is absent entirely. Why: onboarding asks the user questions (impossible headless), and tend-docs is dogfood-tuned rather than broadly applicable.

## Files

- `references/module-signals.md` — dependency + code-signature detection rules for all 5 modules (loaded Phase 1)
- `references/config-schema.md` — the exact `config.yaml` shape (loaded Phase 3)
- `scripts/validate-config.mjs` — structural validator for the constrained YAML subset this schema uses
- `assets/tend-sweep.yml` — the unattended-mode GitHub Actions workflow template (copied, cadence-adjusted, in Phase 4)
