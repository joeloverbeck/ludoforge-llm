# FREEOP-001: Add grant-scoped action execution context

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — free-operation grant contracts, runtime state, compiler lowering, overlap/equivalence, action execution context
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/types-turn-flow.ts`, `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/free-operation-grant-overlap.ts`

## Problem

Free-operation grants can currently constrain seat, action class, action IDs, zone filters, sequence context, and monsoon behavior, but they cannot carry a grant-scoped execution contract into the action profile that ultimately resolves the move. That gap forces event implementations to duplicate action-resolution logic whenever an event needs a normal operation with narrower targets or effect scope than the default action profile supports.

`card-47` (Chu Luc) exposed the limitation directly: the engine can grant ARVN a free Assault, but it cannot express "resolve that Assault against NVA only" as part of the grant. The current implementation therefore bypasses the free-operation architecture and resolves the assault as bespoke event effects.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/types-turn-flow.ts` still defines `TurnFlowFreeOperationGrantContract` and `TurnFlowPendingFreeOperationGrant` without any opaque/generic execution-context payload.
2. `packages/engine/src/kernel/free-operation-discovery-analysis.ts` resolves execution seat/player and combined zone filter for granted moves, but it does not return any grant-scoped payload that action legality/effects can read.
3. `packages/engine/src/kernel/free-operation-grant-overlap.ts` computes overlap/equivalence keys from grant authorization fields only; if a payload were added and excluded from those keys, overlapping grants with different semantics could collapse incorrectly.
4. Mismatch: the earlier concern was phrased narrowly as a Chu Luc issue, but the current code shows a broader engine contract gap for any event that needs a normal operation with event-specific resolution constraints. Scope corrected to solve the generic transport problem instead of adding Assault-specific engine branches.

## Architecture Check

1. A generic grant-scoped execution-context surface is cleaner than adding operation-specific fields such as `assaultTargetFaction`, `airStrikeCasualtyMode`, or similar one-off engine knobs.
2. The engine remains game-agnostic if it validates, transports, and exposes opaque context generically while `GameSpecDoc` data decides how action profiles interpret that context.
3. No backwards-compatibility aliases or dual contracts should be added. Introduce the new field once, thread it end-to-end, and update callers/tests in place.

## What to Change

### 1. Extend the grant contract with a generic execution-context payload

Add an optional field on free-operation grants, recommended name `executionContext`, whose values are generic scalar/array payloads or lowerable value expressions that can be resolved when the grant is issued. The field must exist on both declarative event grants and effect-issued `grantFreeOperation` effects.

### 2. Carry the resolved context through pending-grant runtime and authorized move resolution

Persist the resolved payload on `TurnFlowPendingFreeOperationGrant`, include it in runtime schemas, and surface the authorized grant context during free-operation preflight/execution so action pipelines can read it during legality, targeting, and effect resolution.

### 3. Expose the context to data-authored action logic

Add a generic evaluation surface for action/profile data to read grant-scoped execution context without hardcoding Fire in the Lake concepts in kernel code. The surface should be available anywhere normal action bindings/conditions are evaluated during a granted move.

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
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Fire in the Lake Assault data changes themselves.
- Reworking `card-47` event data.
- Adding game-specific helper fields to engine grant contracts.

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant can carry a context payload that is readable from the granted action's legality/targeting/effects.
2. Overlapping grants with different execution-context payloads are treated as non-equivalent and fail or disambiguate deterministically by contract rather than silently sharing semantics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation grant authorization remains game-agnostic; the engine transports context but does not interpret game-specific payload keys.
2. Declarative event grants and effect-issued grants share the same contract and runtime behavior for execution-context payloads.

## Tests

1. Add a focused integration case in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` that proves a granted move can observe grant-scoped context and change resolution accordingly.
2. Add overlap-ambiguity coverage in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` for otherwise-identical grants that differ only by execution-context payload.
3. Run targeted engine tests plus a broader engine suite to confirm the new contract does not regress existing free-operation events.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add execution-context transport and overlap-equivalence regressions.
2. `packages/engine/test/integration/gamespec-capability-conformance.test.ts` — extend coverage if needed for lowerable effect-grant contract shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-event-free-operation-grants.test.ts`
3. `pnpm -F @ludoforge/engine test`
