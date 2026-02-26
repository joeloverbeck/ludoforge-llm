# ENGINEARCH-058: Introduce transactional batched scoped-var writer to minimize clone churn for multi-write effects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel scoped-var write internals + transferVar path test hardening
**Deps**: ENGINEARCH-056, ENGINEARCH-057

## Problem

Current batched writes iterate through `writeScopedVarToBranches`, cloning branch containers on each write. This is functionally correct but not ideal for extensibility/performance as future effects may apply larger write batches.

## Assumption Reassessment (2026-02-26)

1. `writeScopedVarsToBranches` currently performs sequential immutable updates, potentially recloning top-level and touched sub-branches multiple times per batch.
2. `transferVar` now uses batched writes and is a representative multi-write effect path.
3. Existing tests validate correctness, but there is no helper-level contract asserting minimal clone behavior per touched branch in a single batch.
4. **Mismatch + correction**: batched write internals should be transaction-oriented (clone touched branches once) while preserving immutable external behavior.

## Architecture Check

1. Transactional branch staging is cleaner for long-term extensibility than repeated per-write cloning and reduces risk as multi-write effects grow.
2. This remains entirely game-agnostic kernel mechanics; no game-specific logic crosses into runtime.
3. No backwards-compatibility shims/aliases are introduced.

## What to Change

### 1. Implement transactional batched writer internals

Refactor batched write internals to stage updates by branch scope and clone only touched structures once per batch application.

### 2. Preserve external helper contracts

Keep existing public helper semantics (`writeScopedVarsToState`, `writeScopedVarsToBranches`) and effect behavior unchanged.

### 3. Add identity/clone regression coverage

Add tests that assert untouched branches preserve identity and touched branches change predictably across multi-write batches.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify only if helper signature ripple requires it)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add if needed for integration identity parity)

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
2. `packages/engine/test/unit/transfer-var.test.ts` — integration guard that transferVar identity contracts remain stable after transactional writer refactor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
