# Tend Security — Core Scan Reference

Always-on checks, regardless of which capability modules are active. Loaded in Phase 1, before any module pack. Examples below use generic names — substitute this repo's actual component/route/schema names.

## Priority ladder

Scan in this order. Stop at the first real, evidence-backed hit — do not keep scanning once one is selected.

**CRITICAL**
- Hardcoded secrets, API keys, tokens in source
- Unsanitized input used in queries, shell commands, or file paths
- Sensitive data (tokens, passwords, PII) in logs or error responses
- Missing authentication on protected endpoints
- Missing authorization — one user accessing another user's data

**HIGH**
- XSS — unsanitized input rendered as HTML
- Missing input validation at API boundaries
- Insecure session/token handling
- Missing or misconfigured security headers (CSP, X-Frame-Options, etc.)
- Overly permissive CORS

**MEDIUM**
- Stack traces or internal errors leaking to clients
- Missing input length limits (DoS risk)
- Weak entropy in security-sensitive random values

**ENHANCEMENTS** (only if nothing above is found)
- Missing sanitization on an input that is rendered
- Error messages leaking implementation details
- Missing rate limiting on a sensitive endpoint

A finding must clear all three bars from SKILL.md §3 (file:line, exploit path, minimal fix) before it counts as "found" — an unverifiable CRITICAL-shaped hunch is not a finding, it's a lead. Drop to the next-lower real hit instead.

---

## 1. XSS — raw-HTML rendering of user/DB data

The direct injection surface in a Svelte template is `{@html ...}`. Any value passed to it that ever originated from user input or DB storage (even if written by a trusted role — curators, admins) is a rendering-time XSS unless explicitly sanitized immediately before the render.

```bash
grep -rn '{@html' src/ --include="*.svelte"
```

```svelte
<!-- ✗ unsanitized DB-originated string rendered as HTML -->
<div>{@html category.description}</div>

<!-- ✓ sanitize immediately before render -->
<div>{@html sanitizeHtml(category.description)}</div>
```

**The injection point is often one hop away from the `{@html}` call.** A helper/getter that *composes* an HTML string from DB-sourced fields (e.g. `` `<strong>${category.name}</strong>` ``) and returns it for a caller to render is just as much the vulnerability as the template line itself — sanitize at the point the string is assembled, not just where it's rendered. Server-side escaping on the way into the page does not help if the HTML is built client-side, after the fact, from a value that was already unescaped for that purpose.

```ts
// ✗ getter returns an HTML fragment built from DB-sourced, curator-editable data
function topCategoryHint(category: Category) {
  return `<strong>${category.name}</strong> is trending`;
}
// ...later, rendered via {@html topCategoryHint(category)}

// ✓ return plain text; let the template escape it, or sanitize explicitly if HTML is required
function topCategoryHint(category: Category) {
  return `${category.name} is trending`;
}
```

**A second injection context: attributes a client-side library evaluates as JS.** SvelteKit's own template escaping (and any server-side escaping) protects the *HTML* context. It does not protect an attribute whose value is then parsed and executed as JavaScript by a separate client-side library — e.g. an Alpine.js-style `x-data` directive, a custom action that `eval`s a string attribute, or any `data-*`-adjacent convention where a library treats the attribute's content as code rather than data. If a repo wires up a library like that, treat every server-interpolated value flowing into one of its directive attributes as a second, independent XSS surface — HTML-escaping the outer attribute does not sanitize the inner JS-eval.

```svelte
<!-- ✗ server-interpolated value flows into an attribute a client library evaluates as JS -->
<div x-data={`profileAvatar('${avatarId}')`}>

<!-- ✓ pass data via a plain data- attribute; read it back through the DOM, not string-interpolated code -->
<div data-avatar-id={avatarId} use:profileAvatar>
```

## 2. Hardcoded secrets

```bash
grep -rniE '(api[_-]?key|secret|token|password)\s*[:=]\s*["\x27][A-Za-z0-9_\-]{12,}["\x27]' src/
```

