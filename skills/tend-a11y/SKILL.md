---
name: tend-a11y
disable-model-invocation: true
description: Finds and fixes the single highest-priority accessibility, UX, or copy-tone issue in this repo's UI markup — missing aria-labels/alt text, unlabelled inputs, raw HTML used where a semantic element or component-library equivalent exists, unannounced async loading/success/error states, destructive actions without confirmation, and banned copy constructs (imperative softeners, needless exclamation marks) in both template markup and script-block string literals. Use for accessibility/UX/copy polish passes on components and pages. Not for backend logic, data flow, or security-sensitive auth/payment UI (see tend-security), and not for full design-system rewrites.
---

# Tend A11y — *the herald*

Find the single highest-priority accessibility, UX, or copy-tone issue in this repo's markup, fix it minimally, verify, hand back the diff for review. One issue per run.

## 0. Load config

- Read `.claude/tend/config.yaml`. Use `skills.a11y` (off-limits globs, `notes`). This skill has no capability modules — skip module-gating entirely, there is no `modules:` gating step here.
- **No config?** Run at **core tier**: core SvelteKit + TS assumptions, conservative built-in off-limits (never touch lockfiles, CI, `.env`, config). Emit once: "run `tend-onboard` to sharpen." Continue.

## 1. Triage

MANDATORY READ [`references/scan-core.md`](references/scan-core.md).

- Establish the off-limits set: config's `skills.a11y.off-limits` plus the built-in rails (never touch lockfiles, CI config, `.env`, project config, or backend/API-route logic — this skill is presentation-only).
- Establish entry points: this repo's markup files — `.svelte` components, `+page.svelte` / `+layout.svelte` routes, or whatever template files the stack actually uses. Check `skills.a11y.notes` for a named component-library directory (e.g. `src/lib/components/ui`) — if one exists, its exports are the "use this instead of raw HTML" target list for Phase 2.
- Read 1–2 existing components before scanning to learn the repo's actual component-library and status/loading conventions — you need the real pattern in hand before you can call a deviation from it a violation.

Completion criterion: off-limits set known, component-library convention (if any) identified, entry-point globs identified.

## 2. Scan — priority order, stop at the first real hit

Ordered highest-value (most silent-to-users) first — stop at the first real, evidence-backed hit:

1. **Raw interactive HTML where a component-library equivalent exists** — a raw `<button>`/`<a>`/`<input>` alongside a `Button`/`Link`/`Input` export elsewhere in the repo.
2. **Icon-only or icon-primary interactive elements missing an accessible name** — no `aria-label`, no visually-hidden text, no `title` fallback.
3. **`<img>` without `alt`** — a missing attribute is the violation; an intentionally empty `alt=""` on a decorative image is not.
4. **Form inputs without an associated label** — no `label for=`, `aria-label`, or component-library label prop. Audit the *rendered* count, not just the template: inputs generated inside a loop (`{#each}` or equivalent) produce N anonymous controls at runtime.
5. **`role="button"` (or a bare `onclick` on a non-interactive element) missing the paired keyboard handler** — `onkeydown` for Enter + Space. Native `<button>` gets this for free; this only fires on the raw-element escape hatch.
6. **Async success/error/loading feedback rendered as a plain, unannounced element** — no `role="alert"`/`role="status"`, no `aria-live`, and no existing component-library banner/toast primitive already used elsewhere in the repo.
7. **A destructive action (delete/remove/reset) with no confirmation step** before it takes effect.
8. **Copy-tone violations**, checked against the config-driven allow/deny list (`skills.a11y.notes`, or a project tone doc it points to). If no repo-specific list exists, fall back to generic defaults: an imperative softener like "Please" prefacing a validation/error instruction ("Please enter a name" vs. "Enter a name"), or a needless exclamation mark in routine confirmation/instructional copy. **Scan both rendered markup text and string literals inside `<script>` blocks** — copy assigned to a variable, passed to a toast/alert call, or set via `.textContent`/`.innerText` lives in script blocks, not just markup, and a markup-only grep will miss the real validation strings.

## 3. Fix — one atomic change

Before editing, answer:

1. Is this genuinely unclear or inaccessible to a real user (screen reader, keyboard-only, or someone reading the tone) — not a stylistic preference of mine?
2. Does the fix touch presentation/copy only — no logic, no backend, no new dependency?
3. Does a component-library equivalent already exist for this pattern? If yes, use it instead of hand-rolling the raw-HTML fix (don't bolt `role="alert"` onto a raw `<div>` if the repo already has a status/banner component that carries it).

Baseline verify: run the repo's lint/typecheck (and the test suite if fast) before editing — note any pre-existing failures so you don't misattribute them later.

Size budget: ≤50 lines changed for a markup/structural fix, ≤10 lines for a pure copy-text fix; one component or page per run.

Never touch off-limits paths. If the real fix would require touching one, stop and report why instead of forcing it through elsewhere.

## 4. Verify & present

Re-run lint/typecheck (and tests, if you ran them in step 3) — abort only if *your* change introduces a new failure; pre-existing failures are not yours to fix here. Show the diff. STOP — do not commit, do not open a PR.

## NEVER

- **NEVER flag or fix more than one issue per run**
  **Instead:** Stop scanning at the first real hit, fix it, present it.
  **Why:** Batched a11y/copy diffs are hard to review individually and hide which specific fix caused a regression.

- **NEVER hand-roll a raw-HTML fix when a component-library equivalent already exists**
  **Instead:** Use the repo's own `Button`/`Input`/`Link`/status-banner component.
  **Why:** A parallel one-off fix creates a second inconsistent pattern instead of converging on the one the rest of the repo already relies on — the next audit will re-flag it as drift.

- **NEVER invent a copy-tone rule not backed by `skills.a11y.notes` or a generic, clearly-labeled default**
  **Instead:** Use the config-driven allow/deny list, or state explicitly you're falling back to a generic default pattern.
  **Why:** A rule invented on the spot isn't reusable or auditable next run, and may contradict the repo's actual house style.

- **NEVER scan markup only and skip `<script>` blocks for copy strings**
  **Instead:** Grep string literals inside `<script>` blocks too — validation and feedback copy is frequently assigned there, not written directly into the template.
  **Why:** The real user-facing string is often a variable interpolated into the template; a markup-only grep matches the interpolation site, not the actual offending text, and reports nothing to fix.

- **NEVER touch off-limits paths or commit/open a PR**
  **Instead:** Respect `skills.a11y.off-limits` plus the built-in rails; stop after presenting the diff.
  **Why:** This skill's job ends at "verified diff, ready for human review" — committing or touching excluded paths removes the review gate the whole workflow depends on.

## Files

- `references/scan-core.md` — core checks (loaded Phase 1)
- `evals/` — ai-forge-eval assertions
