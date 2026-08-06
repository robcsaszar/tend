---
name: tend-refactor
disable-model-invocation: true
description: Refactor scanner for SvelteKit + TS repos — finds and fixes one mechanically-safe cleanup per run across three sub-domains (dead code/duplication removal, type-safety tightening, component extraction), verified before/after. Use when removing deprecated or duplicated code, tightening a weak `any` type, or extracting repeated markup into a reusable component. Not for behavior changes, new features, auth/business-logic rewrites, or a speculative abstraction not backed by 2+ real duplicated instances.
---

# Tend Refactor — *the Wright*

Find the single highest-priority refactor opportunity in this repo, fix it minimally, verify, and hand the diff back for review. Every fix must be **mechanically provable — grep evidence of duplication, an existing type inferred from context, or 2+ verified markup instances — never a guess dressed up as cleanup.** One issue per run.

## 0. Load config

- Read `.claude/tend/config.yaml`. Use `skills.refactor` (off-limits globs, `notes`) + the `modules:` list.
- **No config?** Run at **core tier**: core SvelteKit + TS assumptions, no modules, conservative built-in off-limits (never touch lockfiles, CI, `.env`, config). Emit once: "run `tend-onboard` to sharpen." Continue.
- Active modules gate which reference packs load in Phase 2 (progressive disclosure). This skill only ever loads `data`, `validation`, and `feature-flags` — the other two (`auth`, `realtime`) have no refactor-specific pack and are ignored even if active.

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

Establish: active modules (from config), off-limits set (config globs + built-in rails), this repo's domain/business-logic core (whatever `skills.refactor.off-limits` names, plus obvious candidates like a game/simulation engine, payment logic, or auth internals), and this repo's existing component-directory and type conventions — both are needed before tiers B and C can be evaluated honestly.

## 2. Scan — priority order, stop at the first real hit

Three sub-domains, safest tier first (full method, worked examples, and the extraction-safety checklist live in `references/scan-core.md`):

**A. Dead code & duplication removal (always).** `@deprecated` exports with no remaining callers, lint-flagged dead code, a duplicated inline pattern across 2+ files, consumers of a superseded helper. Scope: utility/component/helper directories, API-route call-site migration only (never new routes or logic) — **never the domain/business-logic core**, only utility and presentation layers; a repo names its own core paths to protect in `skills.refactor.off-limits`.

Module checks — **load a module's reference pack only if its module is active** (all three are dead-code/duplication flavors of tier A, not separate tiers):
- `data` → [`references/module-data.md`](references/module-data.md) — repeated DB-init boilerplate consolidated into shared middleware/locals init
- `validation` → [`references/module-validation.md`](references/module-validation.md) — duplicated validation/schema-transform pipelines consolidated into one reusable piece
- `feature-flags` → [`references/module-flags.md`](references/module-flags.md) — dead code stranded behind a fully-rolled-out or abandoned flag

**B. Type-safety tightening** (only if A found no real candidate). One `any`/type-weakness per run — see `references/scan-core.md` §2 for the hit-list method and the mechanical-fix bar ("if no existing type fits cleanly, it is NOT a mechanical fix — skip it").

**C. Component/markup extraction** (only if A and B found nothing — highest risk, most caveats). One repeated-markup extraction per run — see `references/scan-core.md` §3 for candidate criteria and the extraction-safety checklist (verify-every-instance, prop-spreading, CSS-scoping, icon-directory hotspot).

Select exactly ONE highest-priority issue, from whichever tier yields a real candidate first. STOP scanning once selected.

## 3. Fix — one atomic change

Answer all three before editing — the proof standard is kind-specific:

- **dead-code-removal:** (1) exact file:line, (2) grep evidence of duplication/deprecation — 2+ call sites minimum, (3) the minimal fix.
- **type-tightening:** (1) exact file:line, (2) the existing type/interface reused, or why the shape is unambiguous from context with no guessing — confirmed by the project's typecheck passing, (3) the minimal fix.
- **component-extraction:** (1) file:line for every verified instance (2+, all actually read — not a sample), (2) what varies between them (the props) vs. what's structurally identical, (3) the new component plus the replacement diff.

