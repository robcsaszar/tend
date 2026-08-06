# Tend Tests — Scan Reference

## 1. Test runner detection

Don't assume. Read `package.json`'s `scripts.test` and look for a config file:

```bash
grep -n '"test"' package.json
ls vitest.config.* jest.config.* 2>/dev/null
```

Vitest and Jest share the same `describe`/`it`/`expect` surface, but import from different modules and have different mock APIs:

```ts
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Jest
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
```

Match whichever the repo actually imports from — never introduce the other one into a repo that already picked its runner. (If this repo is a Python project using pytest instead, the same detection principle applies: read the actual test config/fixtures rather than assuming a JS-shaped convention; the `scripts/validate-test-shape.mjs` validator shipped with this skill targets JS/TS `describe`/`it`/`test` files specifically.)

## 2. Dependency-injection / mockable-dependency pattern detection

The signal to grep for is a function that accepts its side-effecting dependencies as an explicit parameter, rather than reaching for a module-level import or global directly:

```bash
grep -rn "deps.*fetch\|deps.*sessionStorage\|deps.*setTimeout\|deps.*clearTimeout\|deps.*localStorage" src/lib/ --include="*.ts"
```

Generalize the grep to whatever this repo's actual seam looks like — a `deps` object parameter is one common shape, but constructor injection, a passed-in client instance, or an explicit "ports" argument are equivalent signals. The point of the pattern, wherever it appears, is the same: the function is explicitly designed to be unit-tested without module-level mocking.

```ts
// src/lib/orders.ts
export function cancelOrder(
  orderId: string,
  deps: { fetch: typeof fetch; now: () => number },
) {
  // ...
}
```

## 3. Coverage cross-check

```bash
grep -rln "<function-name>" tests/   # or the repo's actual test directory/convention
```

Zero hits across the test tree = untested candidate. A hit inside an unrelated comment or an import that's never called does not count as coverage — confirm the function is actually invoked inside an assertion, not merely imported.

## 4. Fallback tier — pure functions without DI

If no DI-pattern candidate is untested, widen to any pure, deterministic, exported function in the logic layer with zero test references. This tier is weaker signal ("nobody flagged it as high-value to test") than tier 1 ("the code explicitly invites testing") — say so explicitly when you use it.

## 5. Test file placement convention

- Add to an **existing** file if one already covers the module (e.g. `tests/sanitize.test.ts` for `src/lib/sanitize.ts`).
- Create a new file only if none exists, matching the repo's naming convention (`tests/<module-name>.test.ts`, or a co-located `<module-name>.test.ts` next to the source file — check which the repo already does).
- Match the repo's import-extension convention exactly (some TS/ESM setups require `.js` extensions on relative imports even though the source file is `.ts`).

## 6. Core test pattern

```ts
describe("cancelOrder", () => {
  it("cancels the order and clears the timer", () => {
    const deps = makeDeps();
    const result = cancelOrder("order-1", deps);
    expect(result.status).toBe("cancelled");
    expect(deps.clearTimeout).toHaveBeenCalled();
  });

  it("throws when the order is already cancelled", () => {
    const deps = makeDeps();
    expect(() => cancelOrder("already-cancelled", deps)).toThrow();
  });
});
```

## 7. Factory-based mock builders

Where the repo already uses factory functions to build state and deps objects, follow that exact pattern rather than inlining ad hoc mocks per test:

```ts
function makeState(overrides: Partial<MyState> = {}): MyState {
  return { field: defaultValue, ...overrides };
}

function makeDeps(overrides: Partial<MyDeps> = {}): MyDeps {
  return {
    fetch: vi.fn().mockResolvedValue(new Response()),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    ...overrides,
  };
}
```

`makeState`/`makeDeps` is this repo-family's example name for the pattern, not a required name — if the repo under test calls its factories something else (`buildFixture`, `createTestDeps`, etc.), use that name. If no factory convention exists yet, inline the minimum mock needed and don't introduce a new abstraction layer for a single test.

Use `beforeEach(() => vi.useFakeTimers())` / `afterEach(() => vi.useRealTimers())` (or the repo's runner's equivalent) for timer-dependent code.

## 8. Validator contract (`scripts/validate-test-shape.mjs`)

```bash
node scripts/validate-test-shape.mjs <test-file> <target-function-name>
```

Checks, in order:

1. The file exists and is readable.
2. The file references the target function name (an import statement or a direct call).
3. There are at least two `it(`/`test(` blocks.
4. At least one block's title does not match edge-case keywords (a happy-path test).
5. At least one block's title OR body matches edge-case keywords (`throw`, `error`, `invalid`, `null`, `undefined`, `empty`, `edge`, `fail`, `reject`, `boundary`, `out of range`).
6. At least one `expect(`/`assert(` call exists somewhere in the file.

Exits `0` with a `PASS` summary, or `1` with an `ERROR:` line per failed check.
