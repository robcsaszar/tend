# Tend Refactor — Core Scan Reference

Always-on checks, regardless of which capability modules are active. Loaded in Phase 1, before any module pack. Examples below use generic names — substitute this repo's actual file/component/type names.

## Priority order — and why

Scan in this order. Stop at the first real, evidence-backed hit — do not keep scanning once one is selected.

1. **Dead code & duplication removal** — the safest tier. Purely subtractive or consolidating: no new abstraction is introduced, the blast radius is whatever already exists, and the failure mode of "I was wrong" is usually just "nothing changed."
2. **Type-safety tightening** — zero runtime risk by construction (type-only edits), but requires stricter mechanical-fix discipline than tier 1: a wrong guess produces a type that still compiles but is subtly wrong, which is a worse failure than doing nothing.
3. **Component/markup extraction** — the highest-risk tier. It introduces a brand-new abstraction, touches every call site at once, and carries the most non-obvious failure modes (styling scope, prop-spreading, sampling error — see §3). Attempt this tier only when neither of the first two yields a real candidate.

This ordering is the pack's general philosophy applied to refactor specifically: prefer the fix with the smallest, most reversible blast radius, and only reach for a riskier class of change when nothing safer is available. A finding must clear all three proof-bar questions for its tier (see SKILL.md §3) before it counts as "found" — an unverifiable candidate is a lead, not a finding. Drop to the next tier instead of forcing it.

---

## 1. Dead code & duplication removal

**Targets:**
- `@deprecated`-tagged exports with no remaining callers
- Lint-flagged dead code (unused exports, unreachable branches)
- A duplicated inline pattern appearing in 2+ files
- Consumers still calling a helper that a newer helper has superseded

