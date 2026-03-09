# FITLEVENTARCH-010: Canonical Legal-Move Decision Policy Surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legal move decision-policy centralization in kernel move-decision-sequence + legal-moves callsites
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-008-unknown-satisfiability-legal-move-policy-harmonization.md

## Problem

Unknown/unsatisfiable decision-sequence policy is only partially centralized:
- pipeline and free-operation unresolved branches now use a shared helper,
- event move enumeration still applies inline classification/fallback logic.

This leaves duplicated policy paths and reintroduces drift risk.

## Assumption Reassessment (2026-03-08)

### Code Reality

1. `legal-moves.ts` event path still performs local decision-policy handling (`classifyMoveDecisionSequenceSatisfiability` + local `shouldDeferMissingBinding` fallback + `classification === 'unsatisfiable'` gate).
2. Pipeline template admission in `legal-moves.ts` and free-operation unresolved admission in `legal-moves-turn-order.ts` route through `isMoveDecisionSequenceNotUnsatisfiable(...)`.
3. There is no single helper in `move-decision-sequence.ts` that includes both:
   - unsatisfiable exclusion policy, and
   - deferrable missing-binding normalization (`error -> unknown`) for legal-move admission.

### Test Reality

1. Behavioral coverage already exists for event admission semantics in `legal-moves.test.ts`:
   - deferrable binding keeps move,
   - unknown keeps move,
   - unsatisfiable excludes move.
2. What is missing is a policy-shape guard that ensures callsites use one canonical helper rather than reintroducing inline classification + fallback branches.

## Architecture Check

1. A single canonical legal-move decision-policy API is cleaner and more robust than per-callsite branching.
2. This remains game-agnostic kernel behavior; no game-specific rules are introduced.
3. No backward-compatibility aliasing/shims: convert callsites to the canonical API and remove inline policy duplication.

## Updated Scope

1. Add one canonical helper in `move-decision-sequence.ts` for legal-move admission that:
   - returns `false` only for `unsatisfiable`,
   - treats deferrable missing-binding runtime failures as `unknown` (admit).
2. Replace event-path inline policy logic in `legal-moves.ts` with the new helper.
3. Keep pipeline + free-operation unresolved branches on canonical helper paths (no behavior changes expected there).
4. Add/strengthen tests to guard the architectural shape (canonical helper usage) plus helper contract behavior.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Agent stochastic fallback contract work (`FITLEVENTARCH-009`)
- Event target payload/schema ownership tickets
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Event, pipeline, and free-operation unresolved legal-move branches derive admission from canonical helper APIs (no inline event-only policy branch).
2. Event-path behavior remains: unsatisfiable excluded; unknown/deferrable uncertainty retained.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move decision-sequence policy has a single kernel source of truth.
2. GameDef/simulator remain game-agnostic; no game-specific logic paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - add source-shape guard that event enumeration uses canonical legal-move decision-policy helper (no inline `classifyMoveDecisionSequenceSatisfiability`/`shouldDeferMissingBinding` branching).
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
   - add canonical helper contract tests for deferrable-error normalization + unknown/unsat handling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completed: 2026-03-08
- What changed:
  - Added canonical helper `isMoveDecisionSequenceAdmittedForLegalMove(...)` in `move-decision-sequence.ts` to centralize legal-move admission (`unsatisfiable` excluded, deferrable failures admitted).
  - Replaced event-path inline decision-policy logic in `legal-moves.ts` with the canonical helper.
  - Added helper-contract tests in `move-decision-sequence.test.ts` and an AST/source-shape guard in `legal-moves.test.ts` to prevent policy drift.
- Deviations from original plan:
  - Existing behavioral event-policy tests were already present; work focused on architectural centralization and policy-shape guarding rather than adding duplicate behavior tests.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
