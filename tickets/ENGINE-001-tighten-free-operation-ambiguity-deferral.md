# ENGINE-001: Tighten free-operation ambiguity deferral to resolvable zone-binding cases only

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel/legal-moves`, `kernel/legal-choices`, free-operation discovery analysis, kernel tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/legal-moves-turn-order.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`, `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`

## Problem

The current ambiguity deferral change in free-operation discovery fixes the Vo Nguyen Giap follow-up regression, but it defers overlap whenever strongest grants have zone filters and the current move has no collected zone candidates. That is broader than the actual safe case. Discovery should defer overlap only when unresolved future decisions can still bind the move to discriminating zones; otherwise legal surfaces can drift from apply-time legality.

## Assumption Reassessment (2026-03-10)

1. Current discovery logic in `packages/engine/src/kernel/free-operation-discovery-analysis.ts` defers `ambiguousOverlap` based on `collectGrantMoveZoneCandidates(...).length === 0` for each strongest matching grant.
2. The new regression in `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` covers the good case: a move that still has a pending zone choice and will later disambiguate exact-zone grants.
3. There is no companion test for the bad case where no future decision can ever produce discriminating zone bindings. The ticket scope is to make that distinction explicit and enforced by tests.

## Architecture Check

1. The cleaner design is to centralize “is overlap deferrable?” on whether unresolved move decisions can still supply relevant zone bindings, rather than inferring from the current empty candidate set.
2. This remains fully game-agnostic: the kernel reasons about move-shape and grant metadata, not FITL card ids or map semantics.
3. No backwards-compatibility aliases or dual-path behavior should be kept. The old heuristic should be replaced, not accumulated.

## What to Change

### 1. Replace the current ambiguity deferral heuristic

Implement a stricter helper that only defers overlap when:
- the move is still incomplete in legal discovery, and
- unresolved decisions are capable of binding one or more move-zone aliases relevant to the competing grants, and
- those future bindings could distinguish the strongest grants.

### 2. Keep strict parity for completed or non-zone-disambiguable moves

Ensure that a free operation with no remaining relevant zone decisions is still reported as `freeOperationAmbiguousOverlap` by legal discovery and rejected by apply-time legality.

### 3. Expand parity and integration coverage

Add one or more kernel tests covering:
- deferral when a later zone decision really can resolve overlap
- rejection when no later zone decision exists
- rejection when later decisions exist but do not affect the grants’ discriminating zone bindings

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify, only if the refined helper needs caller adjustments)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify, if reusable overlap-analysis helpers belong there)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify or add coverage)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify or add coverage)
- `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` (modify only if additional assertions strengthen the original regression)

## Out of Scope

- FITL-specific card data changes.
- Any change to event DSL expressiveness.
- Broad redesign of free-operation sequencing beyond overlap deferral correctness.

## Acceptance Criteria

### Tests That Must Pass

1. Vo Nguyen Giap’s marched-space follow-up free operation remains discoverable and legal.
2. A free operation with unresolved strongest exact-zone overlap but no future discriminating zone binding is still surfaced as `freeOperationAmbiguousOverlap`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalMoves`, `legalChoices`, and `applyMove` stay aligned on free-operation legality except for intentional discovery-time incompleteness where a later move decision can still resolve legality.
2. The overlap-deferral algorithm remains generic and depends only on move/grant structure, not on game-specific ids, maps, or rules text.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add negative parity coverage for non-resolvable overlap and retain positive coverage for resolvable overlap.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add direct discovery-shape assertions for pending-vs-illegal overlap outcomes.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — verify free-operation variants are emitted only when overlap is genuinely deferrable.
4. `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` — preserve the motivating FITL regression.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
3. `node --test dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/legal-choices.test.js dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
