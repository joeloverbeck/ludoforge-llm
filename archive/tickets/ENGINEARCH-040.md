# ENGINEARCH-040: Consolidate scoped-var runtime access primitives across var/resource effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel effect runtime refactor + tests
**Deps**: none

## Problem

Scoped-var trace/event mapping is now centralized, but runtime access logic remains duplicated across `effects-var.ts` and `effects-resource.ts` (scope-specific definition lookup, state reads, and immutable writes). This creates the next architecture drift point when scoped-variable contracts evolve.

## Assumption Reassessment (2026-02-25)

1. `scoped-var-runtime-mapping.ts` now centralizes runtime scope translation for trace/event payloads.
2. `effects-var.ts` and `effects-resource.ts` still each implement their own scoped variable access branches (global/per-player/zone) for def lookup/read/write concerns.
3. Existing tests already cover broad runtime parity for scoped var-change behavior (including global/per-player/zone trace+event payload parity), so this ticket is not primarily a missing-coverage bug.
4. **Mismatch + correction**: scoped-var DRYness is incomplete until runtime access primitives (definition lookup, typed reads, immutable writes) are centralized, not just payload mapping.
5. **Scope correction**: add direct unit coverage for the new shared access helper to lock down canonical access-path contracts and reduce future drift risk.

## Architecture Check

1. A shared scoped-var runtime access module is cleaner and more robust than parallel per-effect branch trees, and it reduces cross-file semantic drift.
2. The work remains game-agnostic kernel/runtime infrastructure; no game-specific behavior is introduced into `GameDef` or simulation.
3. No backwards-compatibility aliasing or shim behavior is introduced.

## What to Change

### 1. Extract scoped-var runtime access module

Create internal helper primitives for:
- resolving scoped endpoints to runtime cells (`global`/`pvar`/`zone`)
- reading typed current values
- writing updated values immutably
- preserving existing runtime validation/error behavior

### 2. Refactor effect handlers to consume shared access primitives

Refactor `applySetVar`, `applyAddVar`, and `applyTransferVar` code paths to use the shared module for access concerns, while retaining existing behavior and diagnostics.

### 3. Add direct helper contract tests

Add focused tests for the new shared runtime access helper covering:
- scope-specific def lookup (`global`/`pvar`/`zoneVar`)
- typed read behavior (`number | boolean` vs `number`-only)
- immutable write behavior for each scope
- unchanged/related-state branch identity expectations after writes

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (new)
- `packages/engine/test/unit/effects-var.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (new)

## Out of Scope

- New gameplay mechanics or new effect types
- Changes to `GameSpecDoc` schema content
- Runner/UI/visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Scoped-var read/write semantics remain identical for `setVar`, `addVar`, and `transferVar`.
2. Scope-resolution/read/write behavior is implemented through shared runtime access primitives, not duplicated per-effect branch trees.
3. Shared helper contracts are directly covered by dedicated unit tests.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-variable runtime access behavior has one canonical implementation path per concern.
2. Kernel/runtime logic remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-var.test.ts` — verify `setVar`/`addVar` behavior parity after access-layer refactor.
2. `packages/engine/test/unit/transfer-var.test.ts` — verify `transferVar` behavior parity after access-layer refactor.
3. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — direct contract coverage for shared scoped access primitives.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added shared scoped runtime access module `scoped-var-runtime-access.ts` for canonical scoped var definition lookup, typed reads, and immutable writes.
  - Refactored `effects-var.ts` (`setVar`/`addVar`) to consume shared access primitives.
  - Refactored `effects-resource.ts` (`transferVar`) to consume shared access primitives for scoped int definition lookup, reads, and writes.
  - Added direct helper unit coverage in `scoped-var-runtime-access.test.ts`.
  - Strengthened effect-level tests with branch-identity invariants in `effects-var.test.ts` and `transfer-var.test.ts`.
- Deviations from original plan:
  - Scope expanded to add dedicated helper-contract unit tests and targeted branch-identity invariants, because behavior parity tests already existed but direct helper contracts were previously uncovered.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
