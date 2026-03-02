# CROGAMPRIELE-018: Emit trace events for deck auto-reshuffle

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel effects-token trace emission
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-007-zone-behaviors-deck-semantics.md`

## Problem

When a deck zone auto-reshuffles (tokens transferred from `reshuffleFrom` zone, shuffled, then drawing continues), no trace events are emitted for the intermediate reshuffle operation. The drawn tokens get `moveToken` trace entries (lines 644-652 in `effects-token.ts`), but the bulk transfer from reshuffle zone to deck and the shuffle itself are invisible in the trace. This makes it impossible for game designers to debug or analyze reshuffle behavior from trace output.

Other bulk-move operations (`applyMoveAll`) emit per-token `moveToken` trace entries. The `applyShuffle` effect emits no explicit trace either (it mutates zone contents in-place), but `applyShuffle` is a user-invoked effect — auto-reshuffle is implicit and even harder to diagnose without trace visibility.

## Assumption Reassessment (2026-03-02)

1. Auto-reshuffle logic is at `effects-token.ts:574-595`. Confirmed: no `emitTrace` call in this block.
2. `emitTrace` is used for `moveToken` kind at lines 644-652 (draw), 266 (moveToken), 368 (createToken), 723 (moveAll). Confirmed: the trace helper is available in scope.
3. The `collector` is available via `ctx.collector`. Confirmed: passed to all `emitTrace` calls in the file.
4. `resolveTraceProvenance(ctx)` produces the provenance label. Confirmed: used consistently at all trace emission sites.

## Architecture Check

1. Trace emission is the standard observability mechanism for all token movements. Adding it to auto-reshuffle is consistent with existing patterns — not a new concept.
2. This is purely kernel-level trace emission. No game-specific logic enters the kernel. The reshuffle is driven by zone metadata (`ZoneDef.behavior`) which is game-agnostic.
3. No backwards-compatibility concern — traces are append-only logs. Adding new trace entries does not break any consumer.

## What to Change

### 1. Emit trace events inside the auto-reshuffle block (`effects-token.ts:581-594`)

After the `shuffleTokenArray` call and state update, emit trace entries for each token that was transferred from the reshuffle zone into the deck:

```typescript
for (const reshuffledToken of reshuffleTokens) {
  emitTrace(ctx.collector, {
    kind: 'moveToken',
    tokenId: String(reshuffledToken.id),
    from: reshuffleZoneId,
    to: fromZoneId,
    provenance: resolveTraceProvenance(ctx),
  });
}
```

This follows the same per-token `moveToken` pattern used by `applyDraw` (line 644) and `applyMoveAll` (line 723).

### 2. Emit a shuffle trace entry for the deck after reshuffle

After the per-token move traces, emit a `shuffle` trace entry for the deck zone to record that the combined tokens were shuffled:

```typescript
emitTrace(ctx.collector, {
  kind: 'shuffle',
  zone: fromZoneId,
  provenance: resolveTraceProvenance(ctx),
});
```

This matches the trace shape that `applyShuffle` would produce if called explicitly.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify — add trace emission inside reshuffle block at lines 581-594)
- `packages/engine/test/unit/effects-token-deck-behavior.test.ts` (modify — add test asserting trace events from reshuffle)

## Out of Scope

- Changing `applyShuffle` trace emission (it currently emits no trace — that's a separate concern)
- Adding a new trace `kind` for reshuffle (use existing `moveToken` + `shuffle` kinds)
- Trace format changes or new trace consumers

## Acceptance Criteria

### Tests That Must Pass

1. Auto-reshuffle emits `moveToken` trace entries for each token transferred from the reshuffle zone to the deck zone.
2. Auto-reshuffle emits a `shuffle` trace entry for the deck zone after tokens are combined and shuffled.
3. Draw without reshuffle (sufficient tokens in deck) emits no reshuffle-related trace entries.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Trace output is append-only — adding entries does not alter game state or RNG.
2. Determinism preserved — trace emission has no side effects on state transitions.
3. All existing trace consumers continue to work (new entries use existing `kind` values).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-deck-behavior.test.ts` (modify) — add test in the "auto-reshuffle" describe block asserting that `ctx.collector` contains the expected `moveToken` and `shuffle` trace entries after a reshuffle-triggering draw. Rationale: verifies trace observability for the implicit reshuffle operation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-token-deck-behavior.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
