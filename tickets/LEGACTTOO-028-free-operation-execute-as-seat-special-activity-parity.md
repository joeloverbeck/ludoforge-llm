# LEGACTTOO-028: Free-Operation executeAsSeat Special-Activity Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn-flow free-operation discovery/applicability parity for executeAsSeat grants
**Deps**: tickets/README.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/test/unit/kernel/legal-choices.test.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts

## Problem

`executeAsSeat` currently works for some free-operation discovery paths but fails in a real FITL card flow when a non-US/ARVN executing faction is granted `airStrike` with `executeAsSeat: "us"|"arvn"`.

Observed impact: grant metadata is queued, but no free `airStrike` legal move is emitted for the executing faction when it relies on execute-as profile semantics. This blocks clean GameSpecDoc modeling for cards that grant "as-if" free operations/special activities to the executing faction.

## Assumption Reassessment (2026-03-07)

1. Engine already has execute-as grant plumbing (`pendingFreeOperationGrants.executeAsSeat`, resolution helpers, and discovery analysis). **Confirmed** in `turn-flow-eligibility.ts` and related tests.
2. Unit coverage proves execute-as preflight applicability in synthetic scenarios. **Confirmed** in `packages/engine/test/unit/kernel/legal-choices.test.ts` (`applies free-operation executeAsSeat to discovery preflight pipeline applicability`).
3. FITL production flow still fails for execute-as free `airStrike` when granted to non-US/ARVN active seat, despite grant creation. **Confirmed** by reproduction during card-30 implementation (grant exists, legal move absent).

## Architecture Check

1. Fixing execute-as parity in kernel turn-flow is cleaner than card-specific workarounds because grant semantics stay single-source and reusable for future cards/specs.
2. This keeps game-specific behavior in GameSpecDoc and preserves engine agnosticism: kernel only enforces generic grant semantics.
3. No backwards-compatibility shims: remove ambiguity by making execute-as behavior consistently authoritative everywhere free-operation variants are synthesized/evaluated.

## What to Change

### 1. Align free-operation variant synthesis with execute-as semantics

- Audit `applyPendingFreeOperationVariants` and all downstream filters to ensure generated free variants use the same effective execution seat/profile context as grant applicability checks.
- Ensure candidate generation is not dropped when the active seat itself cannot normally run the action but `executeAsSeat` can.

### 2. Enforce parity across discovery, legal-move emission, and grant consumption

- Guarantee consistent behavior among:
  - `resolveMoveDecisionSequence` preflight
  - free-operation applicability/granted checks
  - window/monsoon/option-matrix gating
  - final `applyMove` grant validation and consumption
- Add explicit typed denial diagnostics only when a true mismatch exists (not because execute-as context was ignored).

### 3. Add focused regression coverage for special-activity execute-as grants

- Add kernel/unit tests that reproduce non-owner-seat grant + execute-as + special-activity action profile applicability.
- Add FITL integration regression reproducing the previously failing grant pattern with `airStrike`.

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify, if needed for seat-context plumbing)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-uss-new-jersey.test.ts` (modify/add targeted execute-as grant assertion fixture)

## Out of Scope

- Any game-specific card implementation changes beyond tests needed to prove kernel behavior.
- Rewriting Air Strike rules content.
- UI/runner changes.

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant with `seat: self` and `executeAsSeat` emits legal moves whenever the execute-as profile is applicable, even if the active seat normally cannot perform that action.
2. Special-activity actionIds (for example `airStrike`) behave with the same execute-as parity as operation actionIds.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit` and `pnpm -F @ludoforge/engine test:integration`.

### Invariants

1. Free-operation eligibility/discovery/applicability uses one coherent execute-as seat resolution model.
2. Kernel logic remains game-agnostic and does not contain FITL-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add execute-as parity coverage for free-operation variant generation and satisfiability.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add real card-driven execute-as special-activity regression.
3. `packages/engine/test/integration/fitl-events-uss-new-jersey.test.ts` — assert grant-driven unshaded path is legal once parity is fixed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-uss-new-jersey.test.js`
5. `pnpm -F @ludoforge/engine test:integration`
6. `pnpm -F @ludoforge/engine test:unit`
