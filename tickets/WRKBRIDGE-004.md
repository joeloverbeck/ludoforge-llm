# WRKBRIDGE-004: Structured Clone Compatibility Tests (D3)

**Status**: PENDING
**Priority**: HIGH
**Effort**: S
**Spec**: 36, Deliverable D3 (Structured Clone Verification)
**Deps**: WRKBRIDGE-001 (test infrastructure)

## Problem

All data crossing the Worker boundary must survive `structuredClone()`. The kernel uses branded types (string/number aliases — clone-safe), BigInt for Zobrist hashes and PRNG state (structuredClone supports BigInt natively), and deeply nested plain objects. We need tests that verify every kernel type used by the bridge round-trips through `structuredClone()` without data loss.

## What to Change

Create `packages/runner/test/worker/clone-compat.test.ts` containing structured clone round-trip tests for every type that crosses the worker boundary:

### State & definitions
1. `GameState` round-trips (including `stateHash: bigint`, `rng` state with bigint fields, branded `PlayerId`/`ZoneId`).
2. `GameDef` round-trips (full definition with nested objects — zones, actions, turn structure, data assets).
3. `Move` round-trips (with branded `ActionId` and typed params).

### Execution results
4. `ApplyMoveResult` round-trips — all four fields: `state`, `triggerFirings`, `warnings`, `effectTrace`.
5. `EffectTraceEntry[]` round-trips — at least one instance of each of the 8 variants: forEach, reduce, moveToken, setTokenProp, varChange, resourceTransfer, createToken, lifecycleEvent.
6. `TriggerLogEntry[]` round-trips — at least one instance of each of the 8 variants: fired, truncated, turnFlowLifecycle, turnFlowEligibility, simultaneousSubmission, simultaneousCommit, operationPartial, operationFree.
7. `RuntimeWarning[]` round-trips.

### Choice system
8. `ChoiceRequest` round-trips — all three variants: pending, complete, illegal.

### Terminal
9. `TerminalResult` round-trips — all four variants: win, lossAll, draw, score.

### Move enumeration
10. `LegalMoveEnumerationResult` round-trips (moves + warnings).

### Bridge-specific
11. `GameMetadata` round-trips.
12. `WorkerError` round-trips (all four error codes).

### Approach
- Use a minimal test GameDef fixture (compile a tiny spec or hand-craft a minimal GameDef) to produce real instances of each type.
- Alternatively, use the engine's `initialState` + `legalMoves` + `applyMove` to produce real runtime objects, then `structuredClone()` them and `deepStrictEqual` the result.
- For types that are hard to produce naturally (some TriggerLogEntry/EffectTraceEntry variants), hand-craft representative plain objects matching the type shape.

### BigInt verification
- Explicitly test that `GameState.stateHash` (bigint) survives `structuredClone()`.
- Explicitly test that PRNG state fields containing bigint survive.

## Files to Touch

- `packages/runner/test/worker/clone-compat.test.ts` — **NEW FILE**

## Out of Scope

- Do NOT modify any engine code or kernel types.
- Do NOT modify the worker or bridge source files.
- Do NOT test Comlink serialization (that's integration testing in WRKBRIDGE-006).
- Do NOT test error propagation through the worker (that's WRKBRIDGE-006).

## Acceptance Criteria

### Tests that must pass
- All clone-compat tests pass: `node --test packages/runner/test/worker/clone-compat.test.ts` (or equivalent runner test command).
- Each test verifies `deepStrictEqual(original, structuredClone(original))`.

### Invariants
- Tests use real kernel types from `@ludoforge/engine` — no local type redefinitions.
- Every type listed in Spec 36 D3 has at least one round-trip test.
- BigInt fields are explicitly verified (not just "it didn't throw").
- No engine source files are modified.
