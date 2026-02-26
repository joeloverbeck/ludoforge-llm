# FITLINTEG-012: Assert Free-Op Grant Seat vs Execution Seat Runtime Invariants

**Status**: ✅ COMPLETED
**Completion Date**: 2026-02-26
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — integration test coverage
**Deps**: FITLGOLT4-004

## Problem

Gulf of Tonkin data encodes grant consumption seat (`seat`) separately from execution seat (`executeAsSeat`). We need production-data runtime assertions for this specific card path without duplicating existing generic free-op grant coverage.

## Assumption Reassessment (2026-02-26)

1. `data/games/fire-in-the-lake/41-content-event-decks.md` sets Gulf of Tonkin unshaded grant to `seat: "2"` and `executeAsSeat: "0"`.
2. FITL seat mapping is declared in `data/games/fire-in-the-lake/30-rules-actions.md` as `US: "0"`, `ARVN: "1"`, `NVA: "2"`, `VC: "3"`; therefore Gulf of Tonkin currently grants to seat `"2"` (NVA) and executes as seat `"0"` (US profile).
3. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` currently verifies compile output shape for this grant but does not assert runtime grant-consumption/execution behavior.
4. Runtime semantics for seat/execution split already exist in generic integration coverage: `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (`createExecuteAsSeatDef` path), and Turn 4 e2e flow also exercises the production Gulf-of-Tonkin path.
5. Remaining gap is production-card-specific runtime guardrails (not generic engine capability).

## Architecture Check

1. The clean architecture move is to add one focused production integration test for Gulf of Tonkin runtime invariants while keeping generic semantics tests centralized in `fitl-event-free-operation-grants.test.ts`.
2. This avoids duplicate fixtures and preserves DRY test architecture.
3. No backward-compatibility aliases/shims are introduced.

## What to Change

### 1. Add production runtime invariant test for Gulf of Tonkin

In the Gulf of Tonkin integration suite, add a test that:
1. Plays unshaded card-1 and asserts pending grant enqueue.
2. Asserts grant availability on the seat-`"2"` consumption path (active player transition) and free `airStrike` move discoverability.
3. Applies the free `airStrike` and asserts grant consumption/clearance plus resulting state mutation.

### 2. Assert negative guardrail

In the same test, assert a rejected free operation (`FREE_OPERATION_NOT_GRANTED`) when no matching grant path applies.

## Files to Touch

- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify)

## Out of Scope

- Any event data changes
- Kernel/runtime refactors
- Playbook golden test expansion
- Duplicating generic `executeAsSeat` contract tests already covered elsewhere

## Acceptance Criteria

### Tests That Must Pass

1. Gulf-of-Tonkin integration test validates seat-`"2"` grant consumption path and free-op gating.
2. Gulf-of-Tonkin integration test validates delegated execution behavior for the granted `airStrike`.
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Free-op grant contract remains generic and data-driven.
2. No game-specific logic is introduced into `GameDef`/simulation/kernel.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — add runtime invariant assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test:integration`

## Outcome

### What Changed vs Original Plan

1. Corrected ticket assumptions and scope:
   - Clarified authoritative FITL seat mapping (`US=0`, `ARVN=1`, `NVA=2`, `VC=3`).
   - Documented that generic runtime `seat`/`executeAsSeat` behavior was already covered in `fitl-event-free-operation-grants.test.ts`.
   - Narrowed this ticket to the remaining production-data-specific Gulf-of-Tonkin runtime invariant.
2. Implemented one focused test in `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`:
   - Asserts pending grant payload (`seat: "2"`, `executeAsSeat: "0"`).
   - Asserts free `airStrike` discoverability/consumption on a seat-2 eligibility path.
   - Asserts post-consumption negative guardrail (`FREE_OPERATION_NOT_GRANTED`).
3. No kernel/runtime/data-asset architecture changes were made.

### Verification Results

1. `pnpm -F @ludoforge/engine build` passed.
2. `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js` passed.
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
4. `pnpm -F @ludoforge/engine test:integration` passed (`121/121`).
5. `pnpm -F @ludoforge/engine lint` passed.
