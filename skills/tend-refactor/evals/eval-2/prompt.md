This repo's `.claude/tend/config.yaml` has `modules: []` (none active). Run a refactor scan focused on type-safety on `src/lib/` and fix the highest-priority issue.

`src/lib/api/handle-error.ts` contains `function toMessage(err: any) { return err.message; }`. An identical `(err: any)` parameter pattern also appears in `src/lib/sse/reconnect.ts`'s `logError` function, used the same way. A type `AppError { message: string; code: string }` is already exported from `src/lib/types.ts` and matches the shape both functions actually use.
