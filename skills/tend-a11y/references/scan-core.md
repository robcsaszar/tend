# Tend A11y — Scan Reference

Framework-agnostic checks for interactive-element semantics, accessible naming, async-state announcement, destructive-action safety, and copy tone. Examples below use generic component names — substitute this repo's actual component-library exports (see `skills.a11y.notes` for the directory).

## 1. Component-library sweep

Repos that ship a UI component library usually intend it to replace raw HTML for interactive elements. The check is the same regardless of what the library is actually called:

| Prefer | Over raw | Why |
|---|---|---|
| `<Button>` (or equivalent) | `<button>` | Centralizes variant/disabled/loading states; a raw button re-implements them inconsistently. |
| `<Link>` | `<a>` | Centralizes external/internal routing + `rel` handling. |
| `<Input>` | `<input>` | Centralizes label wiring, error states, `aria-describedby`. |
| a status/banner component | raw `<div>` for feedback | Centralizes `role`/`aria-live` wiring — see §3. |
| `<Icon name="...">` | inline `<svg>` | Centralizes `aria-hidden`/title handling for decorative vs. meaningful icons. |

```bash
grep -rn '<button' src/ --include="*.svelte"
grep -rn '<input' src/ --include="*.svelte"
grep -rn '<a ' src/ --include="*.svelte"
```

Cross-reference hits against the actual component-library export list before flagging — a raw element used *inside* the library component's own implementation is not a violation.

## 2. Accessible names

```bash
grep -rn '<img' src/ --include="*.svelte" | grep -v 'alt='
grep -rn 'intent="icon"\|icon-only\|icon-button' src/ --include="*.svelte" | grep -v 'aria-label'
grep -rn '<Input\|<input' src/ --include="*.svelte" | grep -v 'label='
```

```svelte
<!-- ✗ silent to AT -->
<img src={avatar} />
<button class="icon-btn" onclick={close}><XIcon /></button>

<!-- ✓ named -->
<img src={avatar} alt="{user.name}'s avatar" />
<button class="icon-btn" aria-label="Close dialog" onclick={close}><XIcon /></button>
```

`placeholder` is never a substitute for a label — any input without `label=`, `<label for>`, or `aria-label` is silent to assistive technology, even if it visually reads fine.

**Rendered count, not template count:** an input generated inside a loop produces N separate anonymous controls at runtime. Check that each iteration's control gets a unique, meaningful accessible name (e.g. interpolate the loop item into the label), not a single static one repeated N times.

## 3. `role="alert"` / `role="button"` pairing

**Async feedback:**

```svelte
<!-- ✗ silent -->
<div class="text-green-500">{message}</div>

<!-- ✓ announced -->
<div role="alert" class="text-green-500">{message}</div>
```

If a status/banner component exists in the repo and already carries the correct role, use it instead of adding `role="alert"` to a raw div by hand — see NEVER in SKILL.md.

**Interactive non-button elements:**

```bash
grep -rn 'role="button"' src/ --include="*.svelte" | grep -v 'onkeydown'
```

`role="button"` on a `<div>` or `<svg>` does not inherit native keyboard activation. Always verify both `onclick` AND `onkeydown` (Enter + Space) are present. A native `<button>` handles this automatically — the check only fires on the raw-element escape hatch.

```svelte
<!-- ✗ mouse-only -->
<div role="button" tabindex="0" onclick={submit}>Submit</div>

<!-- ✓ full keyboard support -->
<div
  role="button"
  tabindex="0"
  onclick={submit}
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && submit()}
>
  Submit
</div>
```

## 4. Async-loading-state checks

Look for `fetch`/async calls in script blocks with no corresponding loading, success, or error UI state rendered anywhere in the component. A silent async call that fails leaves the user staring at nothing — the fix is a loading indicator plus an announced error state (§3), not necessarily a full UX redesign.

## 5. Destructive-action confirmation checks

Grep for delete/remove/reset/clear handlers and check whether the action fires immediately on click, or goes through a confirmation step first (a modal, a two-step "click again to confirm" affordance, or an undo window). An action that mutates or deletes data with zero confirmation and zero undo is the highest-severity finding in this category — prioritize it if found alongside lower-severity items.

## 6. Copy-tone: config-driven banned-construct list

The mechanism, not a fixed word list, is what's reusable here: check copy against `skills.a11y.notes` (or a tone doc it references) *before* flagging a violation — a word/pattern banned in one repo's house style may be intentional in another's.

**Generic default patterns** (use only when no repo-specific list exists):

- An imperative softener like "Please" prefacing a validation or error instruction: `"Please enter a name"` → `"Enter a name"`. Note common, deliberate exceptions such as "Please wait" in a loading state, or "Please try again" after a network error — these are requests for patience, not softened imperatives, and are typically not violations.
- A needless exclamation mark in routine confirmation or instructional copy (`"Saved!"` in a routine save-confirmation toast). Distinguish this from a deliberate, scoped exception (e.g. game-event or celebratory strings explicitly carved out in the repo's tone notes) — check the exclusion list before flagging, not after.

**Script-block copy (non-obvious, check it):**

```bash
grep -rn '"Please\|Please ' src/ --include="*.svelte" --include="*.ts"
grep -rn '"[^"]*!"' src/ --include="*.svelte" --include="*.ts"
```

Copy frequently lives inside `<script>` blocks — a `showToast("Please wait...")` call, a `.textContent = "..."` assignment, an error-message variable interpolated into the template. A grep scoped to rendered markup only will miss these; scan `<script>` block string literals as a first-class source of copy, not an afterthought.

## 7. Starting grep sweep

```bash
grep -rn '<button\|<input\|<a ' src/ --include="*.svelte"
grep -rn 'role="button"' src/ --include="*.svelte" | grep -v 'onkeydown'
grep -rn 'class="[^"]*\b\(success\|error\|status\)\b' src/ --include="*.svelte" | grep -v 'role='
grep -rn '<img' src/ --include="*.svelte" | grep -v 'alt='
grep -rn '"Please\|Please ' src/ --include="*.svelte" --include="*.ts"
grep -rn '"[^"]*!"' src/ --include="*.svelte" --include="*.ts"
```
