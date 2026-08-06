# Tend Refactor — `data` Module Reference

Loaded only when `data` is in the config's `modules:` list — signal is a database driver/client (e.g. `@libsql/client`, `postgres`, `better-sqlite3`) in dependencies. This module is a flavor of `references/scan-core.md` §1 (dead code & duplication removal), applied specifically to database-connection boilerplate — it is not a separate priority tier.

## 1. Repeated DB-init boilerplate → shared middleware/locals init

A database client constructed independently inside multiple route handlers (or multiple `+server.ts` files) is duplication with a specific, mechanical fix: attach it once in the framework's central request hook and read it back from context on every handler, instead of re-running the same construction logic per request.

```bash
grep -rn 'createClient(\|new Database(\|connect(' src/routes/ --include="*.ts" | grep -v node_modules
```

```ts
// ✗ every +server.ts constructs its own client
// src/routes/api/categories/+server.ts
import { createClient } from "@libsql/client";
export async function GET() {
  const db = createClient({ url: DATABASE_URL, authToken: DATABASE_TOKEN });
  return json(await db.execute("SELECT * FROM categories"));
}

// src/routes/api/topics/+server.ts — the exact same construction, copy-pasted
import { createClient } from "@libsql/client";
export async function GET() {
  const db = createClient({ url: DATABASE_URL, authToken: DATABASE_TOKEN });
  return json(await db.execute("SELECT * FROM topics"));
}
```

```ts
// ✓ construct once in the central request hook, attach to locals
// src/hooks.server.ts
import { createClient } from "@libsql/client";

const db = createClient({ url: DATABASE_URL, authToken: DATABASE_TOKEN });

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.db = db;
  return resolve(event);
};
```

```ts
// ✓ every handler reads the shared instance instead of constructing its own
// src/routes/api/categories/+server.ts
export async function GET({ locals }) {
  return json(await locals.db.execute("SELECT * FROM categories"));
}
```

## 2. Proof standard for this pattern

Same as the base tier: grep evidence of the construction call appearing in **2+ route handlers** minimum. A single handler constructing its own client is not duplication on its own — it only becomes a finding once a second, structurally identical construction shows up elsewhere. Migrate every call site you can find in the same run's scope; if the fix is the shared-init change itself (in the central hook) plus updating call sites to read from `locals`, that is still one atomic change — the consolidation and its consumers move together, the same way a superseded-helper migration does in the base tier.

Don't confuse this with a request-scoped resource that legitimately needs per-request construction (e.g. a request-scoped transaction) — this pattern applies specifically to a client/connection that is safe to share across requests and is being re-constructed identically each time out of habit, not out of a real per-request requirement.