**Scope:** utility, component, and helper directories; API-route call-site migration only (updating a route's *callers* of a changed helper — never adding new routes or new logic). Never touch the domain/business-logic core — restrict this sub-domain to utility and presentation layers. A repo's own core paths to protect (its actual business-logic engine, wherever that lives) are named in this repo's `skills.refactor.off-limits`, not hardcoded here — this skill has no way to know a given repo's core-logic directory name in advance.

**Method:**
```bash
# find deprecated exports and check for remaining callers
grep -rn '@deprecated' src/lib/ src/components/ src/utils/
grep -rn '<name of the deprecated export>' src/ --include="*.ts" --include="*.svelte"

# find a duplicated inline pattern across files (adjust to the actual pattern)
grep -rln '<distinctive line or two from the suspected duplicate>' src/
```

Prove duplication with grep evidence — **2+ call sites minimum** — before treating it as a finding. A pattern found in exactly one file is not duplication; it may still be dead code (if unreferenced) but "duplicated" and "dead" are different claims and each needs its own evidence.

**Provenance note:** this sub-domain has no additional inherited lessons beyond the scope and method above — treat this checklist as the complete spec for this tier, not an abbreviated version of a longer playbook.

**Module extensions of this same tier** — load a pack only if its module is active in config; each is a flavor of dead-code/duplication removal applied to a specific layer, not a separate priority tier:
- `data` → [`module-data.md`](module-data.md) — repeated DB-init boilerplate consolidated into shared middleware/locals init
- `validation` → [`module-validation.md`](module-validation.md) — duplicated validation/schema-transform pipelines consolidated into one reusable piece
- `feature-flags` → [`module-flags.md`](module-flags.md) — dead code stranded behind a fully-rolled-out or abandoned flag

---

## 2. Type-safety tightening

Eliminate one `any`/type-weakness per run.

**Hit-list method:**
1. Run the project's linter looking for its `no-explicit-any`-equivalent rule first — this is usually the cheapest, most complete hit list.
2. If lint output is clean, grep manually for:
   - `any` type annotations
   - `as any` casts
   - Untyped generics (`Array<any>`, `Promise<any>`, `Record<string, any>`)
   - Unconstrained `{}` used where a typed shape exists nearby

```bash
grep -rn ': any\b\|as any\b\|<any>\|Record<string, any>\|Array<any>\|Promise<any>' src/ --include="*.ts"
```

**Selection order** — pick the fix that is:
1. Most mechanical — the correct type is inferable from context, no guessing
2. Contained within a single file
3. Not in a hot auth/core-engine path — prefer utility/helper modules first
4. Confirmed correct by the project's typecheck command passing after the change

**How to find the right type:**
- Read the function's callers and call sites to infer the actual shape
- Check whether a matching interface or type already exists nearby (same file, or imported from a shared lib) — prefer narrowing to an existing type over inventing a new one
- **If no existing type fits cleanly, it is NOT a mechanical fix — skip it and find another.** This bar is deliberately strict: "I could probably design a type for this" is not the same claim as "the shape is already evident from how the value is used."

**Scope:** type-only changes. Never runtime-behavior changes. Never touch test files — a type fix lives in source only; if a function has no test coverage, that's `tend-tests`' job, not a reason to add one here.

**STOP with no fix if:** every remaining candidate is a single, non-exported, non-boundary call site with no downstream impact. A one-off `any` on a local variable nobody else touches is real, but not worth a run on its own — keep looking, or stop.

**Lesson — don't declare victory after one instance.** After fixing a weak-type pattern at one call site, actively check for sibling call sites sharing the same underlying pattern before finishing, rather than assuming the fix propagated. A cast like `(err as Record<string, unknown>)?.code` recurring in a hand-rolled error handler is exactly the kind of pattern that gets fixed once, in the file someone happened to be looking at, and left everywhere else. Grep for the same shape elsewhere in the codebase; if siblings exist, fix the most representative one this run and **note the remaining siblings in the finding** so a future run (or a human) knows they're still open — still only one fix per run.

---

## 3. Component / markup extraction

Find repeated HTML/markup and extract it into one reusable component. One extraction per run.

**Candidate criteria** — all three required:
- Appears in **2+ distinct files** (not merely repeated within one file)
- Contains **at least 3 meaningful elements** (not a single wrapper element)
- Has **clear, stable props** — the only differences between instances are data values, not structure

**Method:**
1. Look for identical or near-identical multi-line markup blocks across files.
2. Check for repeated *structural* patterns even when markup isn't textually identical: card layouts, form-field groups, icon+label pairs, status banners, header/nav sections.
3. Check the project's existing component directory/docs **first** to confirm no equivalent component already exists — extracting a duplicate of something that already exists is worse than leaving the duplication in place.

**Selection:** the extraction with the most instances (highest DRY value) and the fewest props needed (simplest interface).

**Procedure:**
1. Identify the pattern and **all** of its instances.
2. Determine what varies between instances — these become props.
3. Create the component in the location matching this repo's existing directory conventions.
4. Replace all instances with the new component.
5. Verify markup output is identical by reading each replaced site.

### Extraction-safety checklist (read before extracting, not after)

**a. Verify every instance — never extract from a sample.** Do not assume the Nth instance matches the first N−1 you looked at. A pattern that looks identical across three call sites can break on a fourth with different slot content, a conditional element, or extra attributes. Read every single instance's actual content before assuming uniformity — checking 2 of 4 instances and generalizing from them is exactly the mistake this rule exists to prevent.

**b. Check for prop-spreading and per-instance attribute overrides before merging.** `{...props}` spread onto an element, or an attribute present on some instances but not others (e.g. one icon has `fill-rule="evenodd"`, the rest don't), disqualifies a naive shared base — the override would silently vanish once the markup is centralized into one component. Grep every candidate instance for a spread or an attribute that doesn't appear on all the others before deciding the set is uniform enough to extract.

**c. Watch for scoped-style / CSS-scoping risk.** In component frameworks that scope `<style>` blocks to slotted content (e.g. Astro's slot-based scoping), extracting a wrapper can change *which* element receives the scope attribute — the outer element gets the new wrapper component's scope, while inner elements keep the original page's scope, which can silently detach descendant-selector styles from the elements they were meant to target. If the markup you're about to extract has a non-trivial `<style>` block anywhere nearby that targets descendant selectors (`.icon .path`, `> svg`, etc.) and you are not certain which element will carry the scope attribute after extraction, treat it as **unsafe to extract until manually verified** in a rendered page — do not force it on the strength of static reading alone.

**d. Targeting heuristic — check icon/asset directories first.** Icon and small-asset directories are a common hotspot where near-duplicate boilerplate accumulates silently, even in an otherwise well-componentized codebase — each icon gets added independently, each one copy-pastes the last one's wrapper markup. A shared `viewBox` value plus a shared attribute signature (e.g. `stroke-width="2" stroke="currentColor" fill="none"`) across several icon files is a strong extraction fingerprint and a good first place to look when starting a scan for this tier.

**e. Hard requirements — any one of these disqualifies the candidate outright:**
- Only one call site exists (minimum 2 required)
- The "component" would wrap a single HTML element with no added value
- A prop would exist for a variation that isn't actually present in the duplicated markup (only parameterize what actually varies)
- The extraction would change the visual output or behavior of any page — the replacement must render identically to what it replaces
