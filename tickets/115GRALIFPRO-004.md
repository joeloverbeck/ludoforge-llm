# 115GRALIFPRO-004: Replace scattered predicates with phase reads

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel predicate refactoring
**Deps**: `archive/tickets/115GRALIFPRO-002.md`, `archive/tickets/115GRALIFPRO-003.md`

## Problem

Grant readiness is currently computed from scratch by multiple predicates across 4+ files. `isRequiredPendingFreeOperationGrant` uses a `||` broadening to cover both `'required'` and `'skipIfNoLegalCompletion'` — a semantic contradiction in the predicate name that was introduced as a symptom patch (FREOPSKIP-001). `isPendingFreeOperationGrantSequenceReady` calls `resolvePendingFreeOperationGrantSequenceStatus` on every invocation, recomputing sequence readiness without caching. This ticket replaces all scattered predicates with simple phase reads.

## Assumption Reassessment (2026-04-07)

1. `isRequiredPendingFreeOperationGrant` is a private `const` in `turn-flow-eligibility.ts:132` — uses `grant.completionPolicy === 'required' || grant.completionPolicy === 'skipIfNoLegalCompletion'` — confirmed.
2. `isPendingFreeOperationGrantSequenceReady` is exported from `free-operation-grant-authorization.ts:78` — called in `turn-flow-eligibility.ts`, `legal-moves.ts`, `free-operation-discovery-analysis.ts`, `free-operation-grant-bindings.ts` — confirmed (16 occurrences).
3. `hasReadyRequiredPendingFreeOperationGrantForSeat` is a private `const` in `turn-flow-eligibility.ts:174` — delegates to both predicates above — confirmed.
4. After tickets 002 and 003, all grants have a `phase` field and lifecycle transitions are available.

## Architecture Check

1. Replacing computed predicates with phase reads eliminates redundant computation and establishes `phase` as the single source of truth (Foundation 15: root cause fix).
2. Phase reads are O(1) per grant vs. O(n) recomputation — bounded computation improvement (Foundation 10).
3. The replacement is mechanical: each predicate maps to a simple phase check. No new logic is introduced.
4. No backwards-compatibility wrappers — old predicates are replaced, not wrapped (Foundation 14).

## What to Change

### 1. Replace predicates in `turn-flow-eligibility.ts`

- Replace `isRequiredPendingFreeOperationGrant(grant)` with `grant.phase === 'ready' || grant.phase === 'offered'` at all 3 call sites.
- Replace `hasReadyRequiredPendingFreeOperationGrantForSeat(pending, seqCtx, seat)` with `pending.some(g => g.seat === seat && g.phase === 'ready')` at all 4 call sites.
- Remove both private `const` definitions after replacement.

### 2. Replace `isPendingFreeOperationGrantSequenceReady` calls

In `legal-moves.ts`, `free-operation-discovery-analysis.ts`, and `free-operation-grant-bindings.ts`:
- Replace `isPendingFreeOperationGrantSequenceReady(pending, grant, seqCtx)` with `grant.phase !== 'sequenceWaiting'`.
- Remove the imports of `isPendingFreeOperationGrantSequenceReady`.

### 3. Wire `advanceToReady` from lifecycle module

In `phase-advance.ts` (or the appropriate sequence progression call site), call `advanceToReady` from `grant-lifecycle.ts` when a grant's sequence predecessors are completed. This replaces the implicit "check if sequence-ready" pattern with an explicit phase transition.

### 4. Simplify `free-operation-grant-authorization.ts`

The `isPendingFreeOperationGrantSequenceReady` export can be removed or reduced to a thin wrapper reading `grant.phase !== 'sequenceWaiting'` if external consumers exist beyond the ones listed. Check for any remaining imports before removing.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify — replace 3 predicates)
- `packages/engine/src/kernel/legal-moves.ts` (modify — replace `isPendingFreeOperationGrantSequenceReady` calls)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify — replace `isPendingFreeOperationGrantSequenceReady` calls)
- `packages/engine/src/kernel/free-operation-grant-bindings.ts` (modify — replace calls if present)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify — remove or simplify export)
- `packages/engine/src/kernel/phase-advance.ts` (modify — wire `advanceToReady` transition)

## Out of Scope

- Viability check integration (ticket 005)
- Simulator error recovery removal (ticket 005)
- Test fixture migration (ticket 006)
- `consumeUse` wiring in `apply-move.ts` (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — no references to removed predicates.
2. `pnpm turbo build` passes.
3. `isRequiredPendingFreeOperationGrant` no longer uses `||` broadening — it reads `grant.phase`.
4. `isPendingFreeOperationGrantSequenceReady` is no longer called from `legal-moves.ts`, `free-operation-discovery-analysis.ts`, or `turn-flow-eligibility.ts`.

### Invariants

1. Grant phase is the ONLY source of truth for grant readiness — no function computes readiness from raw fields (Foundation 15).
2. Phase reads are O(1) per grant — no recomputation of sequence status (Foundation 10).
3. No backwards-compatibility wrappers around old predicates (Foundation 14).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` — update to test phase-based readiness instead of computed readiness (significant refactoring needed)

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm -F @ludoforge/engine test`
