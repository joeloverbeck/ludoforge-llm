# ENGINEARCH-006: Stage-Level Pipeline Predicates for Bound Selection Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler action-pipeline lowering, kernel pipeline/stage types and validators, legality probing/execution, and condition-display surfaces
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/cnl/compile-operations.ts`, `packages/engine/src/cnl/game-spec-doc.ts`, `packages/engine/src/kernel/types-operations.ts`, `packages/engine/src/kernel/pipeline-viability-policy.ts`, `packages/engine/src/kernel/apply-move.ts`, `packages/engine/src/kernel/legal-choices.ts`, `archive/tickets/ENGINEARCH-005-satisfiability-aware-choice-legality.md`

## Problem

Some operation legality and affordability rules depend on the exact subset chosen in an earlier stage, but current action-pipeline predicates only exist at the whole-pipeline level. GameSpecDoc can already express downstream subset-aware validation when a single top-level predicate is enough, and current legality probing can already evaluate many bound-subset cases correctly. The real gap is narrower: there is no declarative way to place legality/cost checkpoints on an individual stage after earlier stage bindings exist but before later stages execute. That forces authors to either over-approximate with one global predicate or encode validation indirectly in effects/data.

## Assumption Reassessment (2026-03-09)

1. [packages/engine/src/cnl/compile-operations.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-operations.ts) lowers pipeline-level `legality` and `costValidation` before any stage bindings are accumulated, while stage effects are lowered later with `collectSequentialBindings`. Within a stage, only `effects` currently participate in binding accumulation; the stage contract has no predicate fields to lower.
2. [packages/engine/src/kernel/legal-choices.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-choices.ts) already performs satisfiability-aware probing across staged decisions, including option-legality evaluation from downstream top-level `costValidation`. The engine is not missing generic subset probing; it is missing stage-local predicate checkpoints.
3. [packages/engine/src/kernel/apply-move.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts) and [packages/engine/src/kernel/pipeline-viability-policy.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/pipeline-viability-policy.ts) currently evaluate only whole-pipeline predicates before stage execution begins. There is no reusable “evaluate predicates at stage boundary with accumulated bindings” abstraction yet.
4. Current FITL PT-76 data still demonstrates the mismatch: `attack-nva-profile` in [30-rules-actions.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md) uses a global `paidMaxExpr = nvaResources + count(eligible troop-paying spaces)` cap. That blocks some illegal moves, but still over-permits selections where the chosen subset contains too many no-troop spaces and the troop-paying spaces exist only elsewhere. The engine therefore still lacks an exact declarative validation surface for subset-bound stage transitions.

## Architecture Check

1. Adding stage-level predicates is cleaner than adding a PT-76-specific selector primitive or hardcoding mixed-payment semantics into chooseN. It generalizes to any game where earlier-stage selections determine legality, affordability, or partial-execution boundaries of later stages.
2. The design keeps all game-specific rules in GameSpecDoc. The engine only gains a generic predicate timing hook for already-bound stage data; no FITL identifiers, markers, or cost rules enter agnostic layers.
3. The cleanest implementation is to extend the existing pipeline predicate machinery so both pipeline-level and stage-level checkpoints share the same outcome mapping, runtime-error contract, and discovery/apply semantics. Do not create a second bespoke “stage validation” subsystem.
4. No backwards-compatibility aliasing or legacy pipeline shapes should be introduced. Extend the existing action-pipeline/stage contracts directly and update all validators/schemas in lockstep.

## What to Change

### 1. Extend action-pipeline stage contracts

Add optional `legality` and `costValidation` fields to `ActionResolutionStageDef`, plus compiler/schema/validator support so stage predicates can reference bindings accumulated by prior stages.

### 2. Evaluate stage predicates during probing and execution

Update move execution and legality probing so each stage:
- inherits bindings produced by earlier stages,
- evaluates stage `legality` before exposing or executing downstream choices,
- evaluates stage `costValidation` before cost-bearing or partial stages that depend on selected subsets,
- reuses the existing illegal-move / illegal-choice outcomes without inventing game-specific error classes.

### 3. Preserve generic partial-mode semantics

Specify and implement how stage `costValidation` interacts with `atomicity: partial` vs `atomicity: atomic`, especially when action-level cost handling remains empty and the stage itself performs the effective spend. Prefer one deterministic checkpoint model that works for both top-level and stage-level predicates.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/kernel/types-operations.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)
- `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify or add)