Can't answer all three for the tier you're in → skip it, find another candidate (or drop to the next tier, or stop).

- Record baseline: run `typecheck` + `lint` + the affected tests.
- Apply the single change (< 50 lines for dead-code-removal and type-tightening; extraction may span the new component file plus its replaced call sites, but stays one extraction). Add a code comment at the change site naming the change kind — for a new component file, the file's own existence documents it; no comment needed there.
- Type-tightening changes are type-only — never alter runtime behavior. Extraction must not alter visual output or behavior of any page. Neither kind touches test files. Never alter auth/authz logic or a public API contract — **flag** instead.

## 4. Verify & present

- Re-run `typecheck` + `lint` + affected tests. Abort if your change introduces NEW failures (pre-existing ones aren't yours).
- Run `node scripts/validate-finding.mjs` — machine-check the finding (file(s) exist, line(s) match, evidence present, instance count enforced for `component-extraction`).
- Show the **diff** + a finding block (kind, file:line, evidence, fix, how to verify). **STOP — do not commit.** You review and commit.

## NEVER

- **NEVER fix more than one issue per invocation, across any of the three sub-domains.** Instead: stop after one; invoke again. Why: atomic, reviewable, bisectable — the discipline that keeps a 3-domain skill from becoming a silent batch job.
- **NEVER touch the domain/business-logic core** — restrict changes to utility, presentation, and API-route call-site layers. Instead: flag it; let `skills.refactor.off-limits` name this repo's actual core-logic paths to protect. Why: refactor's blast radius must stay in low-risk layers regardless of what a given repo calls its core.
- **NEVER change runtime behavior in a type-tightening fix, or touch a test file for a dead-code or type fix.** Instead: type fixes are type-only, in source only; if a change requires touching logic to make types line up, it isn't mechanical — skip it. Why: Phase 3's proof standard for type-tightening rests entirely on "no behavior changed," and test coverage is a different skill's job.
- **NEVER extract a component based on a sample of instances — verify every single instance, not just the first few.** Instead: read every candidate call site's actual content before assuming uniformity. Why: a pattern that looks identical across 3 call sites can break on a 4th with different slot content, a conditional element, or an extra attribute — generalizing early is how a "safe" extraction ships a silent regression.
- **NEVER merge visually-similar markup into one shared base without checking for prop-spreading, per-instance attribute overrides, or scoped-style risk.** Instead: when a `{...props}` spread, a non-uniform attribute, or a non-trivial `<style>` block targeting descendant selectors is present and you're not certain extraction is safe, leave it unmigrated. Why: these are exactly the failure modes that look clean on a static read and only break once rendered.
- **NEVER extract with only one call site, wrap a single element with no added value, or add a prop for a variation that isn't actually present in the duplicated markup.** Instead: skip it; a real candidate needs 2+ instances, 3+ meaningful elements, and props limited to what genuinely varies. Why: an extraction that fails these bars adds an abstraction that cost more than the duplication it removed.
- **NEVER touch config off-limits or the built-in rails** (lockfiles, CI, `.env`, config), add/remove a dependency, or commit/open a PR. Instead: flag it; leave the diff in the working tree for review. Why: repo-specific safety lives in config, dependency changes are out of scope for a refactor-only pass, and being present in the working tree is the review gate the whole workflow depends on.

## Files

- `references/scan-core.md` — core checks for all three sub-domains, priority order and its rationale (loaded Phase 1)
- `references/module-*.md` — per-module checks, each a flavor of the dead-code/duplication tier (loaded only when active)
- `scripts/validate-finding.mjs` — finding validator, kind-aware (`dead-code-removal` / `type-tightening` / `component-extraction`)
- `evals/` — `ai-forge-eval` assertions (the quality gate; shipped in every skill dir)
