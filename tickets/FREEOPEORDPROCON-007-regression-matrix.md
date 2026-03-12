# FREEOPEORDPROCON-007: Regression Matrix — Cross-Cutting Progression Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No — test-only
**Deps**: FREEOPEORDPROCON-004 (readiness engine), FREEOPEORDPROCON-005 (emission logic), FREEOPEORDPROCON-006 (MACV rework)

## Problem

The spec requires 8 explicit regression cases that span multiple subsystems (emission, readiness, discovery, apply-time, diagnostics). Individual tickets cover their focused unit tests, but the cross-cutting regression matrix ensures end-to-end correctness and discovery/apply parity. This ticket covers the integration-level regression suite.

## Assumption Reassessment (2026-03-12)

1. Existing integration test `fitl-event-free-operation-grants.test.ts` covers event-issued grant sequences with `strictInOrder` behavior.
2. Existing MACV test `fitl-events-macv.test.ts` covers card 69 branch execution.
3. No integration tests exist yet for generic `implementWhatCanInOrder` fixtures (non-FITL).
4. Discovery/apply parity is not explicitly tested today — it is an implicit consequence of using the same readiness function, but the spec requires explicit verification.

## Architecture Check

1. These are pure test additions — no production code changes.
2. Generic (non-FITL) fixtures ensure the progression model is game-agnostic.
3. FITL-specific regression is covered in FREEOPEORDPROCON-006; this ticket covers the generic regression cases and discovery/apply parity.

## What to Change

### 1. Generic progression fixtures

Create minimal GameDef-level fixtures (inline in tests or in `test/fixtures/`) that exercise ordered sequences with both policies. These fixtures should not reference FITL concepts.

### 2. Integration test file

Create `packages/engine/test/integration/free-operation-progression-contract.test.ts` (or similar) with the following regression cases from the spec:

#### Required Regression Cases (from Spec 60)

1. **Earlier step implementable, later step blocked until consumption** — `strictInOrder` batch: step 0 emitted, step 1 blocked. Step 0 consumed → step 1 becomes ready.
2. **Earlier step unimplementable, later step proceeds** — `implementWhatCanInOrder` batch: step 0 unusable → skipped, step 1 becomes ready immediately.
3. **Earlier step unimplementable, later step blocked under strictInOrder** — `strictInOrder` batch: step 0 unusable → not emitted, step 1 never becomes ready.
4. **Skipped step does not capture sequence context** — `implementWhatCanInOrder` batch: step 0 skipped, batch context has no `capturedMoveZonesByKey` from step 0.
5. **Required context from skipped step is rejected at validation** — validated by FREEOPEORDPROCON-003, but integration test confirms the diagnostic fires for a complete GameDef.
6. **Event-issued and effect-issued contracts behave identically** — same batch declared via event `freeOperationGrants` and via effect `grantFreeOperation` → identical runtime behavior.
7. **Discovery/apply parity holds** — for a given state, `legalMoves` surfaces a free-operation move if and only if `applyMove` accepts it. Test by computing legal moves, applying each, and verifying no rejection.
8. **MACV uses generic contract without kernel hacks** — covered by FREEOPEORDPROCON-006, cross-referenced here for completeness.

### 3. Existing ordered-sequence regression

Verify that all existing ordered-sequence cards (other than MACV) still work with `strictInOrder` default. A single test that compiles the full FITL spec and runs a few turns with ordered sequences suffices.

## Files to Touch

- `packages/engine/test/integration/free-operation-progression-contract.test.ts` (new) — generic regression matrix
- `packages/engine/test/fixtures/` (possibly new fixtures) — minimal GameDef fixtures for progression testing

## Out of Scope

- Production code changes of any kind.
- MACV-specific tests — those are in FREEOPEORDPROCON-006.
- Unit tests for individual functions — those are in tickets 001-005.
- Validation rule tests — those are in FREEOPEORDPROCON-003.

## Acceptance Criteria

### Tests That Must Pass

1. Regression case 1: `strictInOrder` — earlier implementable blocks later until consumed.
2. Regression case 2: `implementWhatCanInOrder` — earlier unimplementable allows later to proceed.
3. Regression case 3: `strictInOrder` — earlier unimplementable blocks later entirely.
4. Regression case 4: skipped step produces no captured context.
5. Regression case 5: cross-step context from skipped step rejected at validation.
6. Regression case 6: event-issued and effect-issued parity.
7. Regression case 7: discovery/apply parity for `implementWhatCanInOrder` batches.
8. Non-MACV ordered-sequence cards: no regression.
9. Existing suite: `pnpm turbo test` — all green.

### Invariants

1. All regression tests use generic (non-FITL) fixtures except for the existing-card regression check.
2. No production code is modified.
3. Discovery/apply parity is verified programmatically (enumerate legal moves, apply each, assert no rejection).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/free-operation-progression-contract.test.ts` (new) — all 7 generic regression cases
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (possibly modify) — add existing-ordered-card no-regression check if not already covered

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
