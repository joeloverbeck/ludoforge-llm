# ENGINE-001: Tighten free-operation ambiguity deferral to resolvable zone-binding cases only

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared free-operation discovery analysis and targeted kernel parity tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`

## Problem

The current ambiguity deferral change in free-operation discovery fixes the Vo Nguyen Giap follow-up regression, but it defers overlap whenever strongest grants have zone filters and the current move has no collected zone candidates. That is broader than the actual safe case. Discovery should defer overlap only when unresolved future decisions can still bind the move to discriminating zones; otherwise legal surfaces can drift from apply-time legality.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` already covered the good case: a free move whose later zone choice can bind exact-zone grants.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` and `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` already covered legal-move suppression and the motivating FITL regression well enough; they did not require code changes.
3. The remaining architecture gap was narrower than first assumed: `legalChoices` and `legalMoves` were already using the stricter discovery/probing path, but apply-time legality still downgraded wrapped unresolved exact-zone overlap into `zoneFilterMismatch` on the `turnFlowEligibility` surface.
4. The missing tests were the negative parity cases where no future zone binding exists, or only non-zone decisions remain.

## Architecture Check

1. The cleaner design is to keep overlap classification in `free-operation-discovery-analysis.ts`, because `legalChoices`, `legalMoves`, and `applyMove` all depend on that shared result.
2. This remains fully game-agnostic: the kernel reasons about move-shape and grant metadata, not FITL card ids or map semantics.
3. `free-operation-grant-authorization.ts`, `legal-choices.ts`, and `legal-moves-turn-order.ts` should stay unchanged unless the shared classifier proves insufficient. In this case it was sufficient.

## What to Change

### 1. Fix shared overlap classification

Teach `packages/engine/src/kernel/free-operation-discovery-analysis.ts` to treat wrapped unresolved zone-filter missing-bindings on the apply-time surface the same way it already treats raw unresolved discovery bindings, so strongest unresolved exact-zone overlap still reports `ambiguousOverlap`.

### 2. Expand parity coverage

Add kernel tests covering:
- deferral when a later zone decision really can resolve overlap
- rejection when no later zone decision exists
- rejection when later decisions exist but do not affect the grants’ discriminating zone bindings

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (verification only; no code change required)
- `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` (verification only; no code change required)

## Out of Scope

- FITL-specific card data changes.
- Any change to event DSL expressiveness.
- Broad redesign of free-operation sequencing beyond overlap deferral correctness.

## Acceptance Criteria

### Tests That Must Pass

1. Vo Nguyen Giap’s marched-space follow-up free operation remains discoverable and legal.
2. A free operation with unresolved strongest exact-zone overlap but no future discriminating zone binding is rejected consistently across `legalChoices`, `legalMoves`, and `applyMove`.
3. A free operation is also rejected when unresolved decisions remain, but they do not bind the aliases that distinguish the strongest grants.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalMoves`, `legalChoices`, and `applyMove` stay aligned on free-operation legality except for intentional discovery-time incompleteness where a later move decision can still resolve legality.
2. The overlap-deferral algorithm remains generic and depends only on move/grant structure, not on game-specific ids, maps, or rules text.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — added two negative parity regressions for unresolved exact-zone overlap with no future zone binding and with non-zone remaining decisions; retained the existing positive resolvable-overlap case.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — existing suppression coverage was retained and re-run unchanged.
3. `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` — existing motivating regression was retained and re-run unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
3. `node --test dist/test/unit/kernel/legality-surface-parity.test.js`
4. `node --test dist/test/unit/kernel/legal-moves.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-10
- What actually changed:
  - Tightened `free-operation-discovery-analysis.ts` so apply-time overlap analysis recognizes wrapped unresolved zone-filter missing-bindings as the same unresolved ambiguity that discovery already reports.
  - Added two negative parity regressions to `legality-surface-parity.test.ts` for non-resolvable exact-zone overlap.
- Deviations from original plan:
  - `legal-choices.ts` and `legal-moves-turn-order.ts` stayed unchanged. Their architecture already handled resolvable-vs-non-resolvable ambiguity correctly once the shared classifier was fixed.
  - `legal-moves.test.ts` and `fitl-events-vo-nguyen-giap.test.ts` remained unchanged because their existing coverage was already sufficient; they were re-run as verification.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/kernel/legality-surface-parity.test.js`
  - `node --test dist/test/unit/kernel/legal-moves.test.js`
  - `node dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
