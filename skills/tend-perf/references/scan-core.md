# Tend Perf — Core Scan Reference

Always-on checks, regardless of which capability modules are active. Loaded in Phase 1, before any module pack. Examples below use generic names — substitute this repo's actual component/route/schema names.

Every finding here must clear the same bar: **provable from static code inspection alone.** If the only argument you can make for a check below is "this should be faster" without an algorithmic, call-count, or allocation-count reason attached, it isn't a finding yet — keep reading the code until you can name the mechanism, or move on.

## Priority ladder

Scan in this order. Stop at the first real, evidence-backed hit — do not keep scanning once one is selected.

1. **O(n²) or worse algorithms with a clear O(n) alternative** — cost scales with input size; the largest blast radius as data grows.
2. **Redundant calculation or allocation inside hot loops or per-request middleware** — paid on every iteration/request even though the value doesn't change.
3. **Missing debounce/throttle on high-frequency DOM events** (scroll, input, resize) — see `references/module-realtime.md` for the WS/SSE-tick specialization.
4. **Repeated `$derived` filters re-traversing the same reactive array** — a Svelte 5 anti-pattern that multiplies traversal cost by the number of independent filters.
5. **Images missing `loading="lazy"` or served uncompressed.**
6. **Hand-rolled primitives with a faster native equivalent** (e.g. 32-bit multiply-with-carry vs. `Math.imul`) — narrow, but a clean example of "use the platform primitive."

---

## 1. O(n²) algorithms with a clear O(n) alternative

The classic shape: a nested loop or a `.find()`/`.filter()` called inside a `.map()`/`.forEach()` over the same or a related collection, where a single pre-pass (a `Map` keyed by the lookup field) would make the inner lookup O(1).

```bash
grep -rn '\.map(\|\.forEach(' src/ --include="*.ts" -A3 | grep -B3 '\.find(\|\.filter('
```

```ts
// ✗ O(n²) — for every session, linearly scans every player to find a match
function attachPlayerNames(sessions: Session[], players: Player[]) {
  return sessions.map((s) => ({
    ...s,
    playerName: players.find((p) => p.id === s.playerId)?.name ?? "unknown",
  }));
}

// ✓ O(n) — one pass builds the lookup, one pass consumes it
function attachPlayerNames(sessions: Session[], players: Player[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return sessions.map((s) => ({
    ...s,
    playerName: byId.get(s.playerId)?.name ?? "unknown",
  }));
}
```

The provable claim: state both complexity classes and name the collections ("O(n·m) scan of players per session → O(n+m) with a Map lookup"). A nested loop over two collections that are both bounded to a handful of items (e.g. iterating a fixed-size settings object) is not a finding — the mechanism has to matter at realistic scale.

## 2. Redundant calculation inside hot loops or per-request middleware

A value that doesn't depend on per-iteration or per-request state (a static config object, a computed constant, a compiled regex) but is rebuilt every time the loop body or middleware function runs. The fix is almost always: hoist it to module scope, or compute it once and pass it in.

```bash
grep -rn 'export function handle\|export async function handle' src/hooks.server.ts
```

```ts
// ✗ rebuilt on every request even though nothing here depends on the request
export function handle({ event, resolve }) {
  const csp = buildCspHeader({
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  });
  event.locals.csp = csp;
  return resolve(event);
}

// ✓ built once at module load; middleware just references it
const CSP_HEADER = buildCspHeader({
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
});

export function handle({ event, resolve }) {
  event.locals.csp = CSP_HEADER;
  return resolve(event);
}
```

Verify the value genuinely doesn't depend on request/loop-iteration context before hoisting — a per-user or per-request-varying value hoisted to module scope isn't a perf fix, it's a correctness bug (stale or cross-request-leaked state). This is the general form of `references/module-data.md` §1, which covers the same pattern specialized to a redundant DB query.

## 3. Missing debounce/throttle on high-frequency DOM events

An event handler bound to `scroll`, `input`, `resize`, or a drag-move event that does non-trivial work (a DOM write, a `$state` mutation, a network call) on every fire, with no debounce/throttle gate. These events can fire dozens of times per second; unguarded handlers multiply that rate by whatever work they do.

```bash
grep -rn 'on:scroll\|on:input\|on:resize\|onscroll\|oninput\|onresize' src/ --include="*.svelte"
```

