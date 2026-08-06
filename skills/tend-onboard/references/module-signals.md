# Capability Module Signals

Five modules, two activation mechanisms. Dependency-detectable modules auto-activate on a confirmed dependency alone. Pattern-only modules need a clear code signature — a version string in `package.json` proves nothing about how (or whether) the code actually uses the risky surface.

---

## Dependency-detectable (auto-activate on confirmed dep)

### `data`

**Signal:** `@libsql/client` (or equivalent SQLite/LibSQL driver) in `package.json` dependencies.

**What it sharpens:** DB-init boilerplate that should live in middleware/`locals` instead of being repeated per-route; numeric-bound footguns specific to SQLite (`LIMIT -1` meaning "no limit," not "zero rows"); redundant per-request or per-tick DB calls that could be hoisted or cached.

### `validation`

**Signal:** `effect` (Effect Schema) in `package.json` dependencies.

**What it sharpens:** missing length caps / `maxItems` bounds on user-submitted fields; `Schema.transformOrFail` pipelines that call a sanitizer (e.g. `stripHtmlTags`) without a length cap on the input; a `Schema.Number` used where a `Schema.Literal` union would actually constrain the value; unbounded fields that get serialized into a broadcast/response and could amplify.

### `realtime`

**Signal:** a WebSocket dependency, or `new WebSocket(` / a WS server setup in source.

**What it sharpens:** reconnect logic missing backoff or an attempt cap (thundering-herd risk); credential or internal-state leakage via broadcast payloads (any object that's `JSON.stringify`'d or spread into a broadcast should be treated as public); broadcast amplification from unbounded per-client fields.

---

## Pattern-only (needs a code signature — ask before activating if unclear)

### `auth`

**Signal:** a local token-signing/verifying function (e.g. `signToken`/`verifyToken`), custom session handling, or direct `crypto` usage for auth purposes. A third-party auth library dependency is a weaker signal on its own — confirm there's custom code around it before activating.

**What it sharpens:** non-timing-safe comparisons where a timing-safe one is needed (`crypto.timingSafeEqual` vs `!==` against a secret-derived value — decode both sides to a `Buffer` and compare lengths first, since `timingSafeEqual` throws on length mismatch, which itself leaks length); credential fields present on objects that are also used as DTOs (spread into responses/broadcasts); IDOR via pass-through auth (a wrapper that checks *a* session exists but not that it belongs to the resource owner); trusting a spoofable IP header (`X-Forwarded-For`'s leftmost entry is client-supplied) over a platform-verified one (e.g. `CF-Connecting-IP` behind Cloudflare, `Fly-Client-IP` on Fly.io).

### `feature-flags`

**Signal:** a local feature-flags module, constants file, or naming convention (`FEATURE_*`, a flags object/enum) referenced from both markup and route handlers.

**What it sharpens:** UI-gated checks that aren't mirrored server-side (a flag hides a button but the handler still accepts the request — the gap appears naturally because a developer adds the render guard and forgets the corresponding backend guard); stale/orphaned flags whose gated code is effectively dead; flag-gated paths left without cleanup after the flag is fully rolled out.

---

## Folded into core (not modules — no separate activation)

- **Deploy/CSP hygiene** — no clean generic activation signal across hosts; treated as core `tend-security` scope regardless of stack.
- **i18n, Svelte 5 runes, Biome, Vitest, pnpm** — assumed present in the SvelteKit + TS core tier; not conditional.
