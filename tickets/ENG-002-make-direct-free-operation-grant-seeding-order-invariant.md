# ENG-002: Make Direct Free-Operation Grant Seeding Order-Invariant

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel` pending free-operation legal-move discovery
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-001-unify-ready-pending-free-operation-grant-move-seeding.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`

## Problem

The new direct seeding path for ready non-`executionContext` free-operation grants can suppress a later valid grant solely because an earlier grant with the same `actionId` was visited first.

Today `enumeratePendingFreeOperationMoves()` records a coarse dedupe key before grant-specific preflight and viability checks. For pipeline-backed non-`executionContext` grants, that key collapses to `actionId`. If the first grant for that action is inapplicable, a later applicable grant for the same action may never be evaluated.

That creates order-sensitive legal move discovery, which is not acceptable for deterministic agnostic engine behavior.

## Assumption Reassessment (2026-03-11)

1. The current bug is not FITL-specific. It exists in generic kernel move discovery for any game using multiple ready pending grants that target the same action.
2. The issue is not covered by `ENG-001`. That ticket fixed the `executionContext` asymmetry, but it did not make the new direct-seeding path order-invariant.
3. The active FITL rollout ticket depends on generic free-operation behavior being correct, but this exact kernel defect is not specified there and should be tracked separately.

## Architecture Check

1. The cleaner design is to dedupe only after a grant has been evaluated into a viable candidate move, not before. That keeps discovery deterministic and removes incidental dependence on grant array order.
2. This stays fully game-agnostic. The fix belongs in the kernel’s grant enumeration rules, not in `GameSpecDoc` content or FITL-specific tests alone.
3. No backwards-compatibility aliasing or shadow paths should be added. The direct-seeding path should become correct on its own rather than relying on the old retrofit pass to mask ordering defects.

## What to Change

### 1. Move Dedupe Behind Grant-Specific Viability

Refactor `enumeratePendingFreeOperationMoves()` so a ready grant is not considered “seen” until after:

- grant-specific preflight has run
- pipeline dispatch / legality viability has been checked
- free-operation applicability / authorization checks have run
- the candidate move has been normalized to its actual move identity

The result must not depend on the order of `pendingFreeOperationGrants`.

### 2. Dedupe By Candidate Move Identity, Not Raw Action Id

Replace the current coarse action-id dedupe for non-`executionContext` pipeline grants with a key based on the actual emitted move shape and any grant-derived attributes that materially affect legality.

This specifically needs to preserve distinctions when grants differ by:

- effective action class
- `executeAsSeat` / execution player override
- zone-filtered viability
- other grant overlays that change whether the move is actually legal

### 3. Add Grant-Order Regression Coverage

Add tests that reverse pending grant order and prove the resulting legal free moves are identical.

At minimum, cover:

- first grant invalid, second grant valid for the same action
- class-distinct grants for the same action
- execute-as grants where one grant is unusable and another is usable

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- FITL card data changes
- runner or visual configuration changes
- broader free-operation architecture consolidation beyond the direct-seeding order bug

## Acceptance Criteria

### Tests That Must Pass

1. Reordering otherwise equivalent ready pending grants does not change the emitted legal free moves.
2. A later applicable ready grant is still surfaced even if an earlier same-`actionId` grant is inapplicable.
3. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Legal free-move discovery is deterministic with respect to grant ordering.
2. Deduplication never discards a viable grant-specific move candidate before its grant-specific legality has been evaluated.
3. `GameDef` and runtime remain agnostic; no game-specific branching is introduced.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — prove grant-order invariance and preserve class-distinct / execute-as variants for same-action grants.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — pin the kernel-level case where an earlier inapplicable grant must not suppress a later applicable grant.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm -F @ludoforge/engine typecheck`