```svelte
<!-- ✗ runs on every scroll tick — could be 60+/sec during a fast scroll -->
<div onscroll={() => { scrollPosition = window.scrollY; }}>

<!-- ✓ throttled to a UI-relevant cadence -->
<script lang="ts">
  const handleScroll = throttle(() => { scrollPosition = window.scrollY; }, 100);
</script>
<div onscroll={handleScroll}>
```

For the WebSocket/SSE-tick variant of this same check, see `references/module-realtime.md` §1 — the mechanism is identical, but only load that pack when `realtime` is an active module.

## 4. Repeated `$derived` filters on the same reactive array

A recurring Svelte 5 anti-pattern: multiple independent `$derived` expressions each calling `.filter()` (or `.map()`, `.reduce()`) on the same source array. Each `$derived` re-traverses the full array on every reactive update — N independent filters multiply the per-update cost by N, even though a single pass could compute every group at once.

```bash
grep -rn '\$derived(.*\.filter(' src/ --include="*.svelte"
```

```svelte
<!-- ✗ three independent $derived expressions, three full traversals of `players` per update -->
<script lang="ts">
  let players: Player[] = $state([]);

  const connectedPlayers = $derived(players.filter((p) => p.connected));
  const disconnectedPlayers = $derived(players.filter((p) => !p.connected));
  const readyPlayers = $derived(players.filter((p) => p.connected && p.ready));
</script>
```

```svelte
<!-- ✓ one $derived.by() pass computes all groups; downstream $derived are cheap property reads -->
<script lang="ts">
  let players: Player[] = $state([]);

  const grouped = $derived.by(() => {
    const connected: Player[] = [];
    const disconnected: Player[] = [];
    const ready: Player[] = [];
    for (const p of players) {
      if (p.connected) {
        connected.push(p);
        if (p.ready) ready.push(p);
      } else {
        disconnected.push(p);
      }
    }
    return { connected, disconnected, ready };
  });

  const connectedPlayers = $derived(grouped.connected);
  const disconnectedPlayers = $derived(grouped.disconnected);
  const readyPlayers = $derived(grouped.ready);
</script>
```

The provable claim: name the traversal count before/after ("3 traversals of `players` per update → 1"). This pattern tends to recur across multiple components built around the same shared array (a player list, a lobby roster) — see the sibling-instance discipline below before picking which file to fix.

## 5. Images missing `loading="lazy"` or served uncompressed

```bash
grep -rln '<img' src/ --include="*.svelte" | xargs grep -L 'loading="lazy"'
```

A missing `loading="lazy"` on an offscreen/below-the-fold image (a grid, a list, an avatar carousel) forces the browser to fetch and decode every image on initial render regardless of viewport. An uncompressed or oversized source format on a decorative/avatar image is the same class of waste at the network layer.

```svelte
<!-- ✗ -->
<img src={avatarUrl} alt={playerName} />

<!-- ✓ -->
<img src={avatarUrl} alt={playerName} loading="lazy" decoding="async" />
```

**Check every component sharing the same visual pattern before picking which one to fix — don't stop at the first one that looks correct.** A grid-of-avatars or grid-of-thumbnails pattern is frequently duplicated across 2-3 components (a management view, a join/lobby view, a profile view) built independently from the same visual spec. Fixing the one that happens to already be correct proves nothing; grep every file matching the `<img>` pattern above and confirm which ones are actually missing the attribute before selecting the highest-impact instance to fix. See SKILL.md Phase 2 for the general "check sibling instances" rule this exemplifies.

## 6. Hand-rolled primitives with a faster native equivalent

A narrow but real case: legacy 32-bit multiply-with-carry patterns (common in hand-ported hash implementations) reimplement what the platform already exposes as a single optimized instruction.

```ts
// ✗ manual 32-bit wrapping multiply — the JIT can't recognize the intent and optimize it
function imul32(a: number, b: number) {
  return ((a & 0xffff) * b + ((((a >>> 16) * b) & 0xffff) << 16)) & 0xffffffff;
}

// ✓ native primitive — JIT engines compile this to a single CPU instruction
function imul32(a: number, b: number) {
  return Math.imul(a, b);
}
```

If the value produced by this function is ever persisted (a fingerprint, a hash used for deduplication or a DB lookup key), verify the two implementations are bit-for-bit equivalent before swapping — `Math.imul` is a drop-in replacement for a correct multiply-with-carry, but treat this as a compatibility question, not just a speed one. See SKILL.md's NEVER list on persisted identifiers.
