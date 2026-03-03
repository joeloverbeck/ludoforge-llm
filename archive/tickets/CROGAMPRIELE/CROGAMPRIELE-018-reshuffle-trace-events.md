# CROGAMPRIELE-018: Emit trace events for deck shuffle operations

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small–Medium
**Engine Changes**: Yes — kernel types, schema, and effects-token trace emission
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-007-zone-behaviors-deck-semantics.md`

## Problem

Two observability gaps exist in the kernel's trace system:

1. **Auto-reshuffle is invisible**: When a deck zone auto-reshuffles (tokens transferred from `reshuffleFrom` zone, shuffled, then drawing continues), no trace events are emitted for the intermediate reshuffle operation. The drawn tokens get `moveToken` trace entries (lines 644-652 in `effects-token.ts`), but the bulk transfer from reshuffle zone to deck and the shuffle itself are invisible.

2. **`applyShuffle` emits no trace**: The explicit shuffle effect (`applyShuffle`, lines 775-805) mutates zone token ordering but emits zero trace entries. Every other state-mutating effect in the kernel (`moveToken`, `createToken`, `destroyToken`, `setTokenProp`, `reveal`, `conceal`, `resourceTransfer`) emits trace. This is an architectural inconsistency.

Both gaps make it impossible for game designers, the UI animation system, or the evaluation pipeline to observe shuffle operations through the standard trace mechanism.

## Assumption Reassessment (2026-03-03)

1. Auto-reshuffle logic is at `effects-token.ts:574-595`. Confirmed: no `emitTrace` call in this block.
2. `applyShuffle` at lines 775-805 emits no trace at all. Confirmed.
3. **No `EffectTraceShuffle` type exists.** The `EffectTraceEntry` union (`types-core.ts:823-834`) has 11 variants; none is `shuffle`. The `EffectTraceEntrySchema` (`schemas-core.ts:531-637`) likewise has no `shuffle` variant.
4. `emitTrace` is available in scope via import. `ctx.collector` and `resolveTraceProvenance(ctx)` are used at all trace emission sites. Confirmed.
5. The original ticket's claim that "use existing `shuffle` kinds" was incorrect — no such kind existed. The original "Out of Scope" section contradicted section 2 of the proposed changes.

## Architecture Check

1. **Completeness principle**: Every state-mutating kernel operation should be observable through trace. `shuffle` changes token ordering — it IS a state mutation. Not tracing it is inconsistent with all other effect types.
2. This is purely kernel-level trace emission. No game-specific logic enters the kernel. Shuffle and auto-reshuffle are driven by generic zone metadata (`ZoneDef.behavior`).
3. Adding `EffectTraceShuffle` to the type system and schema is the clean, extensible approach. Future consumers (UI animation, eval pipeline) can differentiate shuffles from moves.
4. No backwards-compatibility concern — traces are append-only logs. Adding new entries and a new kind does not break any consumer.

## What to Change

### 1. Add `EffectTraceShuffle` type and schema

In `types-core.ts`: add `EffectTraceShuffle` interface with `kind: 'shuffle'`, `zone: string`, `provenance: EffectTraceProvenance`. Add it to the `EffectTraceEntry` union.

In `schemas-core.ts`: add a matching `shuffle` variant to `EffectTraceEntrySchema`.

### 2. Emit trace in `applyShuffle` (`effects-token.ts:775-805`)

After the `shuffleTokenArray` call and state update, emit a `shuffle` trace entry:

```typescript
emitTrace(ctx.collector, {
  kind: 'shuffle',
  zone: zoneId,
  provenance: resolveTraceProvenance(ctx),
});
```

This closes the existing gap where `applyShuffle` was the only state-mutating effect with no trace emission.

### 3. Emit trace events inside the auto-reshuffle block (`effects-token.ts:581-594`)

After the `shuffleTokenArray` call and state update, emit:

a) `moveToken` trace entries for each token transferred from the reshuffle zone into the deck:

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

b) A `shuffle` trace entry for the deck zone:

```typescript
emitTrace(ctx.collector, {
  kind: 'shuffle',
  zone: fromZoneId,
  provenance: resolveTraceProvenance(ctx),
});
```

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `EffectTraceShuffle` interface and union member)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add shuffle variant to `EffectTraceEntrySchema`)
- `packages/engine/src/kernel/effects-token.ts` (modify — emit trace in `applyShuffle` and auto-reshuffle block)
- `packages/engine/test/unit/effects-token-deck-behavior.test.ts` (modify — add tests for trace events)

## Acceptance Criteria

### Tests That Must Pass

1. `applyShuffle` emits a `shuffle` trace entry for the target zone.
2. Auto-reshuffle emits `moveToken` trace entries for each token transferred from the reshuffle zone to the deck zone.
3. Auto-reshuffle emits a `shuffle` trace entry for the deck zone after tokens are combined and shuffled.
4. Draw without reshuffle (sufficient tokens in deck) emits no reshuffle-related trace entries.
5. `applyShuffle` with 0 or 1 tokens (no-op) emits no trace.
6. Existing suite: `pnpm turbo test`

### Invariants

1. Trace output is append-only — adding entries does not alter game state or RNG.
2. Determinism preserved — trace emission has no side effects on state transitions.
3. Schema artifacts remain synchronized after regeneration.

## Test Plan

### New/Modified Tests

1. `effects-token-deck-behavior.test.ts` — new test: auto-reshuffle emits `moveToken` + `shuffle` trace entries (requires `createCollector({ trace: true })`).
2. `effects-token-deck-behavior.test.ts` — new test: draw without reshuffle emits only draw `moveToken` traces, no shuffle trace.
3. `effects-token-deck-behavior.test.ts` — new test: `applyShuffle` emits `shuffle` trace entry.
4. `effects-token-deck-behavior.test.ts` — new test: `applyShuffle` on ≤1 token emits no trace.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-token-deck-behavior.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
4. `pnpm turbo schema:artifacts`

## Outcome

### Originally Planned
- Emit `moveToken` traces for auto-reshuffle bulk transfer
- Emit `shuffle` trace using "existing shuffle kind" (assumed to exist)
- Touch 2 files: `effects-token.ts`, `effects-token-deck-behavior.test.ts`

### Actually Changed
The original ticket had an incorrect assumption: no `EffectTraceShuffle` type or `shuffle` trace kind existed. `applyShuffle` also emitted zero trace — an architectural gap. Scope was expanded to close both gaps cleanly:

**Engine (kernel):**
- `types-core.ts` — added `EffectTraceShuffle` interface + union member
- `schemas-core.ts` — added `shuffle` variant to `EffectTraceEntrySchema`
- `effects-token.ts` — emit trace in `applyShuffle` AND auto-reshuffle block (`moveToken` per token + `shuffle` for zone)
- `effects-token-deck-behavior.test.ts` — 4 new tests covering shuffle trace emission
- Schema artifacts (`Trace.schema.json`, `EvalReport.schema.json`) regenerated

**Runner (UI):**
- `effect-trace-kind-config.ts` — added `shuffle: 'shuffle'` preset mapping
- `trace-projection.ts` — added `shuffle` case with zone projection
- `translate-effect-trace.ts` — added `shuffle` case with "Shuffled {zone}." message
- `trace-to-descriptors.ts` — added `shuffle` case returning `null` (no animation yet)

### Verification
- 3403 engine tests pass (15 in deck-behavior file, 4 new)
- 1365 runner tests pass
- Typecheck clean across both packages
- Lint clean
- Schema artifacts in sync
