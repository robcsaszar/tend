---
name: tend-docs
disable-model-invocation: true
description: "Bidirectional documentation-drift auditor for repos that keep an explicit docs-vs-code reference convention. Use for periodic doc-drift audits — when a reference doc may list entries with no matching code artifact or omit artifacts that exist, when an API-contract collection (Bruno, Postman, OpenAPI, or similar) may disagree with real endpoints and their request/response schemas, or when several docs describing the same flow may contradict each other or a named ground-truth source file. Fixes one drift per run. Not for writing new documentation from scratch, general prose/style editing (see the writing skill), or repos with no doc-reference convention to check against."
---

# Tend Docs — *the loremaster*

> **Dogfood-only.** This skill assumes the repo already has an explicit doc-reference convention to audit against — a components/API reference doc, an API-contract/collection directory, or paired flow docs describing the same feature from different angles. It's shipped in this pack because it's genuinely useful once a repo has grown that convention, but it's less broadly applicable out of the box than the other `tend-*` skills — there may be nothing for it to check on a fresh repo.

Find the single highest-priority drift between documentation and real code — a stale doc entry, an undocumented artifact, or an API-contract mismatch — fix it minimally, verify against the ground-truth source, hand back the diff for review. One drift per run.

## 0. Load config

- Read `.claude/tend/config.yaml` if present. Per the config schema, `tend-docs` has **no `skills.docs` entry** — there is nothing repo-specific to read from `skills.*`. Off-limits are entirely built-in for this skill: the docs tree (and an API-contract directory, if one exists) are the only safe write targets; source/logic directories are **never** touched, regardless of config presence or content. This skill has no capability modules — skip module-gating entirely.
- **No config file at all changes nothing here** — this skill already runs at a fixed, conservative tier by design, not as a fallback.

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

- Identify the reference doc(s) that claim to be a source of truth for some set of code artifacts (e.g. a components/API reference file).
- Identify the real code artifacts to diff against — glob actual files/exports, recursing into subdirectories (the most common blind spot).
- Identify whether the repo has an API-contract/collection format (Bruno `.bru`, a Postman collection, an OpenAPI spec, an Insomnia export, etc.) alongside real route/endpoint handlers.
- Identify any pair or set of docs that describe the same user-facing flow from different angles, and the ground-truth source file that would resolve a contradiction between them.

Completion criterion: at least one of the three tracks below has an identified doc target and a code target to diff against.

## 2. Scan — priority order, stop at the first real hit

**Track 1 — reference-doc-vs-code (highest priority, bidirectional, mandatory both directions):**

Glob real artifacts recursively — don't stop at top-level; nested/partial directories are the most common blind spot — versus the doc's listing.

- Direction A: artifact exists, no doc entry → missing-doc drift.
- Direction B: doc entry exists, no matching artifact → stale-doc drift.

A single-direction audit is not a complete audit — always run both before concluding "no drift."

**Track 2 — API-contract-vs-endpoint drift (if the repo has a contract format):**

Glob real endpoint handlers versus contract files, match by HTTP method + path, flag unmatched entries in either direction. For a matched pair with a request/response body, cross-check the body shape against the real schema/type definition in code — shape mismatches (a flat array where an object is expected, a renamed field) are the most common *silent* drift and more valuable to catch than a simple missing-file gap.

**Track 3 — cross-doc consistency:**

If 2+ docs describe the same flow, diff them for contradictions on the same fact (a default value, a role, a config option). Confirm which side is correct against the named ground-truth source file before flagging — a contradiction alone doesn't say which doc is wrong.

Stop at the first drift with real evidence (both-sides grep/glob output), in track priority order.

## 3. Fix — one atomic change

Before editing, answer:

1. Do I have grep/glob evidence from **both** sides (doc and code) proving this is real drift, not a naming coincidence?
2. Does the fix touch only docs/contract files — never a source/logic file?
3. If this is a contradiction between two docs, have I confirmed which side matches the ground-truth source before editing?

Baseline verify: none required for a pure markdown/contract-file edit; only run lint/typecheck if a non-doc file was touched — which should not happen on this skill.

Size budget: ≤30 lines changed, one drift per run.

## 4. Verify & present

Re-run the exact glob/grep check that surfaced the drift, to confirm it's now closed (e.g. re-diff the doc listing against the artifact glob). Show the diff. STOP — do not commit, do not open a PR.

## NEVER

- **NEVER touch `src/` or any logic/source directory**
  **Instead:** Fix only docs/contract files; report source-side drift as a finding for a human (or a different skill) instead of editing source.
  **Why:** This skill has no verification step for logic correctness — only for doc-vs-doc and doc-vs-glob agreement. Editing source here would ship an unverified change under a docs-only skill's authority.

- **NEVER audit only one direction of the bidirectional check**
  **Instead:** Always run both artifact→doc and doc→artifact before concluding a track is clean.
  **Why:** The missing-doc direction is easy to eyeball, but the stale-doc direction requires deliberately diffing every doc row against a fresh file glob — audits that skip it reliably miss the majority of real stale entries.

- **NEVER flag a cross-doc contradiction without checking the ground-truth source first**
  **Instead:** Resolve against the named source file before editing either doc.
  **Why:** Editing the doc that was actually correct just relocates the contradiction instead of fixing it — the next audit finds the same drift in the other direction.

- **NEVER skip subdirectories in the artifact glob**
  **Instead:** Glob recursively, not just top-level.
  **Why:** Nested/partial files are the single most common blind spot in this kind of audit — a top-level-only glob silently under-reports coverage while looking complete.

- **NEVER touch off-limits paths, fix more than one drift per run, or commit/open a PR**
  **Instead:** Stop after presenting the diff for the one confirmed drift.
  **Why:** This skill's job ends at "verified diff, ready for human review" — going further removes the review gate the whole workflow depends on.

## Files

- `references/scan-core.md` — core checks (loaded Phase 1)
- `evals/` — ai-forge-eval assertions
