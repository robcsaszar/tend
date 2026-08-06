# Tend Security — `data` Module Reference

Loaded only when `data` is in the config's `modules:` list — signal is a SQLite/LibSQL driver (e.g. `@libsql/client`) in dependencies.

## 1. `LIMIT -1` and other database-specific numeric footguns

A numeric field that reaches a raw SQL `LIMIT`/`OFFSET` clause needs bounds enforced *before* it gets there — an unbounded or loosely-typed numeric schema field (see `references/module-validation.md` §3 for the schema-layer version of this gap) can carry a value whose meaning is database-specific and non-obvious even to an experienced reviewer.

SQLite specifically treats `LIMIT -1` as **"no limit"**, not "zero rows" — a value that reads as obviously-invalid-and-therefore-safe (a negative number) is actually the most dangerous value a caller could send for this clause. This is not widely known outside people who've specifically hit it in SQLite.

```bash
grep -rn 'LIMIT ?\|LIMIT \$\|\.limit(' src/lib/ src/routes/ --include="*.ts"
```

```ts
// count comes from request input, typed as Schema.optional(Schema.Number) —
// looks constrained because a LIMIT clause is present, but isn't.
async function drawQuestions(count: number) {
  return db.execute("SELECT * FROM questions ORDER BY RANDOM() LIMIT ?", [count]);
  // count = -1 → SQLite returns the entire table, not zero rows
}
```

```ts
// ✓ constrain at the boundary before the value ever reaches SQL —
// int, positive, and capped to a sane upper bound.
async function drawQuestions(count: number) {
  const safeCount = Math.max(1, Math.min(Math.trunc(count), 100));
  return db.execute("SELECT * FROM questions ORDER BY RANDOM() LIMIT ?", [safeCount]);
}
```

The code *looks* safe on a skim because a `LIMIT` clause is visibly present — the vulnerability is in what a specific out-of-range input value means to this specific database engine, not in the absence of a clause. Treat this as a reason to double-check, not skip, numeric fields that already have a `LIMIT`/`OFFSET` clause wrapped around them.

## 2. Cross-check against the validation layer

This module's finding is almost always paired with a `references/module-validation.md` §3 finding — the actual fix is usually a schema-level constraint (`Schema.int()`, `Schema.greaterThan(0)`, a reasonable upper bound) applied before the value is ever passed to the query function, not a defensive check re-implemented inside every function that happens to run a `LIMIT` query. Fix once, at the schema boundary; a query-site clamp is an acceptable belt-and-braces addition but should not be the *only* fix, since it has to be repeated at every call site that forgot it.
