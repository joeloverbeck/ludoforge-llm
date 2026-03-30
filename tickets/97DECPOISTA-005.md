# 97DECPOISTA-005: Split simulator-only flags out of kernel ExecutionOptions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — sim API, simulator internals, call sites, tests
**Deps**: tickets/97DECPOISTA-003.md, tickets/97DECPOISTA-004.md

## Problem

`runGame()` / `runGames()` currently accept the kernel's shared `ExecutionOptions` bag, but some fields on that bag are simulator-only concerns (`skipDeltas`, `snapshotDepth`). That mixes simulator policy into a kernel contract, weakens ownership boundaries, and makes the kernel options surface less coherent over time.

The snapshot work exposed this design issue more clearly: adding `snapshotDepth` to `ExecutionOptions` solved the immediate need, but the cleaner long-term architecture is to give the simulator its own options contract and pass a derived kernel-only options object into kernel entry points.

## Assumption Reassessment (2026-03-30)

1. `packages/engine/src/sim/simulator.ts` currently types its `options` parameter as `ExecutionOptions` and forwards that bag into `initialState()` / `applyTrustedMove()` after stripping `profiler` manually.
2. `ExecutionOptions` in `packages/engine/src/kernel/types-core.ts` now contains both kernel-facing flags (`verifyCompiledEffects`, `verifyIncrementalHash`, `trace`, etc.) and sim-only flags (`skipDeltas`, `snapshotDepth`).
3. Existing `runGame()` callers pass both classes of flags through the same object: for example `verifyCompiledEffects` / `verifyIncrementalHash` from tests and `skipDeltas` from performance/determinism tests.
4. No dedicated sim options type currently exists under `packages/engine/src/sim/`.
5. The current architecture can function as-is, so this refactor is a cleanup for ownership and extensibility, not a blocker for delivering Spec 97 snapshots.

## Architecture Check

1. **Cleaner ownership boundary**: Kernel execution options should describe kernel behavior only. Simulator concerns such as delta elision and snapshot capture belong to the sim layer, not the kernel contract (Foundation #8, #10).
2. **No backwards-compatibility shims**: This refactor should replace the mixed bag with a dedicated sim options type and update all call sites in one pass. No alias interfaces, deprecated fallbacks, or dual signatures (Foundation #9).
3. **Extensible without contamination**: Future simulator-only controls can grow on the sim options type without bloating kernel APIs, while kernel-specific flags remain authoritative and testable in the kernel module.

## What to Change

### 1. Introduce a sim-local options contract

Add a dedicated sim options module, for example `packages/engine/src/sim/sim-options.ts`, with a contract along these lines:

```typescript
interface SimulationOptions {
  readonly kernel?: ExecutionOptions;
  readonly skipDeltas?: boolean;
  readonly snapshotDepth?: SnapshotDepth;
  readonly profiler?: PerfProfiler;
}
```

Exact naming can be chosen during implementation, but the contract must make ownership clear: simulator-only flags are top-level sim options, and kernel options are nested rather than merged into one ambiguous bag.

### 2. Update simulator APIs to use the new contract

Change `runGame()` and `runGames()` in `packages/engine/src/sim/simulator.ts` to accept the new sim options type.

Implementation requirements:

- Build a kernel-only options object before calling `initialState()` / `applyTrustedMove()`.
- Stop storing `skipDeltas` and `snapshotDepth` on kernel `ExecutionOptions`.
- Keep the existing runtime behavior unchanged: snapshot capture remains opt-in and delta skipping remains sim-only.
- Remove any ad hoc option stripping that only exists because sim and kernel fields share one object.

### 3. Remove sim-only fields from kernel ExecutionOptions

In `packages/engine/src/kernel/types-core.ts`:

- Remove `skipDeltas`
- Remove `snapshotDepth`

Then update all engine tests, helpers, and callers to pass:

- `kernel: { ... }` for kernel execution flags
- top-level sim flags for simulator-only behavior

### 4. Update exports and tests

Export the new sim options type from `packages/engine/src/sim/index.ts`.

Update tests that currently pass mixed option bags through `runGame()` / `runGames()`, including:

- simulator unit/integration tests
- determinism tests using `verifyIncrementalHash`
- compiled-effects verification tests using `verifyCompiledEffects`
- performance/memory tests using `skipDeltas`
- snapshot integration/serialization tests from Spec 97

## Files to Touch

- `packages/engine/src/sim/sim-options.ts` (new)
- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify)
- `packages/engine/test/integration/sim/simulator.test.ts` (modify)
- `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` (modify)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify)
- `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` (modify)
- `packages/engine/test/memory/draft-state-gc-measurement.test.ts` (modify)
- `packages/engine/test/integration/sim/snapshot-integration.test.ts` (modify if 003 has landed)
- `packages/engine/test/integration/sim/snapshot-serialization.test.ts` (modify if 004 has landed)

## Out of Scope

- Changing snapshot payload shape or extraction behavior
- Changing kernel semantics for tracing, compiled-effect verification, or hash verification
- Runner-side API changes
- Any backwards-compatibility overloads that preserve the mixed options bag

## Acceptance Criteria

### Tests That Must Pass

1. `runGame()` / `runGames()` accept the dedicated sim options type, and all existing callers are updated without aliases.
2. Kernel entry points (`initialState`, `applyMove`, `applyTrustedMove`) no longer receive sim-only flags through `ExecutionOptions`.
3. Existing snapshot behavior, delta skipping, compiled-effect verification, and incremental hash verification still work through the new options structure.
4. Existing suite: `pnpm turbo test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. `ExecutionOptions` is kernel-owned and contains kernel execution concerns only.
2. Simulator-only controls (`skipDeltas`, `snapshotDepth`) live only on the sim options contract.
3. No dual-signature compatibility layer remains after the refactor.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — verify `runGame()` still honors sim-local flags after the options split.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` — verify nested kernel options still reach kernel behavior toggles correctly.
3. `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` — verify incremental hash validation still works through the new nested kernel options.
4. `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` — verify `skipDeltas` remains available as a simulator-only flag.
5. `packages/engine/test/integration/sim/snapshot-integration.test.ts` — verify `snapshotDepth` remains available as a simulator-only flag once snapshots are integrated.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `pnpm turbo lint`
