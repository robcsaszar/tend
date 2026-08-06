---
name: tend-perf
disable-model-invocation: true
description: Performance scanner for SvelteKit + TS repos — finds and fixes one mechanically-provable performance issue per run, verified before/after. Use when auditing for redundant DB calls, O(n²) algorithms, missing debounce/throttle on high-frequency events, or repeated reactive re-traversal. Not for speculative optimization justified by profiling, benchmarks, or intuition rather than static code inspection, and not for accessibility/UX issues (see tend-a11y).
---

# Tend Perf — *the Quickener*

Find the single highest-priority performance issue in this repo, fix it minimally, verify, and hand the diff back for review. Every fix must be **mechanically provable from code inspection alone — no profiling, no benchmarks, no intuition.** One issue per run.

## 0. Load config

- Read `.claude/tend/config.yaml`. Use `skills.perf` (off-limits globs, `notes`) + the `modules:` list.
- **No config?** Run at **core tier**: core SvelteKit + TS assumptions, no modules, conservative built-in off-limits (never touch lockfiles, CI, `.env`, config). Emit once: "run `tend-onboard` to sharpen." Continue.
- Active modules gate which reference packs load in Phase 2 (progressive disclosure). This skill only ever loads `data` and `realtime` — the other three (`auth`, `validation`, `feature-flags`) have no perf-specific pack and are ignored even if active.

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

Establish: active modules (from config), off-limits set (config globs + built-in rails), and this repo's hot paths — high-frequency event handlers (scroll/input/resize/WS/SSE), request handlers, and any loop over a collection that scales with real data (sessions, players, questions).

## 2. Scan — priority order, stop at the first real hit

Core (always): O(n²) algorithms with a clear O(n) alternative; redundant calculations or allocations inside hot loops or per-request middleware; missing debounce/throttle on high-frequency DOM events; repeated `$derived` filters re-traversing the same reactive array; images missing `loading="lazy"` or served uncompressed.

Module checks — **load a module's reference pack only if its module is active**:
- `data` → [`references/module-data.md`](references/module-data.md) — redundant DB calls executing on every request, `getAll()`/large-array deserialization for metadata-only lookups
- `realtime` → [`references/module-realtime.md`](references/module-realtime.md) — missing debounce/throttle specifically on WS/SSE tick handlers

**Once a pattern-class issue is found, check for sibling instances of the same issue before finalizing which one to fix.** A lazy-loading gap, a repeated-`$derived`-filter pattern, or a redundant-query shape rarely lives in only one file — grep for every component/handler sharing the pattern. Still fix only ONE per run: pick the most representative or highest-impact instance, and note in the finding if siblings exist so a future run (or a human) knows they're still open.

Select exactly ONE highest-priority issue. STOP scanning once selected.

## 3. Fix — one atomic change

Answer all three before editing: (1) exact file:line, (2) the concrete mechanism that makes this provably faster or less resource-intensive — stated in one sentence, verifiable by reading the code alone, no profiling/benchmarks/intuition, (3) the minimal fix. Can't answer all → skip it, find another (or stop).

- Record baseline: run `typecheck` + `lint` + the affected tests.
- Apply the single change (< 50 lines). Add a code comment at the change site naming the optimization and why it's faster.
- Preserve existing behavior exactly. Never change a hash/fingerprint/identifier generation algorithm without first checking whether it's stored persistently — **flag** instead if it is.

## 4. Verify & present

- Re-run `typecheck` + `lint` + affected tests. Abort if your change introduces NEW failures (pre-existing ones aren't yours).
- Show the **diff** + a one-sentence provable-improvement claim citing a concrete mechanism ("removes O(n²) loop over game sessions", "eliminates redundant DB query on every SSE heartbeat") — not a vague "improves performance" note. **STOP — do not commit.** You review and commit.

## NEVER

- **NEVER ship a fix whose improvement can't be stated in one sentence citing a concrete mechanism.** Instead: skip it, keep scanning for one you can prove. Why: vague claims ("more efficient", "better performance") aren't falsifiable — this skill's authority rests entirely on provable-from-inspection claims, not measurement.
- **NEVER rely on profiling, benchmarks, or runtime measurement to justify a change.** Instead: the fix must be provable by static inspection alone — algorithmic complexity, call-count, or allocation-count reasoning. Why: this skill runs with no profiler in hand; a fix that "should" be faster but isn't provable from the code is a guess wearing a diff.
- **NEVER change a hash/fingerprint/identifier generation algorithm without first checking whether it's stored persistently.** Instead: grep for the identifier's use in DB lookups/deduplication; if persisted, flag instead of changing it (or ship migration logic alongside the change). Why: a faster hash that changes output for existing stored data breaks every existing lookup and dedup key — silently, and worse than the original slowness.
- **NEVER declare victory on the first instance of a pattern-class issue.** Instead: grep for every file sharing the same pattern before finalizing which one to fix; fix the most representative/highest-impact instance and note remaining siblings in the finding. Why: a fix applied to one of several sibling instances (one image grid out of three sharing the same markup pattern) leaves the rest silently unfixed while looking complete.
- **NEVER touch config off-limits or the built-in rails** (lockfiles, CI, `.env`, config), add/remove a dependency, or commit/open a PR. Instead: flag it; leave the diff in the working tree for review. Why: repo-specific safety lives in config, dependency changes are out of scope for a perf-only pass, and being present in the working tree is the review gate the whole workflow depends on.

## Files

- `references/scan-core.md` — core checks (loaded Phase 1)
- `references/module-*.md` — per-module checks (loaded only when active)
- `evals/` — `ai-forge-eval` assertions (the quality gate; shipped in every skill dir)
