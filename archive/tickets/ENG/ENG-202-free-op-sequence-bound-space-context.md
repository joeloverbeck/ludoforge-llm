# ENG-202: Free-Operation Sequence Bound Space Context

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — turn-flow runtime grant sequencing and zone-filter evaluation
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/free-operation-zone-filter-probe.ts

## Problem

Current free-operation chains enforce step order but cannot bind a later step to the concrete space selected in an earlier step. This prevents exact encoding of “then Sweep and Assault there” semantics in a generic, declarative way.

## Assumption Reassessment (2026-03-08)

1. Confirmed: sequence support (`sequence.chain`/`sequence.step`) already enforces ordering/locking in runtime and discovery, but does not persist selected-space context from consumed grants.
2. Confirmed: current `zoneFilter` probing can evaluate candidate zones and rebind aliases, but it is stateless across grant consumption and cannot reference prior-step selections.
3. Confirmed mismatch in current Ia Drang encoding: Sweep/Assault are currently constrained by repeated NVA-presence predicates, not by “same space as prior Air Lift step.”
4. Correction: add canonical sequence-context capture/reference contracts on grants plus runtime persistence keyed by sequence batch.

## Architecture Check

1. A generic sequence-context mechanism is cleaner than card-specific special-case runtime hooks.
2. Captured context is runtime state keyed by grant sequence/batch and referenced declaratively by grant metadata, preserving engine agnosticism.
3. No compatibility shims: add one canonical context model and strict validation.

## What to Change

### 1. Add sequence context capture/reference fields

Extend free-operation grant contracts/schemas with explicit sequence-context fields:
- capture move zone candidates on grant consumption under a declarative key
- require later grants to match previously captured zones by key
- enforce strict schema/runtime validation for malformed sequence-context contracts

### 2. Persist context in turn-flow runtime

Store sequence context alongside pending grants (keyed by `sequenceBatchId`) and clear when sequence batches complete/expire.

### 3. Enforce context in grant authorization

Augment grant matching/authorization (including discovery and final apply) so later grants are legal only when move zone selection matches captured context.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/free-operation-denial-contract.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Action-level non-noop/effectful requirements.
- Event side playability gating beyond grant viability policies.

## Acceptance Criteria

### Tests That Must Pass

1. A chained grant can capture selected zone from step N and requires step N+1 move zone to match.
2. Cross-zone free move for later step is denied with explicit grant/block reason.
3. Ia Drang unshaded free Sweep/Assault are constrained to Air Lift-selected space context (“there”).
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Sequence context is generic and does not encode FITL-specific ids or zone names.
2. Context lifecycle is deterministic and fully cleared when sequence completes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add sequence-context capture/reuse/clear tests.
2. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — validate Sweep/Assault constrained to Air Lift context space.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`

## Outcome

Implemented versus original plan:

1. Added canonical declarative sequence-context contracts to free-operation grants:
   - `sequenceContext.captureMoveZoneCandidatesAs`
   - `sequenceContext.requireMoveZoneCandidatesFrom`
2. Persisted sequence context in turn-flow runtime (`freeOperationSequenceContexts`) and enforced deterministic lifecycle cleanup when sequence batches are no longer pending.
3. Enforced sequence-context matching in both discovery and final authorization paths; preserved decision-stage discovery by allowing unresolved-zone deferral during template analysis only.
4. Added explicit denial diagnostics for context mismatches via `sequenceContextMismatchGrantIds` on free-operation denial context.
5. Re-encoded Ia Drang unshaded grants to use sequence context for “there” semantics (capture on Air Lift, require on Sweep/Assault), replacing duplicated NVA-presence filters on follow-up steps.
6. Strengthened tests:
   - New integration coverage for sequence-context capture/reuse/clear and cross-zone denial diagnostics.
   - Ia Drang integration now asserts follow-up free Sweep denial outside captured space context.
   - Updated 1965 NVA production encoding expectation for card 44.
