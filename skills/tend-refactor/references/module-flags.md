# Tend Refactor — `feature-flags` Module Reference

Loaded only when `feature-flags` is in the config's `modules:` list — signal is a local feature-flags module, constants file, or naming convention (`FEATURE_*`, a flags object/enum) referenced from both markup and route handlers. This module is a flavor of `references/scan-core.md` §1 (dead code & duplication removal), applied specifically to flag-gated code — it is not a separate priority tier.

## 1. Stale flags are dead-code candidates

A feature flag that is permanently `true` (fully rolled out, never removed) or permanently `false` (an abandoned experiment, never cleaned up) turns everything behind it into dead code with extra ceremony: a branch that will never take the path it appears to guard. The detection method is identical to the base tier's dead-code sweep — the only difference is the trigger is a flag's rollout status, not a `@deprecated` tag.

```bash
grep -rn 'FEATURE_\|featureFlags\.\|flags\.' src/ --include="*.svelte" --include="*.ts"
```

```ts
// flags.ts — check the flag's actual current value/status
export const featureFlags = {
  SIGNUP_ROLE_SELECTION: true, // shipped to 100% in Q1, never removed
};
```

```svelte
<!-- ✗ this branch is now unconditionally live — the {#if} is dead weight -->
{#if featureFlags.SIGNUP_ROLE_SELECTION}
  <RadioGroup name="role" options={["player", "curator"]} />
{:else}
  <input type="hidden" name="role" value="player" />
{/if}
```

```svelte
<!-- ✓ collapse to the always-taken branch, remove the flag and its dead sibling -->
<RadioGroup name="role" options={["player", "curator"]} />
```

## 2. Proof standard for this pattern

A flag counts as a real finding only once you've confirmed its rollout status is actually settled — grep for every read of the flag, and check the flag's own definition/config for a value that no longer varies (hardcoded `true`/`false`, or a comment/config entry indicating the experiment concluded). **If the flag's status is ambiguous — still toggled per-environment, still referenced in active rollout config, or you can't confirm it's settled — this is a STOP-with-no-fix case, not a finding.** Removing a flag that's still in active use anywhere is a behavior change, not a dead-code removal, and belongs to a different kind of change entirely (and a different reviewer's call) than this skill makes.

Once confirmed stale, the fix is: collapse to the always-taken branch, remove the now-dead branch, and remove the flag definition itself if this was its only remaining reader — the same "prove then remove" discipline as any other dead-code finding, with the flag's settled status standing in for the `@deprecated` tag.
