# ENG-224: Strengthen Required Outcome Enforcement for Overlapping Grants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — required outcome-policy enforcement and grant-selection semantics for overlapping free-operation authorizations
**Deps**: archive/tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts

## Problem

ENG-203 added `outcomePolicy: mustChangeGameplayState`, but the current implementation only inspects the first matching pending grant for a free operation. When multiple pending grants authorize the same move, a weaker grant can be consumed first and allow a no-op move to bypass a stricter required-outcome grant that should have rejected it.

## Assumption Reassessment (2026-03-09)

1. Current outcome-policy validation looks up one authorized pending grant before consumption and uses that single grant as the policy source.
2. Current grant consumption also consumes the first matching pending grant for the active seat.
3. Mismatch: ENG-203 acceptance semantics are obligation-based, not first-match-array-order based. If any overlapping required grant for the submitted move requires a non-no-op outcome, the move must satisfy that requirement before any matching grant is consumed. Correction: evaluate and consume overlapping grants with deterministic policy-aware semantics.

## Architecture Check

1. The fix should stay on the shared grant-authorization/runtime path so event-side grants and effect-issued grants keep identical semantics.
2. Deterministic overlapping-grant resolution is cleaner than adding card-specific ordering exceptions or data-level workarounds.
3. No backwards-compatibility aliases should be introduced; the runtime should make one canonical decision about which matching grants constrain and/or consume a free operation.

## What to Change

### 1. Evaluate all matching grants for outcome requirements

Replace first-match outcome validation with deterministic handling over the full set of matching authorized grants for the active seat. If any matching required grant imposes `mustChangeGameplayState`, reject a no-op result before consumption.

### 2. Define deterministic overlapping-grant consumption

Clarify and implement how overlapping grants are consumed once a move succeeds. Consumption should not silently prioritize weaker grants in a way that undermines stricter completion/outcome semantics.

### 3. Expand regression coverage for overlapping grants

Add tests where two or more pending grants authorize the same move, including mixed-strength policies, to prove outcome enforcement is independent of incidental pending-array order.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify if shared consumption helper changes)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Broader redefinition of `mustChangeGameplayState` beyond ENG-203’s canonical contract.
- New declarative metrics DSL or per-game outcome hooks.

## Acceptance Criteria

### Tests That Must Pass

1. A free operation that matches any pending required-outcome grant is rejected when it resolves as an action-level no-op, even if another overlapping grant would otherwise authorize the move.
2. Successful overlapping-grant resolution uses deterministic policy-aware consumption semantics that do not depend on incidental grant array order.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Required outcome semantics are enforced consistently across all matching shared grant contracts, regardless of whether the grant came from an event or runtime effect.
2. Overlapping authorization resolution is deterministic across seeds and independent of pending-grant insertion order unless that order is itself part of the declared contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify mixed-strength overlapping grants reject no-op free operations and consume grants deterministically on success.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify end-to-end overlapping grant semantics from declarative fixtures, including reordered pending grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
