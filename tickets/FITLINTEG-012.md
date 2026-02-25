# FITLINTEG-012: Assert Free-Op Grant Seat vs Execution Seat Runtime Invariants

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — integration test coverage
**Deps**: FITLGOLT4-004

## Problem

Gulf of Tonkin data now encodes grant consumption seat (`seat`) separately from execution seat (`executeAsSeat`). Current tests assert compiled shape but do not directly assert runtime invariant behavior for this split.

## Assumption Reassessment (2026-02-25)

1. `data/games/fire-in-the-lake/41-content-event-decks.md` sets Gulf of Tonkin unshaded grant to `seat: "2"` and `executeAsSeat: "0"`.
2. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` currently verifies compile output shape.
3. Runtime flow already supports grant consumption and execution actor delegation for free operations.

## Architecture Check

1. Adding runtime invariant tests increases confidence in generic turn-flow semantics without introducing new engine logic.
2. The test asserts generic contract behavior (`seat` grants vs `executeAsSeat` execution), not FITL-only implementation branches in kernel code.
3. No backward-compatibility aliases/shims are introduced.

## What to Change

### 1. Add runtime integration test for seat/execution split

In the Gulf of Tonkin integration suite, add a test that:
1. Plays the event to enqueue grant.
2. Confirms grant is consumable by the designated grant seat path.
3. Confirms resulting free operation executes as delegated seat (`executeAsSeat`) and mutates state accordingly.

### 2. Assert negative guardrail

Add a negative assertion that the same free operation is rejected without matching grant eligibility path.

## Files to Touch

- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify, if better host for invariant test)

## Out of Scope

- Any event data changes
- Kernel/runtime refactors
- Playbook golden test expansion

## Acceptance Criteria

### Tests That Must Pass

1. Integration test explicitly validates grant `seat` consumption semantics independent from execution seat.
2. Integration test explicitly validates `executeAsSeat` runtime effect semantics.
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Free-op grant contract remains generic and data-driven.
2. No game-specific logic is introduced into `GameDef`/simulation/kernel.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — add runtime invariant assertions.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — extend shared grant-contract checks (if needed).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
