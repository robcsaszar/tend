# Tend Security — `realtime` Module Reference

Loaded only when `realtime` is in the config's `modules:` list — signal is a WebSocket/SSE dependency, or `new WebSocket(`/an SSE emitter set up in source.

## 1. Credential/internal-state leakage via broadcast payloads

Internal server-side state attached to a domain type that's *also* used as a serializable broadcast payload will eventually leak wherever that type is spread or shallow-copied into a message — see `references/module-auth.md` §2 for the same root cause on the request/response side. The broadcast version is often worse: one leak, once wired up, repeats on every subsequent event of that type, to every connected client, not just one response.

```bash
grep -rln 'emit\(Lobby\|Game\|Room\)\(Update\|Message\|State\)' src/ --include="*.ts"
```

```ts
// Player carries both public display fields and a private auth token.
interface Player {
  nickname: string;
  score: number;
  token?: string; // live auth credential
}

// ✗ every SSE/WS emitter that spreads the full player object leaks the token
function emitLobbyUpdate(lobby: Lobby) {
  broadcast({ type: "lobby:update", players: lobby.players.map((p) => ({ ...p })) });
}

// ✓ project to a public shape at every emission site, or centralize the projection
function emitLobbyUpdate(lobby: Lobby) {
  broadcast({ type: "lobby:update", players: lobby.players.map(publicPlayer) });
}
```

**Check every emission site, not just the obvious one.** A single credential-bearing type used as a lobby/game/room's canonical player record tends to get spread into *several* different message builders over time (a lobby-update emitter, a round-end emitter, a reconnect/state-sync emitter, a role-lock emitter) — each one added independently, each one an equally valid leak site. Grep for every function that constructs a broadcast/SSE payload referencing the credential-bearing type, not just the first one found. The general rule: if a type is ever `JSON.stringify`'d or spread into a broadcast message, treat all of its fields as public from that point on, and require an explicit public-projection function at the boundary rather than trusting each call site to remember.

## 2. Broadcast amplification via unbounded fields

Any player/user-submitted or writer-submitted field that is later re-emitted verbatim in a broadcast message is a multiplier: one oversized write amplifies once per connected client on every broadcast of that message type. This applies to a single oversized *string* field and to an *array's* item count equally — see `references/module-validation.md` §§2, 4 for the schema-level fix in each case; this section is about recognizing the amplification shape at the broadcast site.

Three concrete shapes of the same root cause:

- **An "internal-looking" scalar field with no length cap**, echoed into a broadcast even though it reads like a server-only identifier. A field like an answer ID that the server only ever *compares* against a known value can still be a threat if it's echoed back into a round-result/state broadcast — the field being conceptually "internal" doesn't mean it isn't attacker-controlled input.
- **A URL/media field validated for protocol but not length.** Protocol validation (`http:`/`https:` only) and size validation are different axes; passing one says nothing about the other. A multi-megabyte string that happens to start with `https://` still amplifies once per client when broadcast.
- **An array with no `maxItems`**, stored once and re-emitted on every draw/read of that record — see `references/module-validation.md` §4.

```bash
grep -rln 'emit\(Game\|Round\|Question\)\(Result\|Update\|State\)' src/ --include="*.ts"
```

```ts
// ✗ answerId has no length cap in its schema; broadcast to every connected player
function endRound(game: Game) {
  broadcast({
    type: "game:round-result",
    answers: game.playerAnswers, // includes raw, unbounded answerId per player
  });
}
```

The fix in every one of these cases lives at the schema/input boundary (`references/module-validation.md`), not at the broadcast call site — by the time a value reaches the emitter, the amplification has already been paid for on storage. Use the broadcast call sites to *find* candidate fields (grep every `emit*`/`broadcast*` call, trace each field in the payload back to its originating schema), then verify the fix against the schema, not the emitter.

**Prioritize by writer trust level, not just by finding order.** A field that's amplifiable when submitted by an anonymous, unauthenticated caller is higher priority than the same shape gated behind a trusted role — but don't assume a trusted-role writer (curator/admin) makes the finding irrelevant; a compromised or careless trusted account is still a realistic threat model for a broadcast amplification bug.
