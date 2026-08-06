# Tend Perf — `data` Module Reference

Loaded only when `data` is in the config's `modules:` list — signal is a SQLite/LibSQL driver (e.g. `@libsql/client`) in dependencies.

## 1. Redundant DB calls executing on every request

The headline check for this module. A DB call whose result doesn't vary per-request (a lookup keyed on something that's effectively constant across the process lifetime — feature flags, config rows, a static lookup table) still gets re-run every time a hot path executes it, when the query could be hoisted to module scope, request-scoped `locals`, or a short-TTL cache.

```bash
grep -rn 'db\.\(get\|execute\|query\)(' src/routes/api --include="+server.ts"
```

```ts
// ✗ re-queries the same config row on every request to this route
export async function GET({ locals }) {
  const settings = await db.get("SELECT * FROM app_settings WHERE id = 1");
  return json({ ...settings, user: locals.user });
}

// ✓ hoist to a short-TTL cache — still correct if the row changes, far fewer round-trips
let settingsCache: { value: AppSettings; expiresAt: number } | null = null;

async function getSettings() {
  if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  const value = await db.get("SELECT * FROM app_settings WHERE id = 1");
  settingsCache = { value, expiresAt: Date.now() + 30_000 };
  return value;
}
```

The provable part is call-count, not a benchmark: trace the call site back to its trigger before deciding this is redundant. A query re-run **on every tick of a polling loop or every message of a hot broadcast path**, gated by nothing that reflects a change in the underlying data, is the pattern to flag. A query that runs once per genuinely distinct request against a table that mutates between requests is correct, not redundant — don't hoist that.

## 2. `getAll()` / large-array deserialization for metadata-only lookups

Calling a driver or ORM's "fetch everything" method (`store.getAll()` on IndexedDB, `SELECT *` with no column list against a table with a large array/blob column, an ORM `.findMany()` with no `select`) forces full deserialization into memory even when the caller only needs a small metadata field — a status flag, a count, a last-updated timestamp.

```ts
// ✗ deserializes every question set in full just to read a status flag
async function getSetStatuses(): Promise<Record<string, string>> {
  const all = await store.getAll(); // each record carries a large questions[] array
  return Object.fromEntries(all.map((s) => [s.id, s.status]));
}

// ✓ decouple metadata into a dedicated lightweight store/column, read that instead
async function getSetStatuses(): Promise<Record<string, string>> {
  const meta = await metaStore.getAll(); // { id, status } only — no questions[]
  return Object.fromEntries(meta.map((m) => [m.id, m.status]));
}
```

This fix touches the schema, not just the query. **If you split metadata into a new store or column, ship the migration in the same change** — an IndexedDB `onupgradeneeded` handler that backfills the new store from existing records, or a SQL migration that backfills the new column. A metadata split with no migration path is a data-loss bug for every existing record on next load, not a perf win. Treat the migration as part of the < 50-line budget, not an optional follow-up; if it can't fit, the fix isn't minimal enough to ship this run — scale it down or flag it instead.

## 3. Cross-check against the core module-level-constant pattern

`references/scan-core.md` §2 covers the general case of hoisting a static computation to module scope (a CSP header object, a config object). This module's §1 is the DB-specific specialization of the same principle — a *query*, not just a computation, being redundantly re-run. Look for both shapes in the same audit; they're often adjacent in the same middleware or route handler, and the fix pattern (hoist to a scope that outlives the per-request/per-tick call) is identical.
