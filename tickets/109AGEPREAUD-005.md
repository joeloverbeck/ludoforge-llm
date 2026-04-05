# 109AGEPREAUD-005: Integration tests — FITL event card preview differentiation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test files only
**Deps**: `tickets/109AGEPREAUD-002.md`

## Problem

After fixing event preview differentiation (ticket 002), we need end-to-end proof that the agent can now distinguish shaded vs unshaded event sides in a production game context. This ticket creates integration tests using the FITL production spec to verify the fix works in real game conditions, not just synthetic test cases.

## Assumption Reassessment (2026-04-05)

1. FITL production spec compiles and runs — confirmed (used in fitl-vc-agent-evolution campaign).
2. FITL has dual-sided event cards with materially different effects — confirmed (card-116: shaded=VC Rally+Agitate vs unshaded=VC Terror costs guerrillas; card-15: unshaded=return troop casualties vs shaded=eligibility+no airlift).
3. `PolicyAgent` with `traceLevel: 'verbose'` exposes per-candidate `scoreContributions` — confirmed.
4. `stateFeatures` now included in agent decision traces — confirmed (implemented this session).

## Architecture Check

1. Integration tests use the production FITL spec — they verify real game behavior, not synthetic edge cases (Foundation 16: Testing as Proof).
2. Tests are game-specific (FITL) but that's appropriate for integration tests — unit tests in ticket 002 cover game-agnostic behavior.
3. Tests assert preview outcomes, not specific margin values — they're resilient to game spec changes as long as shaded/unshaded effects differ.

## What to Change

### 1. FITL event preview differentiation test

Create a test that:
1. Compiles the FITL production spec
2. Advances to a game state where both shaded and unshaded event candidates are available for the active player
3. Runs `PolicyAgent.chooseMove` with `traceLevel: 'verbose'`
4. Finds the event candidates in the trace
5. Asserts: shaded and unshaded candidates have DIFFERENT `preferProjectedSelfMargin` contributions

### 2. Capability card preview test

Find a FITL capability card (tag: `capability`) and verify:
1. Both shaded and unshaded preview complete (not `unknown`)
2. The preview returns a valid projected state

### 3. Multi-branch event preview test

Find a FITL event card with multiple branches on one side and verify:
1. Each branch is a separate candidate
2. Each branch gets its own preview evaluation

### 4. Regression test: non-event preview unchanged

Run a PolicyAgent evaluation on a state with Rally/Terror/Attack candidates and verify:
1. Preview produces different margins for different action types (existing behavior)
2. No performance regression compared to baseline

## Files to Touch

- `packages/engine/test/integration/event-preview-differentiation.test.ts` (new) — FITL event preview tests
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — add regression assertion if appropriate

## Out of Scope

- Fixing preview (ticket 002) — this ticket only tests
- Synthetic unit tests (ticket 002's test plan)
- Non-FITL game tests

## Acceptance Criteria

### Tests That Must Pass

1. Shaded and unshaded event candidates produce different `preferProjectedSelfMargin` contributions for cards with materially different effects
2. Capability card preview completes (not `unknown`)
3. Multi-branch event candidates are previewed independently
4. Non-event preview is unchanged (regression check)
5. Existing suite: `pnpm turbo test`

### Invariants

1. Tests use the production FITL spec — no synthetic game specs
2. Tests assert structural properties (different margins) not specific values (margin=X)
3. Tests are deterministic (fixed seed)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-preview-differentiation.test.ts` (new) — comprehensive event preview integration tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
