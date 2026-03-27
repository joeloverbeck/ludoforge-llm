# 87UNIVIAPIP-004: Thread discoveryCache through classification pipeline (enumerateLegalMoves → classifyEnumeratedMoves → probeMoveViability)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/legal-moves.ts, kernel/apply-move.ts
**Deps**: 87UNIVIAPIP-002 (discoveryCache on ResolveMoveDecisionSequenceOptions), 87UNIVIAPIP-003 (cache populated in enumeration)

## Problem

After 87UNIVIAPIP-003, the discovery cache is populated during enumeration and returned from `enumerateRawLegalMoves`. But `classifyEnumeratedMoves` and `probeMoveViability` don't receive it yet, so `resolveMoveDecisionSequence` can't look up cached results. This ticket threads the cache from `enumerateLegalMoves` through `classifyEnumeratedMoves` into `probeMoveViability`.

## Assumption Reassessment (2026-03-27)

1. `enumerateLegalMoves` (legal-moves.ts:1263) calls `enumerateRawLegalMoves` and then `classifyEnumeratedMoves` — confirmed at lines 1269-1272.
2. After 87UNIVIAPIP-003, `enumerateRawLegalMoves` returns `{ moves, warnings, discoveryCache }` — will be true after that ticket.
3. `classifyEnumeratedMoves` (legal-moves.ts:252) currently accepts `(def, state, moves, warnings, runtime)` — confirmed.
4. `classifyEnumeratedMoves` calls `probeMoveViability(def, state, move, runtime)` at line 277 — confirmed.
5. `probeMoveViability` (apply-move.ts:1659) currently accepts `(def, state, move, runtime?)` — confirmed.
6. `probeMoveViability` calls `resolveMoveDecisionSequence(def, state, move, { choose: () => undefined }, runtime)` at line 1723 — confirmed.
7. After 87UNIVIAPIP-002, `resolveMoveDecisionSequence` accepts `discoveryCache` in its options — will be true after that ticket.

## Architecture Check

1. Threading an optional parameter through two functions is minimal and non-breaking. Both `classifyEnumeratedMoves` (private) and `probeMoveViability` (exported) gain an optional trailing parameter.
2. `probeMoveViability`'s public API remains backwards-compatible — the new parameter is optional and defaults to undefined (no cache).
3. No V8 hidden class risk: `probeMoveViability` is on the classification path (cold relative to enumeration), and the parameter is a function argument, not an object field.

## What to Change

### 1. Add `discoveryCache` parameter to `classifyEnumeratedMoves`

```typescript
const classifyEnumeratedMoves = (
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  warnings: RuntimeWarning[],
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): readonly ClassifiedMove[] => {
```

Pass it to `probeMoveViability`:

```typescript
const viability = probeMoveViability(def, state, move, runtime, discoveryCache);
```

### 2. Add `discoveryCache` parameter to `probeMoveViability`

```typescript
export const probeMoveViability = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): MoveViabilityProbeResult => {
```

Pass it to `resolveMoveDecisionSequence`:

```typescript
const sequence = resolveMoveDecisionSequence(
  def, state, move,
  { choose: () => undefined, discoveryCache },
  runtime,
);
```

### 3. Thread cache in `enumerateLegalMoves`

```typescript
export const enumerateLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): LegalMoveEnumerationResult => {
  const { moves, warnings: rawWarnings, discoveryCache } =
    enumerateRawLegalMoves(def, state, options, runtime);
  const warnings = [...rawWarnings];
  return {
    moves: classifyEnumeratedMoves(def, state, moves, warnings, runtime, discoveryCache),
    warnings,
  };
};
```

### 4. Import DiscoveryCache in apply-move.ts

Add import of `DiscoveryCache` type from `move-decision-sequence.ts`.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify) — thread cache from `enumerateLegalMoves` to `classifyEnumeratedMoves`
- `packages/engine/src/kernel/apply-move.ts` (modify) — add optional `discoveryCache` param to `probeMoveViability`, pass to `resolveMoveDecisionSequence`

## Out of Scope

- `move-decision-sequence.ts` — already handled in 87UNIVIAPIP-001 and 87UNIVIAPIP-002
- Enumeration-side cache creation — already handled in 87UNIVIAPIP-003
- `enumerateLegalMoves` return type — remains `LegalMoveEnumerationResult` unchanged (cache is NOT exposed externally)
- Any hot-path object shapes (Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, GameDefRuntime)
- `evaluatePlayableMoveCandidate` in apply-move.ts — agent completion is NOT cached (future work per spec)
- External callers of `probeMoveViability` (e.g., tests that call it directly) — they continue to work without the cache parameter

## Acceptance Criteria

### Tests That Must Pass

1. `classified-move-parity.test.ts` passes — same classified moves, same viability, same count.
2. All existing tests that call `probeMoveViability` directly pass unchanged (cache parameter is optional).
3. `pnpm turbo test` passes with no regressions.
4. `pnpm turbo typecheck` passes.

### Invariants

1. `probeMoveViability` still executes all 8 validation steps for every move (no probe bypass).
2. When `discoveryCache` is omitted, `probeMoveViability` behavior is identical to current code.
3. The `enumerateLegalMoves` return type (`LegalMoveEnumerationResult`) is unchanged — the cache is internal.
4. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
5. For event moves: `resolveMoveDecisionSequence`'s first `legalChoicesDiscover` call is a cache hit (same Move object reference from enumeration).
6. For pipeline parameterized variants: `resolveMoveDecisionSequence`'s `legalChoicesDiscover` call is a cache miss (different Move object from template), falling through to normal execution.

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — correctness is verified by existing parity tests and by 87UNIVIAPIP-005.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
