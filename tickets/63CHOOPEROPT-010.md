# 63CHOOPEROPT-010: Dev-only ChooseNDiagnostics payload

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — choose-n-option-resolution.ts, legal-choices.ts
**Deps**: 63CHOOPEROPT-003, 63CHOOPEROPT-004, 63CHOOPEROPT-008

## Problem

Developers need visibility into how the chooseN resolver is performing: which strategy was used, how many probes ran, how many witness nodes were visited, and whether caches helped. This is essential for tuning budget constants and verifying the optimization works in real FITL scenarios.

## Assumption Reassessment (2026-03-15)

1. Spec 8.3 defines `ChooseNDiagnostics` with fields: mode, exactOptionCount, provisionalOptionCount, singletonProbeCount, witnessNodeCount, probeCacheHits, sessionUsed.
2. This payload is dev-only, gated behind a flag. Not required in production responses.
3. No existing diagnostics infrastructure for chooseN — this is net new.

## Architecture Check

1. Diagnostics are collected during resolution and optionally returned as a sideband payload.
2. Gated behind a compile-time or runtime dev flag (e.g., `process.env.NODE_ENV !== 'production'` or a `LegalChoicesInternalOptions` flag).
3. No game-specific logic. Generic instrumentation.

## What to Change

### 1. Define `ChooseNDiagnostics` type

In `choose-n-option-resolution.ts` or `types-core.ts`:
```typescript
interface ChooseNDiagnostics {
  readonly mode: 'exactEnumeration' | 'hybridSearch' | 'legacyFallback';
  readonly exactOptionCount: number;
  readonly provisionalOptionCount: number;
  readonly stochasticOptionCount: number;
  readonly ambiguousOptionCount: number;
  readonly singletonProbeCount: number;
  readonly witnessNodeCount: number;
  readonly probeCacheHits: number;
  readonly sessionUsed: boolean;
}
```

### 2. Collect diagnostics during resolution

Thread a mutable diagnostics accumulator through the singleton probe pass and witness search. Increment counters as work proceeds.

### 3. Return diagnostics from strategy dispatcher

Add an optional `diagnostics` field to the internal return type of the strategy dispatcher. Only populated when dev flag is set.

### 4. Surface in worker (optional)

If dev flag is set, the worker can log diagnostics to console. Not serialized to the store.

### 5. Add performance assertion tests

Per spec 11.6, CI tests should assert:
- Max probe counts for known fixtures
- Max witness-node counts for known fixtures
- Cache hit behavior on repeated add/remove cycles
- Number of full pipeline reevaluations per toggle (1 with session, 2 without)

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify — collect diagnostics)
- `packages/engine/src/kernel/legal-choices.ts` (modify — thread diagnostics through dispatcher)

## Out of Scope

- Wall-clock benchmarking (separate perf harness, not a CI test)
- Production-facing diagnostics API
- UI display of diagnostics (maybe a dev panel in future)
- Store/bridge changes

## Acceptance Criteria

### Tests That Must Pass

1. New test: small-domain resolution → diagnostics.mode === 'exactEnumeration'
2. New test: large-domain resolution → diagnostics.mode === 'hybridSearch', singletonProbeCount > 0
3. New test: 20-option fixture → assert witnessNodeCount <= MAX_CHOOSE_N_TOTAL_WITNESS_NODES
4. New test: repeated add/remove cycle → probeCacheHits > 0
5. New test: diagnostics are NOT populated when dev flag is off
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostics collection has zero overhead when dev flag is off.
2. Diagnostics do NOT change resolution results — pure observation.
3. Diagnostics counters are accurate (not approximate).
4. Wall-clock measurements are NOT part of CI assertions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-diagnostics.test.ts` — diagnostics accuracy, mode detection, counter correctness
2. `packages/engine/test/performance/choose-n-performance.test.ts` — budget assertions for known fixtures (probe counts, witness nodes, cache hits)

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
