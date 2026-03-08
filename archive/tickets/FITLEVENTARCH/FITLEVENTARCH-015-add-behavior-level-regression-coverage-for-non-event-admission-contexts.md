# FITLEVENTARCH-015: Add behavior-level regression coverage for non-event admission contexts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legal-move behavior regression tests only
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-012-unify-legal-move-admission-policy-surface-across-callsites.md, tickets/FITLEVENTARCH-014-centralize-missing-binding-policy-context-identifiers.md

## Problem

Current coverage strongly validates helper contracts and source-shape architecture, but behavior-level legal-move tests are event-heavy. Non-event admission contexts (pipeline and free-operation unresolved paths) do not yet have dedicated end-to-end legal-move regression tests for defer-vs-throw semantics at enumeration level.

## Assumption Reassessment (2026-03-08)

1. `legal-moves.ts` and `legal-moves-turn-order.ts` now route unresolved admission through canonical helper with explicit non-event contexts.
2. Existing tests already cover related behavior (for example free-operation unknown/unsatisfiable paths and malformed decision-path failures), plus AST/source-shape contracts for canonical helper routing.
3. Discrepancy + correction: what is still missing is explicit defer-vs-throw behavior coverage at the two non-event decision-admission contexts (`legalMoves.pipelineDecisionSequence` and `legalMoves.freeOperationDecisionSequence`) for unresolved-binding vs non-deferrable failures.
4. Scope is narrowed to those explicit context-level regression assertions to avoid duplicating adjacent coverage.

## Architecture Check

1. Behavior-level tests complement source-shape guards and produce stronger long-term robustness for policy evolution.
2. This work is pure test hardening for game-agnostic kernel behavior; no game-specific runtime logic is introduced.
3. Proposed changes are more beneficial than current architecture because they verify externally observable behavior instead of only import/call topology, reducing false confidence from AST-only checks.
4. No backwards-compatibility aliases/shims are added; tests assert canonical policy semantics only.

## What to Change

### 1. Add pipeline admission behavior tests

Add legal-moves tests that exercise `legalMoves.pipelineDecisionSequence` admission and assert:
- deferrable missing-binding path remains admitted (candidate present)
- non-deferrable path throws (fail-fast)

### 2. Add free-operation admission behavior tests

Add legal-moves tests covering `legalMoves.freeOperationDecisionSequence` admission and assert:
- deferrable missing-binding path remains admitted for free-operation candidate generation
- non-deferrable path throws in legal-move enumeration

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Kernel policy logic changes
- Missing-binding context taxonomy changes
- GameSpecDoc or visual-config data edits

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline unresolved legal-move admission behavior is directly validated at legal-moves layer for defer-vs-throw outcomes.
2. Free-operation unresolved admission behavior is directly validated at legal-moves layer for defer-vs-throw outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move admission remains deterministic and fail-fast outside deferrable contexts.
2. Kernel/simulator behavior remains game-agnostic and independent from game-specific presentation data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add pipeline unresolved admission behavior test pair (admit deferrable, throw non-deferrable).
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add free-operation unresolved admission behavior test pair (admit deferrable, throw non-deferrable).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Outcome amended: 2026-03-08

- Completion date: 2026-03-08
- What changed:
  - Updated ticket assumptions/scope to reflect existing adjacent coverage and target the remaining gap precisely.
  - Added four legal-moves regression tests in `packages/engine/test/unit/kernel/legal-moves.test.ts`:
    - `24d` pipeline context admits deferrable missing-binding unresolved decision paths.
    - `24e` pipeline context rethrows non-deferrable unresolved decision errors.
    - `24f` free-operation context admits deferrable missing-binding unresolved decision paths.
    - `24g` free-operation context rethrows non-deferrable unresolved decision errors.
- Deviations from original plan:
  - No kernel runtime/policy code changes were required; gap was fully addressed via behavior-level tests.
  - Free-operation coverage was implemented using action-effect decision probing in legal-move enumeration (still at legal-moves layer), avoiding redundant overlap with existing pipeline and zone-filter tests.
  - Post-archive refinement: extracted reusable card-driven test fixture helpers (`makeCardDrivenRuntime`, `makeCardDrivenState`) and applied them to free-operation admission tests to reduce duplicated setup and improve long-term test maintainability without changing behavior.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
