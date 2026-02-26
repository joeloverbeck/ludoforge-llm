# ENGINEARCH-058: Introduce transactional batched scoped-var writer to minimize clone churn for multi-write effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel scoped-var transactional batched writer internals + scoped-var helper regression tests
**Deps**: ENGINEARCH-056, ENGINEARCH-057

## Problem

Current batched writes iterate through `writeScopedVarToBranches`, cloning branch containers on each write. This is functionally correct but not ideal for extensibility/performance as future effects may apply larger write batches.

## Assumption Reassessment (2026-02-26)

1. `writeScopedVarsToBranches` currently performs sequential immutable updates, potentially recloning top-level and touched sub-branches multiple times per batch.
2. `transferVar` now uses batched writes and is a representative multi-write effect path.
3. Existing tests already validate broad identity correctness for single writes and include `transferVar` integration identity checks (for example zoneVar transfer preserving unrelated branches).
4. **Mismatch + correction**: what is still missing is helper-level regression coverage that a *single multi-write batch* avoids repeated reconstruction of the same touched containers; this should be asserted directly at `writeScopedVarsToBranches`/`writeScopedVarsToState` boundaries.

## Architecture Check

1. Transactional branch staging is cleaner for long-term extensibility than repeated per-write cloning because each touched container can be copied once per batch and then mutated in staged working copies before final freeze into immutable return objects.
2. This remains entirely game-agnostic kernel mechanics; no game-specific logic crosses into runtime.
3. No backwards-compatibility shims/aliases are introduced.

## What to Change

### 1. Implement transactional batched writer internals

Refactor batched write internals to stage updates by branch scope and clone only touched structures once per batch application.

### 2. Preserve external helper contracts

Keep existing public helper semantics (`writeScopedVarsToState`, `writeScopedVarsToBranches`) and effect behavior unchanged.

### 3. Add identity/clone regression coverage

Add tests that assert untouched branches preserve identity, touched branches change predictably across multi-write batches, and same-branch multi-write batches do not force intermediate container churn behavior.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- New effect DSL/features
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Batched write helpers preserve current functional behavior and immutability invariants.
2. Multi-write batches update touched branches correctly while leaving untouched branches identity-stable.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Batched scoped-var writes remain deterministic and game-agnostic.
2. Internal write implementation is transactional, not repeated branch reconstruction per write.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add transactional identity/clone behavior assertions for multi-write batches.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- Actually changed:
  - Refactored `writeScopedVarsToBranches` to transactional staged writes so touched scope containers are cloned once per batch and updated through staged mutable copies before returning immutable state branches.
  - Kept `writeScopedVarToBranches` API contract intact by delegating it through the batched helper.
  - Added helper-level regression tests for repeated writes within a single batch and nested identity stability on untouched player/zone branches.
- Deviations from original plan:
  - Did not modify `effects-resource.ts` or `transfer-var.test.ts` because reassessment showed current `transferVar` integration identity coverage already exists; helper-focused tests were the actual gap.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (292/292).
  - `pnpm -F @ludoforge/engine lint` passed.
