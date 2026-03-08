# FITLEVENTARCH-012: Unify legal-move admission policy surface across callsites

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legal-move admission API unification in kernel callsites + architecture guards
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-011-preserve-fail-fast-on-nondefer-legal-move-admission-errors.md

## Problem

Legal-move admission policy is still split across two helper surfaces:
- `isMoveDecisionSequenceNotUnsatisfiable(...)` (classification-only)
- `isMoveDecisionSequenceAdmittedForLegalMove(...)` (classification + defer-context handling)

Event callsites use the new canonical helper, but pipeline/free-operation unresolved branches still use the older classification-only helper. This keeps policy expression fragmented and drift-prone.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/src/kernel/legal-moves.ts` event enumeration now uses `isMoveDecisionSequenceAdmittedForLegalMove(...)`.
2. Pipeline template gating in `legal-moves.ts` and free-operation unresolved gating in `legal-moves-turn-order.ts` still use `isMoveDecisionSequenceNotUnsatisfiable(...)` directly.
3. Mismatch + correction: one canonical admission API should cover all legal-move admission branches to prevent policy divergence as defer/error contracts evolve.

## Architecture Check

1. One admission helper surface is cleaner and more extensible than maintaining dual helper semantics at callsites.
2. This work is kernel policy unification only and preserves game-agnostic runtime boundaries (no game-specific behavior in GameDef/simulation).
3. No backwards-compatibility aliases/shims: migrate callsites to canonical helper directly and remove redundant policy pathways where possible.

## What to Change

### 1. Consolidate callsites onto canonical admission helper

Migrate unresolved legal-move admission callsites (event, pipeline, free-operation variants) to one canonical helper with explicit context wiring.

### 2. Clarify policy contexts and ownership

If needed, extend `MissingBindingPolicyContext` with explicit canonical contexts for pipeline/free-operation admission callsites instead of overloading event context strings.

### 3. Add source-shape policy guards

Add/extend AST/source guards that fail if legal-move callsites reintroduce direct `classifyMoveDecisionSequenceSatisfiability(...)`/`isMoveDecisionSequenceNotUnsatisfiable(...)` usage for admission decisions.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify, if new contexts required)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)

## Out of Scope

- Event target payload/schema ownership work (`FITLEVENTARCH-004/005/006`)
- GameSpecDoc content changes and visual-config presentation data
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Event, pipeline, and free-operation unresolved legal-move branches all derive admission from one canonical helper surface.
2. Admission semantics remain deterministic: `unsatisfiable` excluded, deferrable unknown admitted, non-deferrable failures throw.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move admission policy has one kernel source of truth and explicit context ownership.
2. GameDef/simulation/kernel stay game-agnostic; GameSpecDoc and visual-config remain data-only and outside kernel policy logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — extend source-shape guards to assert pipeline/event admission callsites use canonical helper only.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — extend canonical helper contract matrix coverage across satisfiable/unknown/unsatisfiable/defer/throw outcomes.
3. `packages/engine/test/unit/kernel/legal-moves-turn-order.test.ts` (or nearest existing turn-order kernel test file) — assert free-operation unresolved admission path uses canonical helper contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