## Out of Scope

- Reworking PT-76 data itself in this ticket
- Any runner/UI-specific presentation changes
- New game-specific selector primitives for FITL only

## Acceptance Criteria

### Tests That Must Pass

1. Stage predicates can reference a prior stage `chooseN` or `chooseOne` binding and reject an otherwise in-domain subset during `legalChoicesEvaluate`.
2. `applyMove` rejects the same subset with the same canonical predicate outcome instead of allowing execution through stage effects.
3. Schema/runtime validation accepts valid stage predicates and reports invalid stage predicate AST paths on the stage condition surface.
4. Pipeline/stage display surfaces expose stage predicates deterministically so rule-card / debug tooling remains aligned with runtime behavior.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Action-pipeline predicate timing remains deterministic and game-agnostic; stage predicates only add timing/context, not new game-specific semantics.
2. No operation requires engine-side knowledge of whether a selected option is "resource-paid" or "troop-paid"; GameSpecDoc expresses that with generic predicates over bindings and state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add a staged subset-affordability regression showing option legality depends on the exact selected combination at the stage boundary, not only a global pipeline predicate.
2. `packages/engine/test/unit/apply-move.test.ts` — add execution parity coverage proving the same staged predicate blocks or permits execution consistently with legality probing.
3. `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts` — extend the shared viability helper coverage so stage checkpoints reuse the same deterministic outcome mapping as pipeline-level predicates.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — extend pipeline/stage validation to cover stage-level `legality` and `costValidation` condition surfaces.
5. `packages/engine/test/unit/kernel/ast-to-display.test.ts` and/or `packages/engine/test/unit/kernel/condition-annotator.test.ts` — ensure stage predicates appear in debug/display surfaces.
6. `packages/engine/test/integration/decision-sequence.test.ts` — add an end-to-end staged-selection regression proving legal move exposure and actual execution stay aligned.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js packages/engine/dist/test/unit/apply-move.test.js packages/engine/dist/test/unit/kernel/pipeline-viability-policy.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/ast-to-display.test.js packages/engine/dist/test/unit/kernel/condition-annotator.test.js packages/engine/dist/test/integration/decision-sequence.test.js`
3. `pnpm turbo test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What changed: added optional stage-level `legality` and `costValidation` support in GameSpecDoc/compiler lowering, runtime pipeline/stage types, schema/runtime validation, legality probing, apply-move execution, schema artifacts, and tooltip/display surfaces.
- What changed: reused the existing pipeline viability machinery for stage checkpoints instead of introducing a separate stage-validation subsystem.
- What changed: threaded transient bindings emitted by earlier stage effects into later stage predicate checks and later stage effects, so staged pipelines can build on generic runtime data without a separate aliasing channel.
- What changed: added focused regressions for stage-bound legality probing, apply-move parity, partial stage-cost skipping, stage validation paths, stage viability helpers, display output, and an integration parity case.
- What changed: added transient-binding regressions proving a later stage predicate can consume an earlier stage binding and a later stage effect can materialize a value exported by an earlier stage.
- Deviations from original plan: no `condition-surface-contract.ts` change was needed because existing suffixes already compose correctly when the stage path is used as the base path.
- Deviations from original plan: the apply-move unit coverage lives in `packages/engine/test/unit/apply-move.test.ts`, not `packages/engine/test/unit/kernel/apply-move.test.ts`.
- Verification results: `pnpm -F @ludoforge/engine build`, targeted `node --test` coverage for the modified engine surfaces, `pnpm -F @ludoforge/engine run schema:artifacts`, `pnpm turbo test`, `pnpm turbo lint`, and the post-amendment focused transient-binding regression run all passed.
