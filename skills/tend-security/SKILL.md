---
name: tend-security
disable-model-invocation: true
description: Security scanner for SvelteKit + TS repos — finds and fixes one exploitable issue per run, verified before/after with typecheck, lint, and tests. Use when auditing security, checking for XSS/authz/token leaks, hardening before release, or reviewing auth/session/broadcast code for leakage. Covers core checks (XSS, secrets, authn/authz, CSP) plus opt-in module packs for auth, validation, realtime, data, and feature-flags when active in .claude/tend/config.yaml. Not for style/architecture review or performance work — see tend-refactor or tend-perf for those.
---

# Tend Security — *the Sentinel*

Find the single highest-priority security issue in this repo, fix it minimally, verify, and hand the diff back for review. One issue per run.

## 0. Load config

- Read `.claude/tend/config.yaml`. Use `skills.security` (off-limits globs, `notes`) + the `modules:` list.
- **No config?** Run at **core tier**: core SvelteKit + TS assumptions, no modules, conservative built-in off-limits (never touch lockfiles, CI, `.env`, config). Emit once: "run `tend-onboard` to sharpen." Continue.
- Active modules gate which reference packs load in Phase 2 (progressive disclosure).

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

Establish: active modules (from config), off-limits set (config globs + built-in rails), and the repo's auth/validation entry points.

## 2. Scan — priority order, stop at the first real hit

Core (always): `{@html}`/XSS on user data, hardcoded secrets, missing authz on protected endpoints, secrets in logs/responses, CSP hygiene.

Module checks — **load a module's reference pack only if its module is active**:
- `auth` → [`references/module-auth.md`](references/module-auth.md) — `timingSafeEqual` vs `!==`, token-in-DTO leak, IDOR via pass-through auth, XFF vs CF-Connecting-IP
- `validation` → [`references/module-validation.md`](references/module-validation.md) — missing length-caps/`maxItems`, `LIMIT -1`, amplification
- `realtime` → [`references/module-realtime.md`](references/module-realtime.md) — credential-in-broadcast, amplification
- `data` → [`references/module-data.md`](references/module-data.md)
- `feature-flags` → [`references/module-flags.md`](references/module-flags.md) — UI-gated ≠ backend-gated

Select exactly ONE highest-priority issue. STOP scanning once selected.

## 3. Fix — one atomic change

Answer all three before editing: (1) exact file:line, (2) concrete exploit path, (3) the minimal fix. Can't answer all → skip it, find another (or stop).

- Record baseline: run `typecheck` + `lint` + the affected tests.
- Apply the single change (< 50 lines). Add a code comment at the change site naming the risk.
- Never alter auth/authz logic or public API contracts — **flag** instead.

## 4. Verify & present

- Re-run `typecheck` + `lint` + affected tests. Abort if your change introduces NEW failures (pre-existing ones aren't yours).
- Run `node scripts/validate-finding.mjs` — machine-check the finding (file exists, line matches, evidence present).
- Show the **diff** + a finding block (severity, file:line, exploit, fix, how to verify). **STOP — do not commit.** You review and commit.

## NEVER

- **NEVER commit or open a PR.** Instead: leave the change in the working tree for review. Why: being present is the review gate — the local pivot depends on it.
- **NEVER fix more than one issue per invocation.** Instead: stop after one; invoke again. Why: atomic, reviewable, bisectable — the discipline that kept CI changes safe without the breadth.
- **NEVER report a finding without file:line + exploit path + a fix you can write now.** Instead: skip it. Why: a finding without evidence is noise.
- **NEVER touch config off-limits or the built-in rails** (lockfiles, CI, `.env`, config). Instead: flag it. Why: repo-specific safety lives in config; core tier stays conservative.
- **NEVER load a module's reference pack when its module is inactive.** Instead: honor the config `modules:` list. Why: progressive disclosure keeps context lean and scope correct.

## Files

- `references/scan-core.md` — core checks (loaded Phase 1)
- `references/module-*.md` — per-module checks (loaded only when active)
- `scripts/validate-finding.mjs` — finding validator (shipped only by structured-findings skills: `security`, `refactor`, `tests`)
- `evals/` — `ai-forge-eval` assertions (the quality gate; shipped in every skill dir)
