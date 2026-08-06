# Tend Refactor — `validation` Module Reference

Loaded only when `validation` is in the config's `modules:` list — signal is a schema-validation library (e.g. Zod, Effect Schema, Valibot) in dependencies. This module is a flavor of `references/scan-core.md` §1 (dead code & duplication removal), applied specifically to the validation layer — it is not a separate priority tier.

## 1. Duplicated validation/schema-transform pipelines → one reusable piece

The same shape of validation logic re-implemented across multiple schemas — the same sanitizer, the same length cap, the same transform chain — is duplication in the schema layer, and the fix is the same as any other duplication finding: consolidate into one reusable piece and have every site call it.

```bash
grep -rn 'transformOrFail\|\.pipe(' src/lib/schemas/
```

```ts
// ✗ the same sanitize-then-cap pipeline, copy-pasted per field
const CategoryNameSchema = Schema.String.pipe(
  Schema.transformOrFail(Schema.String, {
    decode: (s) => stripHtmlTags(s),
    encode: (s) => s,
  }),
  Schema.maxLength(60),
);

const TopicNameSchema = Schema.String.pipe(
  Schema.transformOrFail(Schema.String, {
    decode: (s) => stripHtmlTags(s),
    encode: (s) => s,
  }),
  Schema.maxLength(60),
);
```

```ts
// ✓ one reusable factory, parameterized on the one thing that actually varies (the cap)
function sanitizedString(maxLength: number) {
  return Schema.String.pipe(
    Schema.transformOrFail(Schema.String, {
      decode: (s) => stripHtmlTags(s),
      encode: (s) => s,
    }),
    Schema.maxLength(maxLength),
  );
}

const CategoryNameSchema = sanitizedString(60);
const TopicNameSchema = sanitizedString(60);
```

## 2. Proof standard for this pattern

Same as the base tier: grep evidence of the identical (or near-identical, differing only in a parameter like the length cap) pipeline appearing in **2+ schema definitions** minimum. Only parameterize what actually varies between the instances you found — don't add a configuration option "for flexibility" that no existing instance actually needs; that's scope creep from a dedup fix into a speculative abstraction, which this skill doesn't do (see `scan-core.md` §3e for the same discipline applied to component props).

This ties back to the base tier's duplication discipline applied one layer down: a validation pipeline is source code like any other, and "the same transform chain typed out twice" is exactly as much a duplication finding as two components with the same markup or two routes with the same DB-init call.
