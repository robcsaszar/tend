# Tend Security — `auth` Module Reference

Loaded only when `auth` is in the config's `modules:` list — a local token-signing/verifying function, custom session handling, or direct `crypto` usage for auth purposes. A third-party auth library dependency alone is a weaker signal; confirm there's custom code wrapping it before treating this module as active.

## 1. Timing-safe comparison

Any user-supplied value compared against a secret-derived value (an HMAC signature, a password hash, an API key) must use a timing-safe comparison. A regular `!==`/`===` string comparison short-circuits on the first mismatched byte, which gives an attacker a low-noise timing oracle to brute-force the correct value one byte at a time — especially dangerous when the comparison sits in front of any rate limiter (e.g. in an auth middleware that runs before request throttling).

```bash
grep -rn 'signature\s*!==\|token\s*!==\|hmac\s*!==\|===\s*expected' src/
```

```ts
// ✗ regular string comparison — timing oracle
function verifyToken(signature: string, expected: string): boolean {
  return signature === expected;
}

// ✓ timing-safe, with a length check first
import { timingSafeEqual } from "node:crypto";

function verifyToken(signature: string, expected: string): boolean {
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — checking length first avoids
  // that throw becoming its own (cheap, but real) side channel.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

This is easy to miss precisely because the surrounding code "looks right" — the signature is computed correctly, the comparison is present, only the comparison's timing characteristics are the vulnerability. It only ever appears where a codebase rolls its own signing/verification; standard JWT libraries handle this internally.

## 2. Credential fields on dual-duty DTOs

A domain object designed to carry both public display fields (nickname, avatar, score) and private credential fields (an auth token, a device fingerprint) on the *same* type is a silent leak waiting for a serialization boundary. The object looks safe in memory; the danger appears the moment any code path spreads or shallow-copies it into a `Response` body, a `JSON.stringify`, or a broadcast payload — see `references/module-realtime.md` §1 for the broadcast-specific version of this same root cause.

```bash
grep -rn '\.\.\.\(player\|user\|session\)\b' src/ --include="*.ts"
```

```ts
// Domain type mixes public and private fields on one object:
interface Player {
  nickname: string;
  avatar: string;
  score: number;
  token?: string;      // auth credential
  deviceId?: string;    // fingerprint
}

// ✗ spread copies everything, including token/deviceId, into an API response
function lobbySnapshot(lobby: Lobby) {
  return { players: lobby.players.map((p) => ({ ...p })) };
}

// ✓ enumerate the public projection explicitly at the boundary
function publicPlayer(p: Player) {
  return { nickname: p.nickname, avatar: p.avatar, score: p.score };
}
function lobbySnapshot(lobby: Lobby) {
  return { players: lobby.players.map(publicPlayer) };
}
```

**Audit every `{ ...internalObj }` that ends up in a `Response` body, a broadcast, or a log line.** A spread is easy to mistake for "a safe copy" — it copies structure, not a security boundary. If a type is ever `JSON.stringify`'d or spread anywhere outside strictly internal server state, treat every field on it as potentially public and require an explicit projection function at that boundary rather than a bare spread. Keep the credential itself in a separate internal store (e.g. `Map<playerId, token>`) instead of on the public-facing entity type wherever that's feasible — it removes the leak vector at the type level instead of relying on every call site remembering to project.

## 3. IDOR via pass-through auth

A shared auth wrapper (middleware, a `withAuth`/`withSession`-style handler decorator) that verifies *a* session exists and forwards the raw auth result to the handler is intentionally flexible — but that flexibility means each handler is individually responsible for checking the session actually belongs to the resource it's about to act on. A field like `auth.playerId` being present on the auth result does not mean any handler is actually comparing it against a request-supplied identifier.

```bash
grep -rln 'withAuth\|withSession\|withLobby' src/routes --include="+server.ts"
```

```ts
// ✗ accepts any playerId from the request body, never checks it against the caller
export const POST = withAuth(async ({ request, auth }) => {
  const { playerId, role } = await request.json();
  await setPlayerRole(playerId, role); // any player can change any other player's role
});

// ✓ assert identity before acting on a self-service resource
export const POST = withAuth(async ({ request, auth }) => {
  const { playerId, role } = await request.json();
  if (auth.playerId !== playerId) {
    return new Response("Forbidden", { status: 403 });
  }
  await setPlayerRole(playerId, role);
});
```

For endpoints that are legitimately privileged (a curator/admin acting on another user's resource), use a stricter wrapper (`withCurator`/`withAdmin`) rather than the generic pass-through wrapper — don't rely on the handler body alone to draw that line.

## 4. Spoofable IP headers

`X-Forwarded-For` is an append chain; the **leftmost** entry is whatever the original client sent, and is fully attacker-controlled. Using it as a rate-limit key (or any other trust decision) lets an attacker rotate a fake IP on every request and get a fresh bucket each time, defeating every limiter keyed on it.

```bash
grep -rn 'x-forwarded-for\|X-Forwarded-For' src/ --include="*.ts" -i
```

```ts
// ✗ leftmost XFF entry is client-supplied, trivially spoofed
function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
}

// ✓ prefer the platform-injected header behind that specific proxy/CDN
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ?? // Cloudflare
    request.headers.get("fly-client-ip") ??      // Fly.io
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown"
  );
}
```

Generalize: whichever edge platform actually fronts this deployment injects its own header that the client cannot set (`CF-Connecting-IP` on Cloudflare, `Fly-Client-IP` on Fly.io, similar on other platforms) — that header is authoritative; `X-Forwarded-For` is only a fallback for environments with no such platform in front, and even then should be treated as low-trust. This is a common mistake when IP-extraction code is ported from a non-proxied deployment into a proxied one.
