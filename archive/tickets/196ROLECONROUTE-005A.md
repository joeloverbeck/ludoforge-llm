# 196ROLECONROUTE-005A: P4B prerequisite - bounded post-state role-constraint evaluation contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - generic plan-role constraint evaluation contract, role-bound post-state probe plumbing, compiler/runtime validation and witnesses
**Deps**: `archive/tickets/196ROLECONROUTE-004.md`

## Problem

`196ROLECONROUTE-005` needs to reject FITL ARVN Transport bindings where the origin loses control after the bound Transport move. Live reassessment on 2026-05-26 found that current role-constraint evaluation cannot observe that property: `constraintsSatisfied` receives only the current role binding, already-bound roles, current `GameState`, and the route graph provider. It does not receive a role-bound move, a bounded post-state probe, or a candidate-specific future state.

Implementing origin-control preservation as a current-state zone/set constraint would prove only that the origin is controlled before Transport, not that it remains controlled after the bound Transport choice. This ticket adds the generic post-state role-constraint substrate needed before `196ROLECONROUTE-005` can add the concrete generic control-preservation constraint and FITL migration.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/src/agents/plan-proposal.ts` binds plan roles before execution and calls `constraintsSatisfied(binding, role.constraints, existing, input.state, routeGraph)`.
2. `packages/engine/src/agents/plan-role-constraint-eval.ts` currently evaluates only current-state constraints: `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, and `notEqual`.
3. The role-binding layer has authored step matches and the root candidate, but it does not currently materialize a role-bound future decision or bounded post-state probe for a candidate binding.
4. `docs/FOUNDATIONS.md` requires compiler validation for static shape and runtime evaluation only for concrete state-dependent semantics. A weaker pre-state proxy would violate architectural completeness for the origin-preservation requirement.

## Architecture Check

1. **Generic substrate**: Add a game-agnostic post-state role-constraint evaluation contract that can evaluate a bounded predicate against the state produced by applying a role-bound candidate decision. Do not add FITL, ARVN, Transport, or control-specific branches.
2. **Compiler/runtime boundary**: The compiler validates the authored constraint shape, role references, step references, and boundedness metadata. Runtime evaluates only concrete candidate-specific state that cannot be known from GameSpecDoc alone.
3. **Constructibility and determinism**: The probe must use the same generic action/decision protocol as plan execution, remain bounded, and produce deterministic accept/reject results for identical `(GameDef, state, seed, role bindings)`.
4. **No compatibility shim**: Do not preserve or accept fake-zone encodings such as `zone.arvnControlledPopulationCenter` as a substitute for post-state semantics.

## What to Change

### 1. Define the post-state constraint substrate

Design a minimal generic contract for role constraints that need a bounded post-state probe. The contract must name:

- which plan step or role-bound decision is probed;
- which bound role supplies the candidate target;
- what boundedness cap applies;
- how the post-state predicate is evaluated without embedding game-specific logic.

### 2. Wire compiler and runtime support

Extend the plan-template validation, lowering, compiled types, schemas, and runtime role-binding path so post-state constraints can request and evaluate the bounded probe. Keep the existing current-state constraints unchanged except where they share reusable parsing/lowering infrastructure.

### 3. Add generic tests

Add focused tests proving:

- malformed or unresolved post-state constraint metadata fails with template/role-named diagnostics;
- role refs and step refs obey the same current-role/earlier-role ordering rules as other constraints;
- runtime admits a binding when the post-state predicate is true and rejects when false;
- repeated identical inputs produce byte-identical role-binding/proposal traces.

## Files to Touch

- `packages/engine/src/kernel/plan-role-constraints.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify)
- `packages/engine/test/unit/cnl/<focused-post-state-constraint-validation-test>.test.ts` (new or modify)
- `packages/engine/test/unit/agents/<focused-post-state-constraint-runtime-test>.test.ts` (new or modify)

## Out of Scope

- FITL ARVN Transport data migration and policy witness updates; owned by `tickets/196ROLECONROUTE-005.md`.
- Choosing the final FITL control-preservation authored shape beyond the generic substrate needed to support it.
- NVA route logistics and VC underground positioning migrations.
- Game-specific engine/compiler branches or per-game schemas.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler rejects malformed, unresolved, or unbounded post-state role-constraint metadata with template/role-named diagnostics.
2. Runtime rejects a role binding when the bounded post-state predicate is false and admits one when true.
3. The post-state probe uses the same generic decision/apply protocol as plan execution; no client-only or FITL-only legality path is introduced.
4. Determinism is preserved for repeated identical proposal inputs.
5. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific identifier or branch enters compiler/runtime code.
2. State-dependent post-state semantics are bounded and deterministic.
3. Existing current-state constraints preserve their behavior and compile-time diagnostics.
4. The fake-zone origin-control shape remains rejected or absent; it is not accepted as a compatibility alias.

## Test Plan

### New/Modified Tests

1. Focused CNL validation/lowering tests for the generic post-state constraint substrate.
2. Focused runtime tests for post-state admit/reject behavior.
3. Proposal trace determinism test for a role-bound post-state constraint.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused dist test paths>`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-26.

Implemented the generic bounded `postState` role-constraint substrate across the compiled role-constraint types, schema source, YAML validation/lowering, proposal binding, and runtime evaluation. The authored shape names a step, role-bound target, positive `maxSteps`, and a generic `roleLocatedIn` post-state predicate. Runtime probes apply the selected role-bound decision through the same generic `applyMove` protocol used by execution, with `maxPhaseTransitionsPerMove` enforcing the authored bound.

Added focused CNL validation/lowering coverage for valid and malformed `postState` metadata, role/step reference checks, and precedence behavior. Added runtime coverage proving a bounded post-state predicate admits satisfying bindings and rejects non-satisfying bindings. Updated proposal constraint-kind coverage to include `postState`.

Regenerated `packages/engine/schemas/GameDef.schema.json` from the retained generator after the compiled schema source changed.

### Deviations and Scope Notes

No FITL, ARVN, Transport, control-preservation, or fake-zone compatibility branch was added. The concrete FITL control-preservation migration remains owned by `tickets/196ROLECONROUTE-005.md`.

Source-size review found pre-existing oversized canonical schema/type surfaces (`types-core.ts`, `schemas-core.ts`, and `game-spec-doc.ts`) with small active growth from this ticket. The user approved the recommended option to keep this prerequisite focused and defer extraction rather than widen the ticket into schema/type decomposition. New shared runtime and compiler files touched by the implementation remain under the repository size cap.

### Generated Artifact Provenance

- Artifact path: `packages/engine/schemas/GameDef.schema.json`
- Generation command: `pnpm -F @ludoforge/engine run schema:artifacts`
- Canonical inputs: `packages/engine/src/kernel/schemas-core.ts` and `packages/engine/scripts/schema-artifacts.mjs`
- Refresh reason: new compiled `postState` plan-role constraint schema
- Generator durability: retained generator, `packages/engine/scripts/schema-artifacts.mjs`

### Verification

- `pnpm -F @ludoforge/engine build`
- `cd packages/engine && node --test dist/test/unit/agents/plan-proposal.test.js dist/test/unit/agents/plan-role-constraint-runtime.test.js dist/test/unit/cnl/plan-role-constraint-lowering.test.js dist/test/unit/cnl/plan-role-constraint-validation.test.js`
- `pnpm -F @ludoforge/engine test` (`171/171` files passed)
