# ENG-203: Mandatory Grant and Action Outcome Contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic free-operation grant contracts, turn-flow pass/card-end controls, post-execution grant validation
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

The engine already supports declarative grant sequencing, viability gating, Monsoon exceptions, and sequence-bound space context. The remaining gap is narrower: a grant can still be optional at runtime, and a consumed free operation can still count even if it produces no meaningful action-level outcome. That prevents exact encoding of event text that means “you must take this granted step, and the step must actually do something.”

## Assumption Reassessment (2026-03-08)

1. Current grant model already supports ordering/locking (`sequence`), issuance/playability viability (`viabilityPolicy`), and sequence-bound move-zone reuse (`sequenceContext`). ENG-201 and ENG-202 already landed those capabilities and the current integration suite covers them.
2. Current production Ia Drang data already uses `viabilityPolicy` and `sequenceContext`; this ticket must not treat those as missing engine capabilities.
3. Current turn-flow card-end/pass logic does not distinguish optional versus required pending grants. A seat can still pass or let the card boundary advance while pending grants exist, because grants are tracked only as authorizations, not as obligations.
4. Current free-operation consumption is authorization-based only: if the move is legal and matches a pending grant, the grant is consumed even when the action resolves as an action-level no-op.
5. The engine does not currently expose a canonical generic “execution result metrics” contract for action outcomes. A broad guard language over arbitrary result metrics would introduce a second ad hoc rule surface. Correction: add one small canonical post-execution outcome contract instead of a general metrics DSL.

## Architecture Check

1. Extending the existing generic grant contract is cleaner than adding per-card/per-action hooks. The right home is the shared free-operation contract used by both event-side grants and effect-issued grants.
2. Required-completion semantics belong in turn-flow runtime, because the invariant is about unresolved grant obligations blocking pass/card-end, not about any one card.
3. Post-execution effectiveness should be modeled as one canonical contract on the grant itself, enforced after action execution but before the grant is considered successfully consumed.
4. Avoid a broad declarative “condition over execution-result metrics” surface in this ticket. The engine has no stable generic result-metric model yet, so that would be harder to keep robust than the current architecture. A smaller canonical outcome contract is the cleaner long-term foundation.
5. No compatibility shims or alias fields: add one canonical completion policy and one canonical outcome policy on the base grant contract.

## What to Change

### 1. Mandatory grant completion policy

Add a canonical grant-level completion policy on the shared free-operation grant contract so grants can explicitly declare that they must be resolved before pass/card-end can advance turn flow.

### 2. Canonical post-execution outcome contract

Add one generic grant-level outcome contract that rejects a consumed free operation when it had no meaningful action-level effect. Scope this to a robust, engine-owned contract surface rather than an arbitrary expression language over execution metrics.

### 3. Enforcement and diagnostics

Prevent pass/card-end advancement while required grants for the active seat remain unresolved, and reject free-operation moves that fail the outcome contract with explicit illegal reason/metadata.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify if shared grant lowering/schema needs the new contract fields)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify if effect-issued grants must carry the same contract fields)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` and legality metadata contracts (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` or `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify if pass blocking is surfaced during discovery)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Re-encoding production FITL card data to opt into the new contracts. That belongs in follow-up data tickets after the engine contract lands.
- A general-purpose execution-result metrics DSL or arbitrary condition language over post-action results.

## Acceptance Criteria

### Tests That Must Pass

1. Required pending free-operation grants block pass/card-end for the obligated seat until those grants are consumed or removed by policy.
2. A free operation that matches a required-outcome contract but resolves as an action-level no-op is rejected with deterministic illegal-reason metadata and does not silently consume the grant.
3. Existing sequence/viability/context behavior remains intact.
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Completion/outcome semantics are declarative and game-agnostic on the shared free-operation grant contract.
2. Enforcement is deterministic across seeds and does not depend on UI-specific choices.
3. Event-side grants and effect-issued grants share the same contract semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — required-grant pass/card-end blocking and outcome-contract pass/fail coverage on synthetic grant fixtures.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify failed outcome contract does not consume the pending grant and emits deterministic legality metadata.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` or `packages/engine/test/unit/kernel/legal-choices.test.ts` — verify pass suppression/blocking when the active seat still has required pending grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - Added canonical shared free-operation grant contract fields for `completionPolicy` and `outcomePolicy`, with schema/type propagation through CNL lowering, runtime grant payloads, and exported engine schemas.
  - Enforced required pending free-operation grants in turn-flow legality so pass/card-end progression is blocked while the obligated seat still has unresolved required grants.
  - Added post-execution outcome enforcement in `apply-move.ts` so `mustChangeGameplayState` rejects action-level no-op free operations with deterministic illegal-reason metadata and without consuming the pending grant.
  - Added unit and integration coverage for required-grant pass blocking, failed outcome-policy rejection, and shared contract/runtime error surfaces.
- Deviations from original plan:
  - Scope expanded to cover the shared grant contract module and runtime authorization helpers so event-issued and effect-issued grants share the same completion/outcome semantics.
  - Production Ia Drang data was not re-encoded here; follow-up tickets `ENG-204`, `ENG-223`, and `ENG-224` remain the data/runtime refinements on top of this contract.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
