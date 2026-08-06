# Tend Security — `validation` Module Reference

Loaded only when `validation` is in the config's `modules:` list — signal is a schema-validation library (e.g. Effect Schema) in dependencies. Examples below use `Schema.transformOrFail`/Effect-style syntax; substitute this repo's actual validation library's equivalent constructs.

## 1. Independent length caps across parallel transform pipelines

A codebase with multiple schema pipelines that each call the same sanitizer (e.g. a `stripHtmlTags` transform) does **not** get a length cap for free just because one of those pipelines has one. Each `transformOrFail` (or equivalent) is its own independent pipeline — safety on one does not propagate to a structurally similar one added later, especially when they live in the same file and look like copy-paste siblings.

```bash
grep -rn 'transformOrFail\|stripHtmlTags' src/lib/schemas/
```

```ts
// Existing, safe: length-capped
const SanitizedCategoryNameSchema = Schema.String.pipe(
  Schema.transformOrFail(Schema.String, {
    decode: (s) => stripHtmlTags(s),
    encode: (s) => s,
  }),
  Schema.maxLength(60),
);

// ✗ added later, sanitized but with no length cap
const SanitizedAvatarTitleSchema = Schema.String.pipe(
  Schema.transformOrFail(Schema.String, {
    decode: (s) => stripHtmlTags(s),
    encode: (s) => s,
  }),
  // missing Schema.maxLength(...)
);

// ✓ every transformOrFail + stripHtmlTags pair gets its own explicit cap
const SanitizedAvatarTitleSchema = Schema.String.pipe(
  Schema.transformOrFail(Schema.String, {
    decode: (s) => stripHtmlTags(s),
    encode: (s) => s,
  }),
  Schema.maxLength(120),
);
```

Audit every `transformOrFail` + sanitizer pair in the codebase for a follow-up length check — don't stop at the first one found.

## 2. Write-schema length caps must account for the read path, not just the write privilege

A field gated behind a higher-privilege write (curator/admin-only mutation) is not safe from an unbounded-length attack just because the writer is trusted — check whether the same field is later served back out through a lower-privilege or fully public read endpoint (see `references/scan-core.md` §7 for the general principle). A public, cached `GET` that echoes a privileged-write field is a stored-DoS surface: a single oversized write amplifies to every reader.

```ts
// AvatarUpdateSchema — write-side, curator-only
const AvatarUpdateSchema = Schema.Struct({
  title: Schema.String,        // ✗ no maxLength
  description: Schema.String,  // ✗ no maxLength
  category: Schema.String,     // ✗ no maxLength
});
// ...served back out verbatim by GET /api/avatars, unauthenticated, cached 60s
```

```ts
// ✓ cap at the schema boundary regardless of write-side privilege level
const AvatarUpdateSchema = Schema.Struct({
  title: Schema.String.pipe(Schema.maxLength(120)),
  description: Schema.String.pipe(Schema.maxLength(500)),
  category: Schema.String.pipe(Schema.maxLength(60)),
});
```

Sweep for the general pattern: `Schema.optional(Schema.String)` (or bare `Schema.String`) with no `maxLength`, on any field that's ever returned from a `GET` handler. The write-time role check and the read-time exposure are usually defined in different files — trace the field from schema → DB column → response before ruling a write-only privilege check sufficient.

## 3. Numeric fields with no bound — `Schema.Number` is not a constraint

`Schema.Number` (or the equivalent bare numeric type in any schema library) accepts `-1`, `0`, and `1e15` equally. That's rarely what the field actually means. This is a validation-layer gap even before it becomes SQL-specific (see `references/module-data.md` for the `LIMIT -1` consequence when this flows into a query) — the fix belongs at the schema boundary regardless of which data layer eventually consumes the value.

```bash
grep -rn 'Schema\.Number\b' src/lib/schemas/
```

Cross-check pattern: if the same conceptual value appears bounded with `Schema.Literal(...)` in one schema but as a bare `Schema.Number` in a structurally related one, the bare form is very likely a missed case rather than an intentional design choice.

```ts
// One schema in the domain does it right:
const GameStartSchema = Schema.Struct({
  questionsPerRound: Schema.Literal(5, 10, 15, 20),
});

// ✗ a related schema in the same domain left unbounded
const DrawQuestionsSchema = Schema.Struct({
  count: Schema.optional(Schema.Number),
});

// ✓ constrain to the actually-valid range
const DrawQuestionsSchema = Schema.Struct({
  count: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThan(0), Schema.lessThanOrEqualTo(100)),
  ),
});
```

## 4. Arrays need both a per-item cap AND a `maxItems` cap

A per-item sanitizer/length-check does not bound the number of items. An array field with `minItems` but no `maxItems` lets a caller submit an unbounded *count* of otherwise-individually-valid items — the aggregate size is the actual attack surface, and it matters most when the stored array is later re-emitted verbatim to every reader (see `references/module-realtime.md` §2 for the broadcast-amplification consequence).

```bash
grep -rn 'Schema\.Array(' src/lib/schemas/ | grep -v 'maxItems'
```

```ts
// ✗ minItems present, maxItems absent — item count is unbounded
const StandardCustomQuestionSchema = Schema.Struct({
  answers: Schema.Array(AnswerItemSchema).pipe(Schema.minItems(2)),
});

// ✓ bound cardinality independently of per-item size
const StandardCustomQuestionSchema = Schema.Struct({
  answers: Schema.Array(AnswerItemSchema).pipe(Schema.minItems(2), Schema.maxItems(8)),
});
```

Treat every writer role as a potential source of this, not just anonymous/low-privilege users — a trusted role (curator, admin) submitting an oversized array is exactly as capable of triggering downstream amplification, and schema-level bounds must guard both size and count regardless of who's authenticated as the writer.

## 5. Sanitization parity across structurally similar endpoints

When two API endpoints operate on the same kind of data (e.g. `/api/categories` and `/api/topics`, or `/api/admin/categories` vs. its non-admin counterpart), a sanitizer or validator applied to one is not automatically applied to the other — each was written or extended independently, and "the same kind of data" is a property a reviewer has to notice, not something the type system enforces across separate schema files.

```bash
grep -rln 'stripHtmlTags\|sanitize' src/lib/schemas/
```

Audit all endpoints/schemas handling the same entity type for the same input-handling logic. Finding one unsanitized sibling of an already-sanitized endpoint is a strong signal to check the rest of that entity's write paths, not just the one reported.
