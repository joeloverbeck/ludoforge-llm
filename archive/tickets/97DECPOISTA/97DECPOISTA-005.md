# 97DECPOISTA-005: Split simulator-only flags out of kernel ExecutionOptions

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — sim API, simulator internals, call sites, tests
**Deps**: archive/tickets/97DECPOISTA/97DECPOISTA-003.md, archive/tickets/97DECPOISTA/97DECPOISTA-004.md

## Problem

`runGame()` / `runGames()` currently accept the kernel's shared `ExecutionOptions` bag, but some fields on that bag are simulator-only concerns (`skipDeltas`, `snapshotDepth`). That mixes simulator policy into a kernel contract, weakens ownership boundaries, and makes the kernel options surface less coherent over time.

The snapshot work exposed this design issue more clearly: adding `snapshotDepth` to `ExecutionOptions` solved the immediate need, but the cleaner long-term architecture is to give the simulator its own options contract and pass a derived kernel-only options object into kernel entry points.

## Assumption Reassessment (2026-03-30)

1. `packages/engine/src/sim/simulator.ts` still types its `options` parameter as `ExecutionOptions`, reads `snapshotDepth` / `skipDeltas` directly from that bag, and forwards the same bag into `initialState()` / `applyTrustedMove()` after stripping only `profiler`.
2. `ExecutionOptions` in `packages/engine/src/kernel/types-core.ts` currently mixes kernel-facing flags (`verifyCompiledEffects`, `verifyIncrementalHash`, `trace`, etc.) with sim-only flags (`skipDeltas`, `snapshotDepth`), which violates clean ownership boundaries.
3. The remaining active tickets do not otherwise own this issue. `archive/tickets/97DECPOISTA/97DECPOISTA-004.md` explicitly keeps options-layer cleanup out of scope, so this ticket is the right and only follow-up for the architectural boundary fix.
4. The real callers that must be updated are broader than this ticket originally listed: current mixed-option usage exists in `packages/engine/test/integration/compiled-effects-verification.test.ts`, `packages/engine/test/determinism/zobrist-incremental-parity.test.ts`, `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`, `packages/engine/test/determinism/draft-state-determinism-parity.test.ts`, `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts`, `packages/engine/test/memory/draft-state-gc-measurement.test.ts`, and `packages/engine/test/unit/sim/simulator.test.ts`.
5. `packages/engine/test/unit/types-exhaustive.test.ts` currently asserts that `ExecutionOptions` includes `snapshotDepth`; this test must be inverted as part of the refactor so type-level proof matches the new architecture.
6. No dedicated sim options type currently exists under `packages/engine/src/sim/`, and `packages/engine/src/sim/index.ts` does not yet export one.
7. The current architecture works functionally, so this is not a blocker for snapshot behavior. It is still the correct next cleanup because Foundations #8, #9, and #10 require ownership boundaries to match the real architecture rather than accreting mixed concerns indefinitely.

## Architecture Check

1. **Cleaner ownership boundary**: Kernel execution options should describe kernel behavior only. Simulator concerns such as delta elision and snapshot capture belong to the sim layer, not the kernel contract (Foundation #8, #10).
2. **No backwards-compatibility shims**: This refactor should replace the mixed bag with a dedicated sim options type and update all call sites in one pass. No alias interfaces, deprecated fallbacks, or dual signatures (Foundation #9).
3. **Extensible without contamination**: Future simulator-only controls can grow on the sim options type without bloating kernel APIs, while kernel-specific flags remain authoritative and testable in the kernel module.
4. **Tests for this issue belong here, not in 004**: serialization and snapshot-payload tests prove snapshot behavior; they do not prove option ownership. This ticket must carry the API-shape, caller-migration, and type-surface tests that demonstrate the boundary has been cleaned up.

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
- determinism helpers and parity tests using `skipDeltas`
- compiled-effects verification tests using `verifyCompiledEffects`
- performance/memory tests using `skipDeltas`
- type-surface tests that currently assert `ExecutionOptions.snapshotDepth`
- snapshot serialization tests from Spec 97 if `97DECPOISTA-004` has landed by implementation time

## Files to Touch

- `packages/engine/src/sim/sim-options.ts` (new)
- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify)
- `packages/engine/test/integration/sim/simulator.test.ts` (modify)
- `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` (modify)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify)
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (modify)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify)
- `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` (modify)
- `packages/engine/test/memory/draft-state-gc-measurement.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
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
4. Type-level proof no longer permits `ExecutionOptions['snapshotDepth']` or `ExecutionOptions['skipDeltas']`, and the sim surface exports the dedicated sim options contract instead.
5. Existing suite: `pnpm turbo test`
6. Existing suite: `pnpm turbo typecheck`
7. Existing suite: `pnpm turbo lint`

### Invariants

1. `ExecutionOptions` is kernel-owned and contains kernel execution concerns only.
2. Simulator-only controls (`skipDeltas`, `snapshotDepth`) live only on the sim options contract.
3. No dual-signature compatibility layer remains after the refactor.
4. `runGame()` / `runGames()` callers express intent explicitly: kernel behavior under `kernel`, simulator behavior at the sim options level.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — verify `runGame()` still honors sim-local flags after the options split.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` — verify nested kernel options still reach kernel behavior toggles correctly.
3. `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` — verify incremental hash validation still works through the new nested kernel options.
4. `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts` — verify `skipDeltas` remains available as a simulator-only flag.
5. `packages/engine/test/memory/draft-state-gc-measurement.test.ts` — verify the memory-measurement harness still uses sim-local delta skipping after the split.
6. `packages/engine/test/unit/types-exhaustive.test.ts` — verify `ExecutionOptions` no longer includes sim-only fields and the shared `MoveLog.snapshot` contract remains intact.
7. `packages/engine/test/unit/sim/simulator.test.ts` — verify `snapshotDepth` remains available as a simulator-only flag once snapshots are integrated.
8. `packages/engine/test/integration/sim/snapshot-serialization.test.ts` — update if `97DECPOISTA-004` lands first so the new sim options shape is covered end to end.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-30
- **What changed**:
  - Created `packages/engine/src/sim/sim-options.ts` with `SimulationOptions` interface (nests `kernel?: ExecutionOptions`, owns `skipDeltas`, `snapshotDepth`, `profiler`)
  - Removed `skipDeltas` and `snapshotDepth` from `ExecutionOptions` in `types-core.ts`
  - Updated `runGame`/`runGames` in `simulator.ts` to accept `SimulationOptions`; kernel options extracted via `options?.kernel`
  - Exported `SimulationOptions` from `sim/index.ts`
  - Migrated all test callers: kernel flags wrapped in `{ kernel: { ... } }`, sim flags unchanged at top level
  - Inverted type-surface assertion in `types-exhaustive.test.ts` to prove `ExecutionOptions` no longer includes sim-only fields
- **Deviations from plan**:
  - `profiler` forwarding to `initialState` preserved explicitly (old code passed full options to `initialState` including profiler for lifecycle profiling, stripped it only for `applyTrustedMove`). The new sim code replicates this by building `initOptions` with profiler merged into kernel options for `initialState` only.
  - `compiled-effects-texas-production-parity.test.ts` was not listed in the ticket's files-to-touch but required no code changes — it passes `{ profiler }` which is already a valid `SimulationOptions` top-level field.
- **Verification**: `pnpm turbo typecheck` pass, `pnpm turbo test` 5149/5149 pass, `pnpm turbo lint` pass
