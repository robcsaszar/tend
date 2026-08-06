---
name: tend-tests
disable-model-invocation: true
description: Finds a function in this repo's logic/library layer with zero test coverage — prioritizing functions built with a dependency-injection or mockable-dependency pattern — and writes exactly one new test covering a happy path and an edge/error path, matching this repo's existing test runner, mock convention, and file-placement style. Use for closing test-coverage gaps incrementally. Not for e2e/integration/UI tests, migrating test runners, or fixing an already-failing test — that's a bug fix, not a coverage gap.
---

# Tend Tests — *the weaver*

Find the single highest-priority untested function in this repo's logic layer, write one new test exercising the happy path and an edge case using this repo's own conventions, verify it passes, hand back the diff for review. One function per run.

## 0. Load config

- Read `.claude/tend/config.yaml`. Use `skills.tests` (off-limits globs, `notes` — repo-specific hints often live here, e.g. the exact name of this repo's DI/mock-factory convention). This skill has no capability modules — skip module-gating entirely.
- **No config?** Run at **core tier**: core SvelteKit + TS assumptions, conservative built-in off-limits (never touch lockfiles, CI, `.env`, config). Emit once: "run `tend-onboard` to sharpen." Continue.

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

- Establish the off-limits set: config's `skills.tests.off-limits` plus built-ins.
- Identify the test runner actually configured — read `package.json` scripts and a config file (`vitest.config.*`, `jest.config.*`, or equivalent). Don't assume; confirm.
- Identify the test file placement convention (co-located `*.test.ts` vs. a top-level `tests/`/`__tests__/` directory) and the import style in use (extensioned imports, path aliases).
- Read 1–2 existing test files to learn the assertion style and — critically — whatever dependency-injection/mock convention this repo already uses. A named factory pair like `makeState`/`makeDeps` is *one example* of this convention, not the target itself — detect and match whatever this repo actually does, including "none yet" (see §2 fallback tier).

Completion criterion: test runner identified, an example existing test read, off-limits known.

## 2. Scan — priority order, stop at the first real hit

1. **DI/mockable-dependency candidates (highest priority).** Grep the logic/library directory for the repo's dependency-injection idiom — a `deps` parameter injecting browser/platform globals (`fetch`, storage, timers), constructor injection, or an equivalent explicit seam. This is the highest-value target because the codebase has already signalled "designed to be tested without module-level mocking."
2. **Coverage cross-check.** For each candidate, grep the test directory/convention for any reference to the function name. Zero references = untested candidate.
3. **Fallback tier — pure functions.** If no DI-pattern candidate is untested, fall back to any pure exported function (deterministic output, no hidden module-level state) in the logic layer with zero test references. Note explicitly in your output that this is the fallback tier, since it carries a weaker "designed to be tested" signal than tier 1.

Stop at the first untested candidate found, in priority order — do not collect a full gap list before writing.

## 3. Fix — write exactly one test

Before writing, answer:

1. Does a test file already cover this module? If yes, add to it; only create a new file if none exists, following the repo's naming convention.
2. Am I matching the repo's own DI/mock convention — not inventing a new one? If the repo has no established convention yet, use the test runner's simplest built-in mock and say so explicitly.
3. Does the test cover a real happy path AND a real edge/error path — not two variations of the same happy path?

Baseline verify: run the test suite before writing; note any pre-existing failures so you don't misattribute them later.

Write the test, then run:

```bash
node scripts/validate-test-shape.mjs <test-file> <target-function-name>
```

It checks that the test file actually references the target function and contains both a happy-path-shaped and an edge-case-shaped assertion. Fix anything it reports before moving on.

Size budget: one function, one test file (new or appended-to) per run. **Never touch source files.** A coverage gap is not license to refactor the function under test — that's `tend-refactor`'s job. If the function is genuinely untestable as written (hidden module-level state, no seam at all), report that as the finding instead of changing it.

## 4. Verify & present

Run the test suite — abort only if *your* new test fails or breaks another test; pre-existing failures are not yours to fix here. Run the validator once more as a final check. Show the diff. STOP — do not commit, do not open a PR.

## NEVER

- **NEVER modify the function under test to make it pass or "more testable"**
  **Instead:** Write the test against the function as it exists; if it's genuinely untestable, report that as the finding.
  **Why:** Conflates this skill's scope with `tend-refactor`'s, and risks silently changing production behavior under the guise of "just adding a test."

- **NEVER invent a DI/mock convention that isn't already present in the repo**
  **Instead:** Detect and match the existing convention, or use the test runner's plain built-in mock and say so.
  **Why:** A fabricated convention fragments the test suite into incompatible styles that the next contributor — human or agent — can't follow or extend.

- **NEVER skip `scripts/validate-test-shape.mjs`**
  **Instead:** Always run it before presenting the diff.
  **Why:** A test file that never actually calls the target function (e.g. copy-pasted from another test and never rewired) reports green in the test runner while adding zero real coverage.

- **NEVER write into e2e/integration test directories from this skill**
  **Instead:** Limit output to unit tests, in the placement convention identified in Phase 1.
  **Why:** E2E suites typically require a running service or browser; a bad addition there breaks CI rather than staying contained to this skill's narrow scope.

- **NEVER touch off-limits paths, fix more than one function per run, or commit/open a PR**
  **Instead:** Respect `skills.tests.off-limits` plus the built-in rails; stop after presenting the diff.
  **Why:** This skill's job ends at "verified diff, ready for human review" — going further removes the review gate the whole workflow depends on.

## Files

- `references/scan-core.md` — core checks (loaded Phase 1)
- `scripts/validate-test-shape.mjs` — zero-dependency shape validator for the new test file
- `evals/` — ai-forge-eval assertions
