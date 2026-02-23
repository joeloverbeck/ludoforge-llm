# FITLRULES2-007: Enforce Option Matrix For Pipeline-Backed Legal Moves

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel legal-move enumeration (turn-flow filtering)
**Deps**: None

## Problem

`turnFlow.optionMatrix` is now populated for production FITL, but pipeline-backed move templates are currently emitted without passing through option-matrix filtering. This allows second-eligible actions that violate Rule 2.3.4.

## Assumption Reassessment (2026-02-23)

1. `isMoveAllowedByTurnFlowOptionMatrix` exists and is applied in some enumeration paths (`enumerateParams`, event move path).
2. Pipeline template emission in `legal-moves.ts` currently pushes `{ actionId, params: {} }` without option-matrix gating.
3. Existing tests cover option-matrix behavior for non-pipeline actions, but there is no targeted regression that proves pipeline templates are matrix-filtered.
4. Mismatch: policy enforcement is path-dependent. Scope correction: enforce option matrix consistently for all move enumeration paths.

## Architecture Check

1. A single consistent turn-flow filter for all enumerated moves is cleaner than branch-specific checks.
2. This remains game-agnostic: kernel enforces generic card-driven constraints from `turnFlow` data; game-specific policy stays in `GameSpecDoc`.
3. No compatibility shim or alias path; old behavior that violates declared matrix is removed.

## What to Change

### 1. Apply option-matrix filtering to pipeline template path

Before adding a pipeline template move, apply the same matrix rule used by non-pipeline and event paths.

### 2. Consolidate filter location (required)

Use a single helper in `legal-moves.ts` for emitting candidate moves that applies option-matrix filtering before appending. Route all branch emissions (param-expanded, event, pipeline template) through this helper to eliminate branch drift.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify, only if needed for helper extraction)

## Out of Scope

- FITL-specific hardcoded action IDs or branching in kernel.
- Changes to `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline-backed second-eligible legal moves are constrained by matrix rows.
2. Existing synthetic option-matrix integration tests remain green.
3. Pipeline and non-pipeline emissions use the same option-matrix gate in `legal-moves.ts`.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Option-matrix legality is independent of which move-enumeration branch produced the move.
2. Turn-flow legality remains driven solely by generic `turnFlow` config.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-option-matrix.test.ts` — add/adjust assertion to prove pipeline-backed moves are matrix-filtered.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add branch-parity test for pipeline vs non-pipeline action emission under turn-flow option matrix.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- What changed:
  - `legal-moves.ts` now routes param-expanded moves, event-derived moves, and pipeline template moves through one shared option-matrix gate before emission.
  - Added integration regression in `fitl-option-matrix.test.ts` proving matrix enforcement for a pipeline-backed `operation` template as second eligible.
  - Added unit regression in `unit/kernel/legal-moves.test.ts` asserting branch parity for pipeline template emission under option matrix constraints.
- Deviations from original plan:
  - Consolidation of option-matrix filtering was promoted from optional to required and implemented directly via a shared emission helper.
  - Unit test location was corrected from generic `unit/legal-moves.test.ts` to `unit/kernel/legal-moves.test.ts` for pipeline-path coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (253/253).
  - `pnpm -F @ludoforge/engine lint` passed.
