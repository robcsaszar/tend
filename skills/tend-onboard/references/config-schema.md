# `.claude/tend/config.yaml` Schema

One file per consumer repo, written by `tend-onboard` and read (never written) by every other `tend-*` skill's Phase 0. Fixed path, no discovery magic — a skill that can't find this file at exactly `.claude/tend/config.yaml` runs at core tier, it does not search elsewhere.

## Shape

```yaml
skills:
  security:
    off-limits: []
    notes: []
  perf:
    off-limits: []
    notes: []
  refactor:
    off-limits: []
    notes: []
  a11y:
    off-limits: []
    notes: []
  tests:
    off-limits: []
    notes: []
modules: []
```

## Fields

- **`skills.<name>`** — one entry per scanning skill (`security`, `perf`, `refactor`, `a11y`, `tests`). `tend-docs` and `tend-onboard` don't read a `skills.*` section — docs is dogfood-only and onboard is the writer, not a reader.
  - **`off-limits`** — a list of glob strings, additive to each skill's built-in conservative rails (never touch lockfiles, CI config, `.env`, project config, regardless of this list). Empty by default.
  - **`notes`** — a list of freeform strings, journal-style learnings specific to this repo. Read as context, never as instructions to follow blindly. Empty on first install.
- **`modules`** — a flat list of zero or more of: `data`, `validation`, `realtime`, `auth`, `feature-flags`. Determines which module reference packs the scanning skills load in their Phase 2 (progressive disclosure — a skill never loads a module's reference pack for a module not in this list).

## Grammar constraint (why the validator can be zero-dependency)

This schema deliberately uses only a **constrained YAML subset** so `scripts/validate-config.mjs` can hand-parse it without a YAML library dependency: 2 levels of nesting maximum, only flat string lists (`[]` or one string per `- ` line) and plain scalar values, no anchors, no multiline strings, no flow-style mixed with block-style at the same level. If you need anything beyond this shape, it doesn't belong in this file — use a skill's `off-limits`/`notes` lists as the extension point instead of inventing new structure.

## No-config behavior

A skill invoked with no `config.yaml` present (or a config that fails validation) runs at **core tier**: core SvelteKit + TS assumptions only, no modules, empty `notes`, and the conservative built-in off-limits rails (never touch lockfiles, CI, `.env`, config) apply regardless. It emits one hint — "run `tend-onboard` to sharpen" — and continues. No-config is a supported, ungated first-run experience, not an error state.
