# ENG-206: Dedicated Sequence-Context Denial Cause and Legality Parity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — free-operation denial contracts, legality mapping, diagnostics surfaces
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/free-operation-legality-policy.ts

## Problem

Sequence-context mismatch is currently reported as `zoneFilterMismatch`, conflating two independent contract failures. This weakens diagnostics, policy clarity, and test-level intent.

## Assumption Reassessment (2026-03-09)

1. Current discovery analysis uses `zoneFilterMismatch` for both zone-filter predicate failures and sequence-context key mismatches.
2. `sequenceContextMismatchGrantIds` is threaded in context, but the top-level cause still aliases to zone-filter mismatch.
3. Mismatch: denial taxonomy is not orthogonal to contracts. Correction: introduce a canonical `sequenceContextMismatch` cause.

## Architecture Check

1. Separate denial causes make contract boundaries explicit and easier to reason about.
2. This is engine-agnostic contract layering: no game-specific behavior is introduced.
3. No backwards-compatibility aliasing/shims: use one canonical cause and update all mappings/tests accordingly.

## What to Change

### 1. Add canonical denial cause

Introduce `sequenceContextMismatch` in free-operation denial contracts and emit it when context keys fail to match.

### 2. Update legality and choice-reason mappings

Thread new cause through legality policy mapping and any user-visible/internal reason enums.

### 3. Enforce parity across surfaces

Ensure apply/legality/discovery/parity tests all agree on the new cause semantics.

## Files to Touch

- `packages/engine/src/kernel/free-operation-denial-contract.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-legality-policy.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify if contract typing requires)
- `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Changing zone-filter evaluation behavior.
- Mandatory/outcome grant contracts.

## Acceptance Criteria

### Tests That Must Pass

1. Context mismatch emits `sequenceContextMismatch` (not `zoneFilterMismatch`) in free-operation denial context.
2. Zone-filter predicate failures continue to emit `zoneFilterMismatch`.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`

### Invariants

1. Denial taxonomy remains one-to-one with contract failures.
2. All legality surfaces preserve deterministic parity for the new cause.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-legality-policy.test.ts` — add mapping coverage for new cause.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — add parity checks for `sequenceContextMismatch`.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — assert new cause in sequence-context denial path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-legality-policy.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`
