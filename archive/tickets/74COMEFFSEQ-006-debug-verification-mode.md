# 74COMEFFSEQ-006: Debug Verification Mode (Dual-Path Comparison)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — lifecycle dispatch + execution-policy threading
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-005

## Problem

The compiled path must be provably correct. A debug verification mode runs both the compiled and interpreted paths for every lifecycle effect dispatch, then asserts that the resulting states are bit-identical via `computeFullHash`. This catches compiler bugs during testing without impacting production performance.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions.verifyCompiledEffects` already exists in `packages/engine/src/kernel/types-core.ts`, but no runtime path consumes it yet.
2. `dispatchLifecycleEvent` is the correct integration point for lifecycle verification, but the ticket previously understated its call graph. It is reached from:
   - `applyMoveCore` via `advanceToDecisionPoint`
   - `initialState`
   - `advancePhase`
   - `applyBoundaryExpiry`
   - turn-flow effect handlers such as `gotoPhaseExact`, `pushInterruptPhase`, and `popInterruptPhase`
3. Existing compiled-effect parity coverage already exists:
   - unit compiler parity tests in `packages/engine/test/unit/kernel/effect-compiler.test.ts`
   - runtime dispatch parity tests in `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts`
   The missing coverage is verification-mode behavior, not basic compiled/interpreted equivalence.
4. `computeFullHash` lives in `packages/engine/src/kernel/zobrist.ts` and already has established engine-wide usage.
5. `runGame` currently does not forward `ExecutionOptions` into `initialState`, so enabling verification only on move application would leave initial lifecycle execution unverified.

## Architecture Check

1. Verification mode is a testing/debugging concern and must add no extra execution work when disabled.
2. The cleanest boundary is to thread verification through the existing lifecycle execution policy path, not to add ad hoc booleans at isolated call sites. That keeps normal lifecycle dispatch, phase advance, boundary expiry, and effect-driven phase transitions on one coherent path.
3. Verification must not pollute the active collector. Running the interpreted shadow path against the same collector would double traces/warnings and distort test assertions.
4. A robust verifier should compare the full lifecycle `EffectResult` contract that matters here:
   - resulting state hash
   - RNG state
   - emitted events
   - bindings / decision scope / pending choice when present
   - warning deltas emitted during lifecycle execution
5. This does not change production behavior. When verification is enabled and passes, the compiled result remains authoritative.

## What to Change

### 1. Thread verification through lifecycle execution policy

Do not add a standalone flag only to `applyMoveCore`.

Instead:
- extend the lifecycle execution-policy path so `dispatchLifecycleEvent` can read whether verification is enabled
- make sure that policy reaches all lifecycle call sites, including `advancePhase`, `applyBoundaryExpiry`, `initialState`, and effect-driven lifecycle transitions
- forward `ExecutionOptions` into `initialState` from `runGame` so start-of-game lifecycle effects are covered too

### 2. Implement dual-path verification in `dispatchLifecycleEvent`

When verification is enabled and a compiled lifecycle sequence exists:

```typescript
if (policy?.verifyCompiledEffects === true && compiledSeq !== undefined) {
  const compiledResult = compiledSeq.execute(...compiledCtx);
  const interpretedResult = applyEffects(...interpretedCtxWithShadowResources);
  verifyLifecycleParity(compiledResult, interpretedResult, ...diagnosticContext);
  effectResult = compiledResult;
}
```

### 3. Define `CompiledEffectVerificationError`

Keep the error close to compiled-effect types unless a better shared diagnostics file clearly emerges. The error should report:
- phaseId
- lifecycle
- coverageRatio
- mismatch kind (`stateHash`, `rng`, `emittedEvents`, `bindings`, `decisionScope`, `pendingChoice`, `warnings`)
- compiled/interpreted values for the failed comparison where practical

```typescript
export class CompiledEffectVerificationError extends Error {
  readonly phaseId: string;
  readonly lifecycle: 'onEnter' | 'onExit';
  readonly coverageRatio: number;
  readonly mismatchKind: ...;
}
```

### 4. Thread verification through the real execution paths

Required call paths:
- `applyMoveCore` / simultaneous commit flow
- `advancePhase`
- `applyBoundaryExpiry`
- `initialState`
- `runGame` -> `initialState`
- effect-driven lifecycle transitions in `effects-turn-flow.ts`

### 5. Add focused verification tests

Do not rewrite existing parity tests. Add focused verification-mode tests that prove:
- mismatches fail with useful diagnostics
- passing verification does not duplicate collector output
- production runtime paths can execute with verification enabled

## Files to Touch

- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — add dual-path logic)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify — add verification error type)
- `packages/engine/src/kernel/apply-move.ts` (modify — thread verification flag)
- `packages/engine/src/kernel/execution-policy.ts` (modify — carry verification policy)
- `packages/engine/src/kernel/phase-advance.ts` (modify — preserve verification through lifecycle transitions)
- `packages/engine/src/kernel/boundary-expiry.ts` (modify — preserve verification through emitted lifecycle events)
- `packages/engine/src/kernel/initial-state.ts` (modify — verify initial lifecycle execution)
- `packages/engine/src/sim/simulator.ts` (modify — forward options into `initialState`)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify — preserve verification for effect-driven phase transitions)

## Out of Scope

- The compiler itself (74COMEFFSEQ-002, 003, 004)
- Cache management (74COMEFFSEQ-005)
- Performance benchmarking (74COMEFFSEQ-007)
- Making verification the permanent default
- Detailed state diff output beyond hash comparison (nice-to-have, not required)

## Acceptance Criteria

### Tests That Must Pass

1. With `verifyCompiledEffects: true`, a correct compiled lifecycle path passes verification silently.
2. With `verifyCompiledEffects: true`, a deliberately broken compiled lifecycle path throws `CompiledEffectVerificationError` with mismatch kind and lifecycle diagnostics.
3. With `verifyCompiledEffects: false` (or undefined), lifecycle dispatch does not execute the interpreted shadow path.
4. Verification covers lifecycle execution reached from both initialization and normal move progression.
5. Running representative production-spec paths with `verifyCompiledEffects: true` completes without verification errors.
6. `CompiledEffectVerificationError` includes phaseId, lifecycle, coverageRatio, and mismatch diagnostics.
7. RNG and emitted-event parity are verified in addition to state hash parity.
8. Verification does not duplicate warnings or trace output in the active collector.
9. Existing engine test and e2e suites continue to pass.

### Invariants

1. **Zero overhead when disabled**: Verification mode adds no runtime cost when `verifyCompiledEffects` is false/undefined.
2. **Determinism proof**: A passing verification run proves compiled and interpreted lifecycle execution are bit-identical for the verified path (Foundation 5).
3. **No behavioral change**: Verification mode uses the compiled result when it passes — it doesn't change game outcomes.
4. **Immutability**: Both paths receive the same input state, and neither mutates it (Foundation 7).
5. **Collector isolation**: Shadow verification execution must not alter the active collector's warnings or traces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-verification.test.ts` — unit tests for dual-path verification, mismatch reporting, and collector isolation.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` — integration tests that exercise verification-enabled lifecycle execution on representative production paths.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler-verification.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/compiled-effects-verification.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - added compiled lifecycle verification at `dispatchLifecycleEvent`
  - introduced `CompiledEffectVerificationError` diagnostics with mismatch kind, lifecycle identity, and coverage metadata
  - threaded verification through execution policy so it reaches move progression, phase advance, boundary expiry, effect-driven lifecycle transitions, and `initialState`
  - forwarded simulator execution options into `initialState`, closing the prior coverage gap
  - isolated the interpreted shadow pass behind a collector clone so verification does not duplicate user-facing warnings or traces
  - added focused unit and integration tests for mismatch detection, collector isolation, initial-state coverage, and short Texas verification runs
- Deviations from original plan:
  - verification compares lifecycle outputs that are externally meaningful at this boundary: state hash, RNG, emitted events, warnings, and pending-choice-related metadata
  - final lifecycle bindings / decision scope are not treated as mandatory parity signals unless a pending choice exists, because they are internal execution residue rather than stable lifecycle API output
  - no `apply-move-pipeline.ts` changes were needed
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler-verification.test.js`
  - `node --test packages/engine/dist/test/integration/compiled-effects-verification.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
