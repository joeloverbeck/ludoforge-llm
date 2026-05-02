# 149FITLEVNUMVM-019: Phase 4B generic kernel expression/query AOT

**Status**: PENDING — Phase 4B runtime-closure prerequisite
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic kernel/CNL expression, condition, query, selector, or filter evaluation paths identified by profiling
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`

## Problem

Ticket 016's VM-enabled one-card profile proved the current policy bytecode VM is not the dominant remaining wall-time owner. The captured CPU profile classified about 22.9% of samples under generic kernel expression/query interpretation:

- `resolveRef`
- `evalCondition`
- `evalValue`
- `evalQuery`
- spatial evaluation
- token-filter evaluation

Those surfaces are repeated interpretation of stable declarative `GameDef` / CNL rule data during preview application. They are suitable for a generic AOT or bytecode strategy, but they are not covered by the current policy-expression VM.

## What to Change

1. Reprofile or inspect the Phase 4B profile and identify the exact expression/query families on the one-card path.
2. Design and implement the narrowest generic compiled representation that removes repeated object-walking for the proven hot families.
3. Keep the implementation game-agnostic:
   - no FITL-specific opcodes;
   - no per-game schema;
   - all semantics derived from compiled `GameDef` surfaces.
4. Preserve existing runtime semantics for:
   - reference resolution;
   - condition truthiness and unknown handling;
   - integer-only value evaluation;
   - selector/query ordering;
   - diagnostics where the compiled path rejects or falls back.
5. Add focused correctness tests that compare compiled and existing evaluator results on representative shared fixtures plus at least one FITL production witness.
6. Record baseline/current profile evidence in this ticket's Outcome.

## Files to Touch

- Generic kernel/CNL evaluator modules identified by live profiling, likely under `packages/engine/src/kernel/`
- New generic compiler/AOT helper modules if needed
- Focused tests under `packages/engine/test/unit/` or `packages/engine/test/integration/`
- `tickets/149FITLEVNUMVM-019.md`

## Out of Scope

- Policy-expression VM default flip or closure-tree deletion; ticket 016 owns that.
- Preview token-index copy/lifetime; ticket 020 owns that.
- Preview hashing/verification strategy; ticket 021 owns that.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Focused compiled-vs-existing correctness tests pass.
2. The one-card profile shows a measured reduction in kernel expression/query samples or wall time, or the Outcome records why this bucket is no longer the active owner.
3. No game-specific branches, opcodes, or schemas are introduced.
4. Any fallback or unsupported path is explicit, measured, and not a compatibility shim that survives into ticket 016's final F14 cut unless another ticket owns its removal.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the compiled expression/query path.
3. `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-kernel-aot`.
