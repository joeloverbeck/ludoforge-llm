# 74COMEFFSEQ-006: Debug Verification Mode (Dual-Path Comparison)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — phase-lifecycle.ts, possibly apply-move.ts
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-005

## Problem

The compiled path must be provably correct. A debug verification mode runs both the compiled and interpreted paths for every lifecycle effect dispatch, then asserts that the resulting states are bit-identical via `computeFullHash`. This catches compiler bugs during testing without impacting production performance.

## Assumption Reassessment (2026-03-21)

1. `computeFullHash` exists in `packages/engine/src/kernel/zobrist.ts` (or similar). Confirmed via grep — found in types-core.ts, zobrist.ts, apply-move.ts.
2. `ExecutionOptions.verifyCompiledEffects` was added in 74COMEFFSEQ-001. Will be available.
3. `dispatchLifecycleEvent` receives `profiler?: PerfProfiler` but not `ExecutionOptions` directly. The verification flag needs to be threaded through — either via a new parameter or by checking a runtime flag.
4. The existing test suite runs with specific execution options. The verification mode should be opt-in per test run.

## Architecture Check

1. Verification mode is a testing/debugging concern — it should add zero overhead when disabled.
2. The dual-path approach is a standard correctness proof technique: run both, compare, fail loudly on mismatch.
3. Verification errors include diagnostic context (phase, lifecycle, hash values, diff hints) for efficient debugging.
4. This does not change production behavior — it's gated by `verifyCompiledEffects` flag.

## What to Change

### 1. Thread `verifyCompiledEffects` into `dispatchLifecycleEvent`

Either:
- (a) Add `executionOptions?: ExecutionOptions` parameter to `dispatchLifecycleEvent`, or
- (b) Add a standalone `verifyCompiledEffects?: boolean` parameter.

Option (b) is cleaner — avoids coupling lifecycle dispatch to the full ExecutionOptions type.

### 2. Implement dual-path execution in `dispatchLifecycleEvent`

When `verifyCompiledEffects` is true AND a compiled path exists:

```typescript
if (verifyCompiledEffects && compiledSeq !== undefined) {
  // Run compiled path
  const compiledResult = compiledSeq.execute(currentState, currentRng, {}, compiledCtx);

  // Run interpreted path (on the SAME input state)
  const interpretedResult = applyEffects(lifecycleEffects, interpretedCtx);

  // Compare
  const compiledHash = computeFullHash(compiledResult.state, def);
  const interpretedHash = computeFullHash(interpretedResult.state, def);

  if (compiledHash !== interpretedHash) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledSeq.phaseId,
      lifecycle: compiledSeq.lifecycle,
      compiledHash,
      interpretedHash,
      coverageRatio: compiledSeq.coverageRatio,
    });
  }

  // Also verify RNG state
  if (compiledResult.rng.state !== interpretedResult.rng.state) {
    throw new CompiledEffectVerificationError({ ... rng mismatch details ... });
  }

  // Use the compiled result (verified correct)
  effectResult = compiledResult;
}
```

### 3. Define `CompiledEffectVerificationError`

In `effect-compiler-types.ts` (or a new error file):

```typescript
export class CompiledEffectVerificationError extends Error {
  readonly phaseId: string;
  readonly lifecycle: 'onEnter' | 'onExit';
  readonly compiledHash: string;
  readonly interpretedHash: string;
  readonly coverageRatio: number;
}
```

### 4. Thread verification flag through `applyMoveCore`

`applyMoveCore` in `apply-move.ts` calls `dispatchLifecycleEvent`. The `ExecutionOptions.verifyCompiledEffects` flag must be forwarded. Trace the call chain and add the parameter where needed.

### 5. Enable verification in the test suite

Add a test helper or configuration that runs the full test suite with `verifyCompiledEffects: true`. This should be the default for CI but can be disabled for benchmarks.

## Files to Touch

- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — add dual-path logic)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify — add error class)
- `packages/engine/src/kernel/apply-move.ts` (modify — thread verification flag)
- `packages/engine/src/kernel/apply-move-pipeline.ts` (modify — thread verification flag if needed)

## Out of Scope

- The compiler itself (74COMEFFSEQ-002, 003, 004)
- Cache management (74COMEFFSEQ-005)
- Performance benchmarking (74COMEFFSEQ-007)
- Making verification the permanent default (can be decided later)
- Detailed state diff output beyond hash comparison (nice-to-have, not required)

## Acceptance Criteria

### Tests That Must Pass

1. With `verifyCompiledEffects: true`, a correct compiled path passes verification silently.
2. With `verifyCompiledEffects: true`, a deliberately broken compiled path (simulated by tampering) throws `CompiledEffectVerificationError` with correct diagnostic fields.
3. With `verifyCompiledEffects: false` (or undefined), no verification overhead — only the compiled path runs.
4. Full Texas Hold'em simulation with `verifyCompiledEffects: true` completes without verification errors.
5. Full FITL simulation with `verifyCompiledEffects: true` completes without verification errors.
6. `CompiledEffectVerificationError` includes phaseId, lifecycle, both hashes, and coverageRatio.
7. RNG state is also verified (not just game state hash).
8. Existing suite: `pnpm -F @ludoforge/engine test`
9. Existing e2e suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. **Zero overhead when disabled**: Verification mode adds no runtime cost when `verifyCompiledEffects` is false/undefined.
2. **Determinism proof**: A passing verification run proves compiled and interpreted paths are bit-identical for that game + seed (Foundation 5).
3. **No behavioral change**: Verification mode uses the compiled result when it passes — it doesn't change game outcomes.
4. **Immutability**: Both paths receive the same input state, and neither mutates it (Foundation 7).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-verification.test.ts` — unit tests for dual-path comparison with correct and deliberately broken compilers.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` — integration test running a short Texas Hold'em game with verification enabled.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler-verification.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/compiled-effects-verification.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo typecheck`
