# Tend Docs — Scan Reference

Generic pattern names below stand in for whatever this repo actually calls its reference doc and contract directory — substitute the real paths once identified in Phase 1.

## 1. Track 1 — reference-doc-vs-code (bidirectional)

```bash
# List actual artifacts, recursing into subdirectories
find src/lib/components -name "*.svelte" | sort > /tmp/actual-components.txt
# Diff against the path/name column in the reference doc (e.g. docs/reference.md)
```

Bidirectional means literally running the diff both ways:

1. **Artifact → doc:** for every real file found, is there a matching row in the reference doc? No row → missing-doc drift (add an entry).
2. **Doc → artifact:** for every row in the reference doc, does a matching file still exist? No file → stale-doc drift (remove or correct the entry).

**Before/after — stale entry removal:**

```diff
 | Component | Path | Purpose |
 |---|---|---|
 | Button | `src/lib/components/ui/Button.svelte` | Primary action control |
-| LegacyModal | `src/lib/components/ui/LegacyModal.svelte` | Confirmation dialog |
+<!-- LegacyModal.svelte was removed in the Dialog migration; row deleted -->
```

**Known blind spot:** always glob recursively (`**/*.ext`), not just the top-level directory — nested/partial component directories are routinely missed by a shallow `ls`-style listing. A common drift pattern is a migration that moves or renames a file's *implementation* (e.g. a framework migration, or splitting one file into a directory of partials) while the doc still lists the old flat path.

## 2. Track 2 — API-contract-vs-endpoint drift

```bash
find src/routes/api -name "*.ts" | sort   # or wherever route handlers live
find contracts -name "*.bru" -o -name "*.json" | sort   # or wherever the contract collection lives
```

A match is the same HTTP method + path appearing in both a route handler and a contract file. Flag:

- A route handler with no corresponding contract entry.
- A contract entry for a route that no longer exists.

**Schema cross-check (higher value than presence/absence):** for a matched pair with a request/response body, compare the contract's body shape against the real schema/type definition in code (a validation schema, a TypeScript interface, a DTO). The most common *silent* mismatch is a shape confusion that presence-checking alone won't catch:

```diff
 // contract file body
 {
-  "items": [{ "text": "..." }]
+  "items": { "left": ["..."], "right": ["..."] }
 }
```

```ts
// actual schema in code — the contract above was written against an older shape
const ItemsSchema = Schema.Struct({
  left: Schema.Array(Schema.String),
  right: Schema.Array(Schema.String),
});
```

Also watch for field renames that survive a DB/model unification but not an API rename (e.g. a contract still sends `id` where the handler now expects `resourceId`).

## 3. Track 3 — cross-doc consistency

```bash
grep -n "role\|default\|permission" docs/flows/FlowA.md
grep -n "role\|default\|permission" docs/flows/FlowB.md
```

Contradictions between two docs describing the same feature from different perspectives are a reliable signal of drift — one of them fell out of sync with a later change. Before editing either doc, find the ground-truth source (the actual implementation the docs are describing, e.g. a store, a config module, a permissions table) and confirm which side is correct.

```text
FlowA.md: "New players default to the Observer role."
FlowB.md: "New players default to the Participant role."
→ ground truth: src/lib/roles.ts assignDefaultRole() returns "observer"
→ FlowB.md is stale; fix FlowB.md, leave FlowA.md untouched
```

## 4. Entry-format matching

When adding or correcting a doc/contract entry, match the existing style exactly rather than introducing a new format:

- Reference-doc rows: same columns, same minimum fields (name, path, purpose, key props/params) as the surrounding rows.
- Contract files: same structural conventions as sibling files in the same directory (metadata block, auth header pattern, ordering field) — create a new subfolder only if the existing structure clearly calls for one.

## 5. Starting grep/glob sweep

```bash
find <component-or-module-dir> -type f -name "*.<ext>" | sort
find <api-route-dir> -type f -name "*.ts" | sort
find <contract-dir> -type f | sort
grep -n "<shared-flow-keyword>" <flow-doc-a> <flow-doc-b>
```
