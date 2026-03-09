# FREEOP-001: Add grant-scoped action execution context

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — free-operation grant contracts, runtime state, compiler lowering, overlap/equivalence, eval/effect overlay context
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/types-turn-flow.ts`, `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/free-operation-grant-overlap.ts`, `packages/engine/src/kernel/eval-context.ts`, `packages/engine/src/kernel/effect-context.ts`

## Problem

Free-operation grants already carry two grant-scoped semantics end to end: `sequenceContext` for inter-grant sequencing and `zoneFilter` through the action preflight overlay. What they still cannot carry is a generic, data-authored execution payload that the granted action's legality, targeting, and effects can inspect the same way they inspect other runtime evaluation inputs. That gap forces event implementations to duplicate action-resolution logic whenever an event needs a normal operation with narrower targets or effect scope than the default action profile supports.

`card-47` (Chu Luc) exposed the limitation directly: the engine can grant ARVN a free Assault, but it cannot express "resolve that Assault against NVA only" as part of the grant. The current implementation therefore bypasses the free-operation architecture and resolves the assault as bespoke event effects.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/types-turn-flow.ts` still defines `TurnFlowFreeOperationGrantContract` and `TurnFlowPendingFreeOperationGrant` without any generic execution-context payload, but it already carries `sequenceContext`.
2. `packages/engine/src/kernel/free-operation-discovery-analysis.ts` already resolves execution seat/player plus grant-provided `zoneFilter`; the missing piece is a generic payload channel alongside those existing overlays, not a brand-new grant-discovery pipeline.
3. `packages/engine/src/kernel/free-operation-grant-overlap.ts` already includes `sequenceContext` in overlap/equivalence keys; any new execution payload must participate in the same classification rules or overlapping grants with different semantics could collapse incorrectly.
4. `packages/engine/src/kernel/apply-move.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`, `packages/engine/src/kernel/eval-context.ts`, and `packages/engine/src/kernel/effect-context.ts` already host the overlay/evaluation surfaces that free-operation-specific semantics flow through. The ticket must extend those surfaces, not bypass them with bespoke action handlers.
5. Mismatch: the earlier concern was phrased narrowly as a Chu Luc issue, but the current code shows a broader engine contract gap for any event that needs a normal operation with event-specific resolution constraints. Scope corrected to solve the generic transport problem instead of adding Assault-specific engine branches.

## Architecture Check

1. A generic grant-scoped execution-context surface is cleaner than adding operation-specific fields such as `assaultTargetFaction`, `airStrikeCasualtyMode`, or similar one-off engine knobs.
2. The cleanest extension point is the existing free-operation overlay path used by `zoneFilter`, not hidden binding-name conventions or operation-specific kernel branches.
3. The engine remains game-agnostic if it validates, resolves, transports, and exposes grant context generically while `GameSpecDoc` data decides how action profiles interpret that context.
4. No backwards-compatibility aliases or dual contracts should be added. Introduce the new field once, thread it end to end, and update callers/tests in place.

## What to Change

### 1. Extend the grant contract with a generic execution-context payload

Add an optional field on free-operation grants, recommended name `executionContext`, whose values are generic scalar/array payloads or scalar `ValueExpr` entries that are resolved when the grant is issued. The field must exist on both declarative event grants and effect-issued `grantFreeOperation` effects.

### 2. Carry the resolved context through pending-grant runtime and authorized move resolution

Persist the resolved payload on `TurnFlowPendingFreeOperationGrant`, include it in runtime schemas, and surface the authorized grant context through the same preflight/effect overlay path used for other free-operation execution semantics so action pipelines can read it during legality, targeting, and effect resolution.

### 3. Expose the context to data-authored action logic

Add a generic evaluation surface for action/profile data to read grant-scoped execution context without hardcoding Fire in the Lake concepts in kernel code. Prefer an explicit grant-context eval/query surface over implicit magic binding names. The surface should be available anywhere normal action bindings/conditions/effects are evaluated during a granted move.

### 4. Update overlap/equivalence semantics

Treat differing execution-context payloads as materially different grants in overlap/equivalence calculations. The engine must not silently authorize a move under one matching grant and execute it with another grant's payload.

### 5. Add contract and runtime regression coverage

Cover declarative grants, effect-issued grants, runtime schema validation, overlap ambiguity, and end-to-end action execution using the new context surface.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-zod.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-overlap.ts` (modify)
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify)
- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify if compiler coverage is needed)

## Out of Scope

- Fire in the Lake Assault data changes themselves.
- Reworking `card-47` event data.
- Adding game-specific helper fields to engine grant contracts.

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant can carry a context payload that is readable from the granted action's legality/targeting/effects through the normal eval/effect surfaces used by granted moves.
2. Overlapping grants with different execution-context payloads are treated as non-equivalent and fail or disambiguate deterministically by contract rather than silently sharing semantics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation grant authorization remains game-agnostic; the engine transports context but does not interpret game-specific payload keys.
2. Declarative event grants and effect-issued grants share the same contract and runtime behavior for execution-context payloads.

## Tests

1. Add a focused integration case in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` that proves a granted move can observe grant-scoped context and change legality/effect resolution accordingly.
2. Add overlap-ambiguity coverage in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` for otherwise-identical grants that differ only by execution-context payload.
3. Add contract/schema coverage for `executionContext` on both AST and runtime trace shapes.
4. Run targeted engine tests plus a broader engine suite to confirm the new contract does not regress existing free-operation events.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add execution-context transport, eval-surface access, and overlap-equivalence regressions.
2. `packages/engine/test/unit/schemas-ast.test.ts` — add AST contract coverage for `grantFreeOperation.executionContext`.
3. `packages/engine/test/unit/json-schema.test.ts` — add runtime trace/schema coverage for pending grant execution context.
4. `packages/engine/test/integration/compile-pipeline.test.ts` — extend coverage if compiler/lowering needs an end-to-end assertion for `executionContext`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-event-free-operation-grants.test.ts`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed:
  - Added a generic `executionContext` contract for declarative and effect-issued free-operation grants, including AST/schema support, compiler lowering, runtime validation, pending-grant persistence, and trace/schema artifacts.
  - Added explicit `grantContext` eval/query surfaces and threaded resolved grant context through free-operation preflight, legality, targeting, effects, and move application without introducing game-specific engine branches.
  - Tightened overlap/equivalence so otherwise-identical grants that differ by execution context are treated as materially distinct.
  - Adjusted legal-move discovery to use discovery-safe pipeline predicate evaluation for template enumeration, which prevents context-bound predicates from crashing ordinary discovery outside an active grant window.
  - Collapsed the internal free-operation runtime shape into a single engine-owned overlay object so eval contexts, effect contexts, and preflight wiring no longer duplicate parallel `zoneFilter` / diagnostics / grant-context fields.
- Deviations from original plan:
  - The implementation went beyond the original Chu Luc motivation and fixed the broader architectural gap around grant-scoped action context transport.
  - Discovery handling required an additional architectural correction in `legalMoves`: ordinary template enumeration now uses discovery semantics instead of strict predicate evaluation, because grant-scoped predicates are not valid outside their resolved free-operation overlay.
  - After archival, the internal runtime transport shape was simplified further to one overlay object; no `GameSpecDoc` contract or simulator semantics changed, but kernel ownership became cleaner and less drift-prone.
  - No Fire in the Lake card data was changed; the engine contract was generalized instead.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/integration/fitl-event-free-operation-grants.test.js` (from `packages/engine`)
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
