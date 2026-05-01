# 151DECSTACSER-002: Retire decision-stack walker invocations after 001 wiring

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/serde.ts` (remove remaining walker invocation dependency)
**Deps**: `archive/tickets/151DECSTACSER-001.md`

## Problem

`151DECSTACSER-001` absorbed the explicit decision-stack serializer/deserializer helpers because live typecheck proved the original type-only split would leave the repo in a broken mid-migration state. `serializeGameState` and `deserializeGameState` still retain their final defensive calls to `sanitizeNestedBigInts` and `restoreNestedSerializedBigInts`. This ticket now owns the remaining cutover: prove the explicit recursion from 001 is complete enough to remove those two invocations while leaving the walker function bodies for 004 to delete.

## Assumption Reassessment (2026-05-01)

1. `151DECSTACSER-001` now adds `serializeRng`, `deserializeRng`, `serializeSuspendedFrame`, `deserializeSuspendedFrame`, `serializeEffectFrame`, `deserializeEffectFrame`, `serializeDecisionStack`, and `deserializeDecisionStack`.
2. `serializeGameState` still invokes `sanitizeNestedBigInts(serialized)` as a final pass. Removing this call should be safe after 001's explicit decision-stack serialization.
3. `deserializeGameState` still invokes `restoreNestedSerializedBigInts(deserialized)` as a final pass. Removing this call should be safe after 001's explicit decision-stack deserialization.
4. `SuspendedEffectFrameSnapshot.bindings: Readonly<Record<string, unknown>>` remains pass-through; 005 owns the synthetic BigInt-safety lock-in test.
5. The walker function bodies stay in place after this ticket and are deleted by 004.

## Architecture Check

1. Explicit type-driven recursion from 001 replaces the decision-stack need for the generic safety net. This ticket removes the remaining invocation dependency so 004 can delete the walker bodies without changing behavior.
2. F8 preserved: round-trip canonicality is now structural — `assert.deepEqual(serializeTrace(run1), serializeTrace(run2))` for the same `(GameDef, seed, agents, maxTurns)` keeps holding because the explicit recursion is deterministic.
3. F11 preserved: serializers create new objects; no input mutation. The walker pattern was already F11-clean (copy-on-bigint); the typed pattern is structurally clean.
4. F15 preserved: this ticket addresses the root cause (no typed recursion target) rather than papering over with a safety net.

## What to Change

### 1. Remove the walker invocation from `serializeGameState`

After 001, `serializeGameState` already serializes `decisionStack` through `serializeDecisionStack`. Replace the final `return sanitizeNestedBigInts(serialized) as SerializedGameState;` with `return serialized;`.

### 2. Remove the walker invocation from `deserializeGameState`

After 001, `deserializeGameState` already deserializes `decisionStack` through `deserializeDecisionStack`. Replace the final `restoreNestedSerializedBigInts(deserialized)` path with direct validation and return of `deserialized`.

### 3. Keep the walker function bodies for 004

Do not delete `sanitizeNestedBigInts` or `restoreNestedSerializedBigInts` in this ticket. 004 owns deletion plus grep enforcement.

## Files to Touch

- `packages/engine/src/kernel/serde.ts` (modify — remove the remaining walker invocations only)

## Out of Scope

- Adding decision-stack serializer/deserializer helpers — absorbed by 001 after Foundation-driven reassessment.
- Deleting walker function bodies — owned by 004.
- Schema (Zod) updates — 003 owns the `EffectExecutionFrameSnapshotSchema.suspendedFrame` tightening.
- New tests — 005 owns the round-trip and synthetic-bindings tests. Existing tests must continue to pass.
- Adding the grep enforcement test for raw `JSON.stringify(state|trace)` — 005 owns it.
- Recursing into `bindings` values to convert BigInts — bindings are treated as pass-through; 005's synthetic test locks in the assumption.

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test` passes unchanged. The walker functions remain in the source but are no longer invoked; their effective behavior is preserved by the explicit recursion from 001.
2. `JSON.stringify(serializeGameState(stateWithSuspendedFrame))` succeeds without throwing (replicating the original PR #231 failure scenario via existing tests or a temp probe — the formal test arrives in 005).
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` and the determinism shards stay green.
4. `pnpm turbo lint typecheck` passes.

### Invariants

1. Per F8: `serializeTrace(trace)` round-trips canonically — `serializeTrace(deserializeTrace(serializeTrace(trace)))` is byte-identical to `serializeTrace(trace)` for any trace produced by `runGame`.
2. Per F11: `serializeGameState(state)` does not mutate `state` — every nested object reachable from the input is either reused unchanged or replaced via spread.
3. The walker functions are unreferenced from `serializeGameState` / `deserializeGameState` after this ticket; their function bodies remain in `serde.ts` but are dead code.

## Test Plan

### New/Modified Tests

None directly; 005 is the test ticket. This ticket relies on the existing test corpus (`packages/engine/test/unit/serde.test.ts`, `packages/engine/test/determinism/spec-140-replay-identity.test.ts`) staying green.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:integration:slow-parity`
4. `pnpm turbo lint typecheck`
