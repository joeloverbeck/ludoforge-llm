# DECINSARC-005: Delete decision-occurrence.ts and decision-id.ts, update kernel exports

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — delete 2 files, update `index.ts`
**Deps**: DECINSARC-003, DECINSARC-004

## Problem

After DECINSARC-003 and DECINSARC-004, the old modules `decision-occurrence.ts` and `decision-id.ts` should have zero internal consumers. They must be deleted to prevent drift and ensure the codec in `decision-scope.ts` is the sole source of truth.

## Assumption Reassessment (2026-03-13)

1. `decision-occurrence.ts` exports: `DecisionOccurrenceContext`, `DecisionOccurrence`, `createDecisionOccurrenceContext`, `cloneDecisionOccurrenceContext`, `consumeDecisionOccurrence`, `resolveMoveParamForDecisionOccurrence`, `writeMoveParamForDecisionOccurrence`, `deriveCanonicalBindingAlias` — all consumers will have been migrated by DECINSARC-003/004.
2. `decision-id.ts` exports: `composeScopedDecisionId`, `extractResolvedBindFromDecisionId` — `composeScopedDecisionId` migrated in DECINSARC-003; `extractResolvedBindFromDecisionId` used by `iteration-context.ts` (runner) — must verify runner migration (DECINSARC-007) or provide equivalent in `decision-scope.ts`.
3. `index.ts` re-exports: `export * from './decision-occurrence.js'` and `export { extractResolvedBindFromDecisionId } from './decision-id.js'` — these lines must be removed.

## Architecture Check

1. Deleting obsolete modules prevents accidental reuse and eliminates dead code.
2. `parseDecisionKey()` from `decision-scope.ts` subsumes `extractResolvedBindFromDecisionId()` — the runner (DECINSARC-007) will use the codec parse function instead.
3. No backwards-compatibility re-exports needed.

## What to Change

### 1. Delete `packages/engine/src/kernel/decision-occurrence.ts`

Entire file. All consumers migrated in DECINSARC-003 and DECINSARC-004.

### 2. Delete `packages/engine/src/kernel/decision-id.ts`

Entire file. `composeScopedDecisionId` replaced by `advanceScope`. `extractResolvedBindFromDecisionId` replaced by `parseDecisionKey`.

### 3. Update `packages/engine/src/kernel/index.ts`

- Remove: `export * from './decision-occurrence.js'`
- Remove: `export { extractResolvedBindFromDecisionId } from './decision-id.js'`
- Ensure `export * from './decision-scope.js'` is present (added in DECINSARC-001)

### 4. Verify no remaining imports

- Grep the entire `packages/engine/src/` tree for any remaining imports of `decision-occurrence` or `decision-id`. Fix any stragglers.

## Files to Touch

- `packages/engine/src/kernel/decision-occurrence.ts` (delete)
- `packages/engine/src/kernel/decision-id.ts` (delete)
- `packages/engine/src/kernel/index.ts` (modify — remove old exports)

## Out of Scope

- Modifying any effect execution files (done in DECINSARC-003)
- Modifying move construction or legal-choices (done in DECINSARC-004)
- Modifying test helpers (DECINSARC-006)
- Modifying runner code (DECINSARC-007)
- Any game-specific changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` passes — no broken imports referencing deleted files
2. `pnpm turbo typecheck` passes
3. `grep -r "decision-occurrence" packages/engine/src/` returns zero results
4. `grep -r "decision-id" packages/engine/src/` returns zero results (excluding `decision-scope.ts` if it references the concept in comments)
5. `pnpm turbo lint` passes

### Invariants

1. `decision-scope.ts` is the sole source of truth for decision identity and scope operations.
2. No backwards-compatibility re-exports of deleted module symbols.
3. No dead imports remaining in any engine source file.

## Test Plan

### New/Modified Tests

1. No new tests — this is a deletion ticket
2. Any test files importing from `decision-occurrence` or `decision-id` will fail to compile and must be fixed in DECINSARC-006

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