A literal credential in source is CRITICAL regardless of whether the file is committed to a public or private repo — private-repo access controls are not a substitute for not committing the secret.

## 3. Missing authN / authZ on protected endpoints

Protecting a UI route does not automatically protect its backing API route — an attacker can always bypass the client and call the endpoint directly. For every route under a protected UI section, confirm the corresponding `+server.ts`/API handler independently enforces the same check (session present AND scoped to the right user/role), not just that the page component redirects unauthenticated visitors.

```bash
grep -rln 'export async function \(GET\|POST\|PUT\|PATCH\|DELETE\)' src/routes --include="+server.ts"
```

Cross-check each hit against the repo's central auth-guard mechanism (middleware, a `ROUTE_GUARDS` table, a `locals.session` check) — a handler with no matching guard entry, and no inline check, is a missing-authZ finding.

**Sanitization parity across parallel endpoints is the same class of gap.** When a codebase has two endpoints operating on structurally similar data (e.g. `/api/categories` and `/api/topics`), a sanitizer applied to one is not applied to the other unless someone explicitly ported it — replicated functionality between endpoints routinely misses security parity because each was written (or extended) independently. Audit every endpoint that writes the same *kind* of entity for the same input handling, not just the one that was reported.

## 4. Sensitive data in logs/responses

```bash
grep -rn 'console\.\(log\|error\|warn\)(' src/ | grep -iE 'token|password|secret|session'
```

A response body or a server log line that includes a raw token, password, or full session object is CRITICAL even if the log is server-only — server logs get shipped to third-party aggregators more often than teams expect.

## 5. Unbounded KDF input (DoS)

Any function that runs a password-hashing KDF (scrypt, bcrypt, Argon2) must validate the input length **before** calling the KDF — not only at whatever call site happens to invoke it today. A KDF is deliberately expensive; an unbounded input (e.g. a multi-megabyte string posted to a signup/login form with no upstream rate limiter) turns one request into several seconds of CPU, and every current and future caller of the function inherits the gap if the cap isn't enforced inside it.

```ts
// ✗ no length guard — cost scales with attacker-controlled input size
async function hashPassword(password: string) {
  return scrypt(password, salt, 64);
}

// ✓ cap well above any realistic password, well below the cost cliff
async function hashPassword(password: string) {
  if (password.length > 1000) throw new Error("password too long");
  return scrypt(password, salt, 64);
}
```

Note this is complementary to, not a substitute for, rate limiting — a rate-limited endpoint is still not safe if a single call is itself expensive enough, and an unlimited endpoint is not safe just because typical inputs are cheap.

## 6. CSP hygiene / ghost dependencies

CSP directives set to support a specific library do not self-heal when that library is removed — a permissive directive (`'unsafe-eval'`, a wide `script-src` allowance) can silently outlive the code that required it.

```bash
grep -rn 'unsafe-eval\|unsafe-inline' src/ svelte.config.* vite.config.* 2>/dev/null
```

A useful signal: a **type declaration for a removed library still present** (`Window` global augmentation, an ambient `.d.ts`) with no corresponding runtime import anywhere in the codebase. Type-only declarations leave no runtime footprint, so their survival gives no signal on its own that the library is gone — but if you find one, treat it as a prompt to also check whether CSP directives, script tags, or polyfills tied to that same library are similarly stale.

## 7. Threat-model-by-read-path (general principle)

Evaluate a writable field's risk against the audience of **its read path**, not its write path. A field gated behind a trusted-role write (curator/admin only) can still be a public-facing DoS or exposure vector if the data it produces is served back out through an unauthenticated or public-cached GET endpoint. The write-side privilege check tells you nothing about the read side — check both hops, in different files if necessary, before concluding a field is safe because "only trusted roles can set it."

This principle recurs concretely in `references/module-validation.md` (length caps on write-schemas serving public GETs) and `references/module-realtime.md` (amplification via public broadcast of writer-supplied fields) — read those when the corresponding module is active.
