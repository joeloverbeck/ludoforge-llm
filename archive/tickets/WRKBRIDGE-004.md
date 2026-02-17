# WRKBRIDGE-004: Structured Clone Compatibility Tests (D3)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: S
**Spec**: 36, Deliverable D3 (Structured Clone Verification)
**Deps**: WRKBRIDGE-001 (test infrastructure)

## Problem

All data crossing the Worker boundary must survive `structuredClone()`. The kernel uses branded types (string/number aliases — clone-safe), BigInt for Zobrist hashes and PRNG state (structuredClone supports BigInt natively), and deeply nested plain objects. We need tests that verify every kernel type used by the bridge round-trips through `structuredClone()` without data loss.

## Assumptions Reassessment (2026-02-17)

- Runner tests are executed with Vitest (`pnpm -F @ludoforge/runner test`), not `node --test`.
- Worker contracts are authored in `packages/runner/src/worker/game-worker-api.ts` and re-exported via `packages/runner/src/worker/game-worker.ts`.
- D3 clone checks should focus on values that actually cross the bridge boundary today:
  - engine API payloads (`GameDef`, `GameState`, `Move`, `ApplyMoveResult`, `ChoiceRequest`, `TerminalResult`, `LegalMoveEnumerationResult`, warnings/trace arrays),
  - worker-specific payloads (`GameMetadata`, `WorkerError`).
- `GameState` has branded scalar fields (`activePlayer`, `currentPhase`) and bigint fields (`stateHash`, PRNG state words). Zone references are plain string keys in maps, not `ZoneId`-typed fields.
- Existing worker behavior tests already cover API semantics (`packages/runner/test/worker/game-worker.test.ts`). This ticket remains focused on structured-clone safety.

## Scope Decision

The proposed change (dedicated clone-compat tests) is more beneficial than the current architecture because it enforces a non-negotiable worker boundary invariant without changing runtime code paths. This is additive verification, not aliasing/backward-compat scaffolding, and strengthens long-term robustness for Comlink/Worker transport.

## What to Change

Create `packages/runner/test/worker/clone-compat.test.ts` containing structured clone round-trip tests for every type that crosses the worker boundary:

### State & definitions
1. `GameState` round-trips (including `stateHash: bigint`, `rng` state with bigint fields, branded scalar ids such as `PlayerId`/`PhaseId`).
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
- Import all types from `@ludoforge/engine` and worker-local contracts from `../../src/worker/game-worker-api`; do not redefine contracts locally.

### BigInt verification
- Explicitly test that `GameState.stateHash` (bigint) survives `structuredClone()`.
- Explicitly test that PRNG state fields containing bigint survive.

## Files to Touch

- `packages/runner/test/worker/clone-compat.test.ts` — **NEW FILE**
- `packages/runner/test/worker/test-fixtures.ts` — **NEW FILE** (shared worker test fixture)
- `packages/runner/test/worker/game-worker.test.ts` — reuse shared fixture to keep worker tests DRY

## Out of Scope

- Do NOT modify any engine code or kernel types.
- Do NOT modify the worker or bridge source files.
- Do NOT test Comlink serialization (that's integration testing in WRKBRIDGE-006).
- Do NOT test error propagation through the worker (that's WRKBRIDGE-006).

## Acceptance Criteria

### Tests that must pass
- All clone-compat tests pass: `pnpm -F @ludoforge/runner test -- test/worker/clone-compat.test.ts` (or equivalent Vitest invocation).
- Each test verifies `deepStrictEqual(original, structuredClone(original))`.

### Invariants
- Tests use real kernel types from `@ludoforge/engine` — no local type redefinitions.
- Every type listed in Spec 36 D3 has at least one round-trip test.
- BigInt fields are explicitly verified (not just "it didn't throw").
- No engine source files are modified.

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/test/worker/clone-compat.test.ts` with structured-clone round-trip tests covering all D3 type families, including explicit bigint checks for `GameState.stateHash` and PRNG words.
  - Added `packages/runner/test/worker/test-fixtures.ts` so worker tests share a single minimal compiled fixture definition/move set.
  - Updated `packages/runner/test/worker/game-worker.test.ts` to use shared fixtures (no behavior change).
  - Updated ticket assumptions/scope to match current repo architecture and test tooling.
- **Deviations from original plan**:
  - The original ticket expected a single new test file; a small fixture module extraction was added to prevent repeated fixture construction across worker tests.
  - Acceptance command was corrected from `node --test` to Vitest.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
