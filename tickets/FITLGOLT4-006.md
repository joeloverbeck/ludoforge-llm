# FITLGOLT4-006: Extend Turn 4 Golden Coverage Beyond Deferred Release

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — e2e golden coverage
**Deps**: FITLGOLT4-004

## Problem

Turn 4 golden coverage currently validates the architecture-critical deferred event release path, but it does not continue through follow-on move choreography. This leaves a regression gap for later-turn eligibility/resource/control transitions after deferred effects resolve.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently includes Turn 4 with two moves: event submission and granted Air Strike resolution.
2. Ticket `FITLGOLT4-004` intentionally scoped Turn 4 assertions to deferred-event invariants.
3. Additional playbook-consistent Turn 4 move assertions can now be layered without changing kernel behavior.

## Architecture Check

1. Expanded golden assertions improve end-to-end confidence in data-driven choreography without widening engine scope.
2. All behavior remains encoded in FITL `GameSpecDoc`; no game-specific runtime branching is added.
3. No backward-compatibility aliases/shims are introduced.

## What to Change

### 1. Add post-Air-Strike Turn 4 move coverage

Extend Turn 4 descriptor with follow-on move(s) (for example NVA operation + special activity sequence) and assert resulting state transitions.

### 2. Add comprehensive end-of-turn assertions

At Turn 4 end, assert at minimum:
1. Eligibility rotation state.
2. Key resources/tracks (including trail/victory-related values).
3. Control/opposition markers and critical token distributions in impacted spaces.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `reports/fire-in-the-lake-playbook-turn-4.md` (modify only if test expectation source needs correction)

## Out of Scope

- Engine/kernel/runtime code changes
- Turn 5+ coverage
- Non-FITL playbook additions

## Acceptance Criteria

### Tests That Must Pass

1. Turn 4 replay includes post-Air-Strike move coverage and passes deterministically.
2. End-of-turn assertions validate expected eligibility/resource/board outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. Golden suite remains deterministic for fixed seed and deck engineering.
2. Assertions are derived from canonical playbook/report expectations, not ad-hoc outcomes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — expand Turn 4 move list and expected snapshots.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js`
3. `pnpm -F @ludoforge/engine test:e2e`
