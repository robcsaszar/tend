# Tend Security — `feature-flags` Module Reference

Loaded only when `feature-flags` is in the config's `modules:` list — signal is a local feature-flags module, constants file, or naming convention (`FEATURE_*`, a flags object/enum) referenced from both markup and route handlers.

## 1. UI-gated ≠ backend-gated

A feature flag that hides a form field or control in the UI does nothing on its own to stop the backend from accepting that field's value if it's submitted directly (a raw POST, a modified request, a replayed one). The gap is not a deliberate oversight — it arises naturally because the flag is added as a *render* guard (`{#if flagEnabled}<RadioGroup />{/if}`) at the point someone is thinking about the UI, and the corresponding *handler* guard lives in a different file entirely, easy to forget because nothing about editing the template reminds you it exists.

```bash
grep -rln 'FEATURE_\|featureFlags\.\|flags\.' src/ --include="*.svelte" --include="*.ts"
```

```svelte
<!-- signup page: role selector only rendered when the flag is on -->
{#if featureFlags.SIGNUP_ROLE_SELECTION}
  <RadioGroup name="role" options={["player", "curator"]} />
{/if}
```

```ts
// ✗ handler accepts `role` unconditionally — the flag never reaches here
export const actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const role = form.get("role"); // accepted even when the flag is off
    await createAccount({ role });
  },
};
```

```ts
// ✓ mirror the flag on the accepting side — ignore the field when the flag is off
export const actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const role = featureFlags.SIGNUP_ROLE_SELECTION
      ? form.get("role")
      : "player"; // default when the flag is off, regardless of what was submitted
    await createAccount({ role });
  },
};
```

**The check:** for every flag that conditionally renders a field or control, find the handler that ultimately consumes that field's submitted value, and confirm the handler itself re-checks the same flag (or otherwise ignores/clamps the field) rather than trusting that the UI guard was the only path to it. A direct POST — no browser, no rendered form — bypasses every render guard by construction; the handler is the only place the check can actually hold.

## 2. Secondary signals worth a mention, not a full finding on their own

- **Stale/orphaned flags** — a flag whose gated code is effectively dead (fully rolled out, or never rolled back after an experiment ended) isn't itself a vulnerability, but a stale flag left in the codebase is exactly the kind of forgotten branch where the backend-mirroring check above tends to have rotted since it was last reviewed. Worth flagging if it's adjacent to the finding you're already fixing — not worth a separate run on its own unless it has a concrete exploit path.
- **Flag-gated paths left uncleaned after full rollout** — same shape as above; only escalate to a real finding if the leftover code path has an actual exploitable gap, not merely because it's dead weight.
