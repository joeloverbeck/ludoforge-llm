# ENGINEARCH-006: Stage-Level Pipeline Predicates for Bound Selection Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler action-pipeline lowering, kernel pipeline types/schemas, legal-choice probing, move application
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/cnl/compile-operations.ts`, `packages/engine/src/kernel/types-operations.ts`, `packages/engine/src/kernel/apply-move.ts`, `packages/engine/src/kernel/legal-choices.ts`, `archive/tickets/ENGINEARCH-005-satisfiability-aware-choice-legality.md`

## Problem

Some operation legality and affordability rules depend on the exact subset chosen in an earlier stage, but current action-pipeline predicates are only available at the whole-pipeline level. Because `legality` and `costValidation` are compiled before stage bindings exist, GameSpecDoc cannot express subset-aware validation for later-bound selections such as "selected spaces without troop-payment support must not exceed current resources". The result is over-permissive legal move exposure and a need for data-level workarounds that only approximate the true rule.

## Assumption Reassessment (2026-03-09)

1. [packages/engine/src/cnl/compile-operations.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-operations.ts) lowers action-level `legality` and `costValidation` before stage bindings are accumulated, while stage effects are lowered later with `collectSequentialBindings`. That means pipeline predicates cannot legally reference bindings created by `chooseOne`/`chooseN` inside stages.
2. [packages/engine/src/kernel/apply-move.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts) executes pipeline cost handling before resolution stages, and [packages/engine/src/kernel/legal-choices.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-choices.ts) already supports satisfiability-aware probing of staged decisions. The missing capability is not probing breadth; it is the absence of a predicate surface that can observe already-bound stage selections.
3. Current FITL PT-76 data proves the mismatch: `attack-nva-profile` in [30-rules-actions.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md) uses a global `paidMaxExpr = nvaResources + count(eligible troop-paying spaces)` cap. That blocks some illegal moves, but still over-permits selections where the chosen subset contains too many no-troop spaces and the troop-paying spaces exist only elsewhere. The engine therefore still lacks an exact declarative validation surface for subset-bound costs.

## Architecture Check

1. Adding stage-level predicates is cleaner than adding a PT-76-specific selector primitive or hardcoding mixed-payment semantics into chooseN. It generalizes to any game where later-stage selections determine legality, affordability, or partial-execution boundaries.
2. The design keeps all game-specific rules in GameSpecDoc. The engine only gains a generic predicate timing hook for already-bound stage data; no FITL identifiers, markers, or cost rules enter agnostic layers.
3. No backwards-compatibility aliasing or legacy pipeline shapes should be introduced. Extend the existing action-pipeline/stage contracts directly and update all validators/schemas in lockstep.

## What to Change

### 1. Extend action-pipeline stage contracts

Add optional `legality` and `costValidation` fields to `ActionResolutionStageDef`, plus compiler/schema/validator support so stage predicates can reference bindings accumulated by prior stages.

### 2. Evaluate stage predicates during probing and execution

Update move execution and legality probing so each stage:
- inherits bindings produced by earlier stages,
- evaluates stage `legality` before exposing or executing downstream choices,
- evaluates stage `costValidation` before cost-bearing or partial stages that depend on selected subsets,
- maps failures to existing illegal-move / illegal-choice outcomes without inventing game-specific error classes.

### 3. Preserve generic partial-mode semantics

Specify and implement how stage `costValidation` interacts with `atomicity: partial` vs `atomicity: atomic`, especially when action-level cost handling remains empty and the stage itself performs the effective spend.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/kernel/types-operations.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify or add)

## Out of Scope

- Reworking PT-76 data itself in this ticket
- Any runner/UI-specific presentation changes
- New game-specific selector primitives for FITL only

## Acceptance Criteria

### Tests That Must Pass

1. Stage predicates can reference a prior stage `chooseN` binding and reject an otherwise in-domain subset during `legalChoicesEvaluate`.
2. `applyMove` rejects the same subset with the same predicate outcome instead of allowing execution through stage effects.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Action-pipeline predicate timing remains deterministic and game-agnostic; stage predicates only add timing/context, not new game-specific semantics.
2. No operation requires engine-side knowledge of whether a selected option is "resource-paid" or "troop-paid"; GameSpecDoc expresses that with generic predicates over bindings and state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add chooseN subset-affordability regression showing option legality depends on the exact selected combination, not only global max/min counts.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — extend pipeline/stage schema validation to cover stage-level `legality` and `costValidation`.
3. `packages/engine/test/integration/decision-sequence.test.ts` — add end-to-end staged-selection regression proving legal move exposure and actual execution stay aligned.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/integration/decision-sequence.test.js`
3. `pnpm turbo test`
