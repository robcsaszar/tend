# Safety notes

Four skills in this pack ship a small validator script. All four are zero-dependency Node scripts that only read files and report pass/fail: none of them write files, make network calls, or execute anything beyond their own validation logic. This document describes what each one does.

## `tend-onboard/scripts/validate-config.mjs`

Reads `.claude/tend/config.yaml` and checks it against the schema in `references/config-schema.md`: a hand-rolled parser for the deliberately constrained YAML subset the schema uses (no external YAML library). Exits `0` on a valid config, `1` on structural errors (unknown keys, wrong types, unknown skill/module names), with each error printed to stderr.

## `tend-security/scripts/validate-finding.mjs`

Reads a single finding object (the skill's own output describing one security issue) and validates its shape against `assets/finding-schema.json`, plus a few filesystem checks: the referenced file exists, the referenced line is within range, and the exploit/fix fields aren't empty or identical placeholders. Exits `0`/`1`.

## `tend-refactor/scripts/validate-finding.mjs`

Same pattern as the security validator, extended to cover three finding "kinds" (dead-code removal, type-tightening, component-extraction) since refactor findings take different shapes depending on which sub-domain triggered them. Reads `assets/finding-schema.json`. Exits `0`/`1`.

## `tend-tests/scripts/validate-test-shape.mjs`

Checks a proposed new test file references the target function and contains both a happy-path and an edge-case test block with a real assertion call: a structural sanity check, not a test runner. Exits `0`/`1`.

## Everything else

`tend-onboard`, `tend-a11y`, `tend-docs` (no scripts beyond the ones above) contain only Markdown and, where noted, the validators above. No skill in this pack makes network calls, installs dependencies, or touches files outside your project's working tree: every fix is left as an uncommitted diff for you to review.
