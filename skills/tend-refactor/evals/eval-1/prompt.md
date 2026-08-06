No `.claude/tend/config.yaml` exists in this repo. Run a refactor scan on `src/lib/utils/` and fix the highest-priority issue you find.

`src/lib/utils/slug.ts` exports `slugify()`, imported by 3 files under `src/routes/`. `src/lib/utils/format.ts` contains an identical inline implementation of the same slugify logic (copy-pasted, not imported), used by 2 files under `src/components/`.
