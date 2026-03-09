# ENG-206: Dedicated Sequence-Context Denial Cause and Legality Parity

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — free-operation denial contracts, legality mapping, diagnostics surfaces
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/free-operation-legality-policy.ts

## Problem

Sequence-context mismatch is currently reported as `zoneFilterMismatch`, conflating two independent contract failures. This weakens diagnostics, policy clarity, and test-level intent.

## Assumption Reassessment (2026-03-09)

1. Confirmed: `packages/engine/src/kernel/free-operation-discovery-analysis.ts` currently emits `zoneFilterMismatch` for both actual zone-filter predicate failures and sequence-context key mismatches.
2. Confirmed: `sequenceContextMismatchGrantIds` is already threaded through `FreeOperationBlockExplanation`, so the contract already acknowledges the distinction in data but not in the top-level cause.
3. Confirmed: legality mapping and choice-reason projection currently collapse both failures into the same denial/illegal-reason pair.
4. Correction: the ticket scope must include legality reason definitions and all tests that currently codify `freeOperationZoneFilterMismatch` for sequence-context failures.

## Architecture Check

1. Separate denial causes make contract boundaries explicit and easier to reason about.
2. This is engine-agnostic contract layering: no game-specific behavior is introduced.
3. No backwards-compatibility aliasing/shims: use one canonical cause and update all mappings/tests accordingly.

## What to Change

### 1. Add canonical denial cause

Introduce `sequenceContextMismatch` in free-operation denial contracts and emit it when context keys fail to match.

### 2. Update legality and choice-reason mappings

Thread new cause through legality policy mapping and the canonical free-operation choice-reason taxonomy.

### 3. Enforce parity across surfaces

Ensure apply, legalChoices, move-decision-sequence, and parity tests all agree on the new cause semantics.

## Files to Touch

- `packages/engine/src/kernel/free-operation-denial-contract.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-legality-policy.ts` (modify)
- `packages/engine/src/kernel/legality-reasons.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (verify; modify only if typing requires)
- `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)

## Out of Scope

- Changing zone-filter evaluation behavior.
- Mandatory/outcome grant contracts.

## Acceptance Criteria

### Tests That Must Pass

1. Context mismatch emits `sequenceContextMismatch` (not `zoneFilterMismatch`) in free-operation denial context.
2. Zone-filter predicate failures continue to emit `zoneFilterMismatch`.
3. `legalChoices` returns `freeOperationSequenceContextMismatch` for sequence-context denial paths and keeps `freeOperationZoneFilterMismatch` for actual zone-filter failures.
4. Move-decision-sequence and apply-move surfaces preserve the same distinction.

### Invariants

1. Denial taxonomy remains one-to-one with contract failures.
2. All legality surfaces preserve deterministic parity for the new cause.
3. Existing `sequenceContextMismatchGrantIds` remains diagnostic metadata only; it must not be the primary discriminator.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` — add mapping coverage for new cause.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add parity checks for `sequenceContextMismatch`.
3. `packages/engine/test/unit/kernel/legal-choices.test.ts` — split sequence-context denial expectations from zone-filter denial expectations.
4. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — assert decision-sequence illegal reason uses the dedicated choice reason.
5. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — assert new cause in sequence-context denial path while preserving the existing zone-filter denial assertion.
6. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — update sequence-context denial expectation in a real FITL flow.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-legality-policy.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
6. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
7. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
8. `pnpm -F @ludoforge/engine lint`
9. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-03-09
- What changed: introduced canonical `sequenceContextMismatch` free-operation denial cause; added `freeOperationSequenceContextMismatch` legality reason; updated discovery/apply/legalChoices parity to use the dedicated cause; updated FITL and kernel tests to separate sequence-context mismatch from true zone-filter mismatch.
- Deviations from original plan: no `runtime-error.ts` change was required; additional contract/test surfaces were updated beyond the original ticket scope, including `legality-reasons.ts`, `legal-choices.test.ts`, `move-decision-sequence.test.ts`, and `fitl-events-ia-drang.test.ts`.
- Verification results: `pnpm -F @ludoforge/engine build`; targeted `node --test` runs for `free-operation-legality-policy`, `legal-choices`, `move-decision-sequence`, `legality-surface-parity`, `fitl-event-free-operation-grants`, and `fitl-events-ia-drang`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine test`.
