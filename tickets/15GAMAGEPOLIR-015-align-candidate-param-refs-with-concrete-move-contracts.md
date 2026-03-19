# 15GAMAGEPOLIR-015: Align `candidate.param.*` Refs with Concrete Move Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy compiler/runtime contracts for concrete move params
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md

## Problem

Spec 15 says `candidate.param.<name>` reads concrete legal-move params, but the current compiler validates those refs against `doc.agents.parameters` instead of against the concrete move/action param surface. That is the wrong ownership boundary. It makes the authored policy DSL describe move params through unrelated agent parameter definitions and risks runtime/compiler drift whenever policies inspect actual move arguments.

## Assumption Reassessment (2026-03-19)

1. `compile-agents.ts` currently treats `candidate.param.<name>` as valid only when `<name>` matches an agents parameter id, even though Spec 15 defines the surface as concrete candidate move params.
2. The non-preview evaluator can read concrete `move.params` scalars/id lists directly at runtime, so the compiler/runtime contract is already inconsistent today.
3. No active ticket explicitly owns correcting this ownership boundary; preview, `PolicyAgent`, and authored baseline policy tickets all assume a working `candidate.param.*` surface.
4. Corrected scope: this ticket should move `candidate.param.*` ownership onto the concrete move contract itself and remove the current coupling to agents parameter definitions.

## Architecture Check

1. Validating `candidate.param.*` against the compiled move/action surface is cleaner than piggybacking on agents parameter ids, which are meant for policy tuning, not move-shape description.
2. This preserves the intended boundary: `GameSpecDoc` authors action params and policy logic, while `GameDef` carries a generic compiled contract the policy runtime can execute without game-specific exceptions.
3. One canonical source must define the type/allowed values of a candidate param ref. That source should be the compiled move contract, not duplicated policy metadata.
4. No backwards-compatibility alias where `candidate.param.foo` can mean either an action param or an agents parameter should survive.

## What to Change

### 1. Introduce a policy-visible candidate-param contract derived from concrete moves

Add or expose a compiled generic contract that describes which concrete move params are policy-visible and what policy type they lower to.

That contract should:

- be derived from the action/move surface, not agents parameter definitions
- support the Spec 15 allowed cases: scalar params and fixed id lists
- remain generic across games and action sets

### 2. Rewire compiler validation of `candidate.param.*`

Update policy expression analysis / agent compilation so `candidate.param.<name>`:

- validates against the compiled candidate-param contract
- rejects unsupported param shapes deterministically
- no longer depends on `doc.agents.parameters`

### 3. Keep runtime evaluation and compiled typing in lockstep

Update the evaluator/runtime boundary so the same contract drives:

- compile-time policy typechecking
- runtime extraction from `Move.params`
- deterministic diagnostics when policies reference unsupported or absent candidate params

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify if candidate-param contract metadata is added)
- `packages/engine/src/kernel/schemas-core.ts` (modify if contract shape changes)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify if direct analysis coverage is needed)

## Out of Scope

- introducing richer collection/object candidate param access beyond the Spec 15 surface
- `PolicyAgent` wiring
- preview masking work not directly tied to candidate param ownership
- authored FITL/Texas policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves `candidate.param.*` refs validate against the concrete move/action param contract, not agents parameters.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` proves supported concrete move params are readable at runtime and unsupported shapes fail deterministically.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` proves type inference for `candidate.param.*` stays aligned with the compiled candidate-param contract.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `candidate.param.*` refers only to concrete legal-move params and never to agents tuning parameters.
2. Compiler typing and runtime evaluation of candidate params come from the same compiled generic contract.
3. Supported candidate param surfaces remain bounded to Spec 15 scalar / fixed-id-list shapes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — ownership and validation of `candidate.param.*`.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime extraction and rejection semantics for concrete move params.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` — analysis/type inference parity for candidate param refs.

### Commands

1. `pnpm -C packages/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-expr.test.js`
3. `pnpm -C packages/engine test`
4. `pnpm run check:ticket-deps`
