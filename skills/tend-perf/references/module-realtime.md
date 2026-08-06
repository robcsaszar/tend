# Tend Perf — `realtime` Module Reference

Loaded only when `realtime` is in the config's `modules:` list — signal is a WebSocket/SSE dependency, or `new WebSocket(`/an SSE emitter set up in source.

## 1. Missing debounce/throttle on WS/SSE tick handlers

`references/scan-core.md` §3 covers the general case (scroll/input/resize). This module narrows to the realtime-specific instance: a handler wired to a WebSocket `onmessage` or an SSE `EventSource` `onmessage` callback that fires on every server tick and does non-trivial work per tick — a `$state` mutation that cascades through a `$derived` chain, a DOM write, a re-render of a list — with no debounce/throttle gate.

```bash
grep -rn 'onmessage\s*=\|addEventListener(.message.' src/ --include="*.ts" --include="*.svelte"
```

```ts
// ✗ every server tick (could be many per second) triggers a full state write + re-render
socket.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  gameState = payload; // $state mutation cascades through every $derived reading gameState
};

// ✓ throttle to a UI-relevant cadence — the connection still receives every tick, the render doesn't
const applyTick = throttle((payload: GameState) => {
  gameState = payload;
}, 100);

socket.onmessage = (event) => {
  applyTick(JSON.parse(event.data));
};
```

The provable claim here is call-count, not perceived smoothness: state the tick frequency the server actually sends (from the emitting code, if visible in this repo) versus the throttled cadence — "N ticks/sec collapsed to ~10 state writes/sec" is provable from code inspection; "feels smoother" is not, and doesn't belong in the finding.

Don't double-report: a scroll/input/resize finding belongs to `scan-core.md` §3, a WS/SSE-tick finding belongs here. Same mechanism, different trigger — pick whichever one you actually found evidence for.
