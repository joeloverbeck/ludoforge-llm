# 15GAMAGEPOLIR-015: Align `candidate.param.*` Refs with Concrete Move Contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy compiler/runtime contracts for concrete move params
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md

## Problem

Spec 15 says `candidate.param.<name>` reads concrete legal-move params, but the current compiler validates those refs against `doc.agents.parameters` instead of against the concrete move/action param surface. That is the wrong ownership boundary. It makes the authored policy DSL describe move params through unrelated agent parameter definitions and risks runtime/compiler drift whenever policies inspect actual move arguments.

## Assumption Reassessment (2026-03-19)

1. `compile-agents.ts` currently treats `candidate.param.<name>` as valid only when `<name>` matches an agents parameter id, even though Spec 15 defines the surface as concrete candidate move params.
2. The non-preview evaluator reads `candidate.move.params` directly at runtime, so compiler validation and runtime extraction already disagree today.
3. The compiler currently lowers agents before producing the final `GameDef`, and `lowerAgents()` does not yet receive the authored action surface it would need to validate candidate params against concrete moves.
4. Current compiled action metadata is sufficient to classify policy-safe scalar candidate params from authored action param domains, but it does not yet provide a robust static cardinality contract for every possible move-param array shape. The ticket must not promise more static precision than the engine currently owns.
5. No active ticket explicitly owns correcting this ownership boundary; preview, `PolicyAgent`, and authored baseline policy tickets all assume a working `candidate.param.*` surface.
6. Corrected scope: this ticket should move `candidate.param.*` ownership onto a single compiled policy-visible candidate-param contract derived from authored concrete move definitions, remove the current coupling to agents parameter definitions, and keep support bounded to candidate-param shapes the compiler can classify deterministically today.

## Architecture Check

1. Validating `candidate.param.*` against a compiled candidate-param contract derived from authored actions is cleaner than piggybacking on agents parameter ids, which are meant for policy tuning, not move-shape description.
2. This preserves the intended boundary: `GameSpecDoc` authors action params and policy logic, while `GameDef.agents` carries a generic compiled contract the policy runtime can execute without game-specific exceptions.
3. One canonical source must define the type and support status of a candidate param ref. That source should be the compiled candidate-param contract, not duplicated policy metadata or ad hoc runtime inspection.
4. No backwards-compatibility alias where `candidate.param.foo` can mean either an action param or an agents parameter should survive.
5. Because the current action surface does not statically describe every selected-value cardinality, this ticket should only expose candidate params whose policy type can be derived deterministically today. Any richer contract belongs in a follow-up that extends the shared move metadata itself.

## What to Change

### 1. Introduce a policy-visible candidate-param contract derived from authored concrete moves

Add or expose a compiled generic contract that describes which concrete move params are policy-visible and what policy type they lower to.

That contract should:

- be derived from the action/move surface, not agents parameter definitions
- be the single source used by both policy compilation and policy runtime
- support only candidate-param shapes the compiler can classify deterministically from authored move metadata today
- remain generic across games and action sets
- reject ambiguous/conflicting candidate param definitions across actions instead of silently widening or aliasing them

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

- `packages/engine/src/kernel/types-core.ts` (modify if candidate-param contract metadata is added to `AgentPolicyCatalog`)
- `packages/engine/src/kernel/schemas-core.ts` (modify if `AgentPolicyCatalog` schema changes)
- `packages/engine/src/cnl/compiler-core.ts` (modify to pass concrete move metadata into agent lowering)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify if direct analysis coverage is needed)

## Out of Scope

- introducing richer collection/object candidate param access beyond the candidate-param shapes the compiler can classify from authored move metadata today
- promising static support for id-list candidate params unless the shared move contract actually carries enough information to classify them deterministically
- `PolicyAgent` wiring
- preview masking work not directly tied to candidate param ownership
- authored FITL/Texas policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves `candidate.param.*` refs validate against the concrete move/action param contract, not agents parameters.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` proves supported candidate params are readable at runtime through the same compiled contract and unsupported/absent params fail deterministically.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` proves type inference for `candidate.param.*` stays aligned with the compiled candidate-param contract rather than agents parameters.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `candidate.param.*` refers only to concrete legal-move params and never to agents tuning parameters.
2. Compiler typing and runtime evaluation of candidate params come from the same compiled generic contract.
3. Ambiguous or unsupported candidate param shapes are rejected explicitly instead of being inferred loosely.
4. Supported candidate param surfaces remain bounded to policy-safe shapes that the shared move contract can classify deterministically today.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — ownership and validation of `candidate.param.*`.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime extraction and rejection semantics for concrete move params through the compiled candidate-param contract.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` — analysis/type inference parity for candidate param refs.

### Commands

1. `pnpm -C packages/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-expr.test.js`
3. `pnpm -C packages/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - added `AgentPolicyCatalog.candidateParamDefs` as the single compiled contract for policy-visible concrete move params
  - derived that contract from authored action param domains during agent lowering and threaded authored actions into `lowerAgents()`
  - removed the old compiler coupling where `candidate.param.*` validated against `doc.agents.parameters`
  - made the non-preview policy evaluator read candidate params only through the compiled candidate-param contract and fail closed on shape mismatches
  - regenerated `packages/engine/schemas/GameDef.schema.json` so the serialized runtime contract stays in sync
- Deviations from original plan:
  - bounded support to candidate-param shapes the current shared move metadata can classify deterministically today; the ticket no longer claims static id-list support without a stronger move-cardinality contract
  - no new preview or `PolicyAgent` work was added
- Verification results:
  - targeted build and policy tests passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm run check:ticket-deps` passed
