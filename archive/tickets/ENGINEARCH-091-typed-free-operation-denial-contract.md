# ENGINEARCH-091: Typed Free-Operation Denial Contract in Kernel Errors

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime error contracts, free-operation denial typing, schema validation surface
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

`FREE_OPERATION_NOT_GRANTED` currently carries denial details in untyped `metadata` records. This is brittle for simulator consumers, encourages stringly-typed parsing, and allows silent contract drift.

## Assumption Reassessment (2026-02-27)

1. Current code already defines a typed free-operation denial structure in kernel logic (`FreeOperationBlockExplanation` in `turn-flow-eligibility.ts`).
2. Gap is at the runtime error boundary: `IllegalMoveError` and `KernelRuntimeErrorContextByCode['ILLEGAL_MOVE']` still expose generic `metadata?: Record<string, unknown>`.
3. Existing integration tests validate selected denial causes (`actionClassMismatch`, `sequenceLocked`, `zoneFilterMismatch`) but rely on loose casts and do not enforce a typed, reason-aware `ILLEGAL_MOVE` contract.
4. Corrected scope: preserve existing free-operation matching semantics and promote the already-typed denial explanation into a typed runtime error contract for `FREE_OPERATION_NOT_GRANTED`.

## Architecture Check

1. Typed reason-specific error payloads are cleaner and safer than generic `Record<string, unknown>` metadata.
2. This keeps game-specific behavior in GameSpecDoc while preserving kernel/simulator agnostic error semantics.
3. No backwards-compatibility shims or alias paths; move directly to the typed contract.

## What to Change

### 1. Type illegal-move context by reason

Refactor `ILLEGAL_MOVE` context typing from a single generic metadata bag into a reason-aware union/map so reason-specific payloads are statically typed.

For `FREE_OPERATION_NOT_GRANTED`, context must carry:
- `actionId`
- `params`
- `reason`
- typed denial payload (`block: FreeOperationBlockExplanation`)

Keep non-free-operation reasons supported without introducing compatibility aliases.

### 2. Normalize kernel error surface

Update `illegalMoveError`/`IllegalMoveError` so `FREE_OPERATION_NOT_GRANTED` callers pass typed context fields directly (no opaque metadata parsing path for this reason).

### 3. Validate and test the contract

Add tests that enforce typed shape stability and extend denial-cause coverage to currently missing paths (`actionIdMismatch`, `noActiveSeatGrant`).

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` (modify if message/context mapping requires)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if runtime error schemas surface this payload)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify only if reason taxonomy changes)

## Out of Scope

- Changing free-operation legality semantics.
- Introducing game-specific denial causes.

## Acceptance Criteria

### Tests That Must Pass

1. `FREE_OPERATION_NOT_GRANTED` errors expose typed denial payloads (not generic metadata) for all denial causes.
2. Integration free-operation failure paths assert typed denial payload shape and cause values, including `actionIdMismatch` and `noActiveSeatGrant`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel error contracts remain game-agnostic and reason-centric.
2. Denial payload fields are deterministic and stable across simulator/runtime entry points.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — assert typed denial payload for actionClass/sequence/zone mismatch.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add `actionIdMismatch` and `noActiveSeatGrant` denial assertions.
3. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert `ILLEGAL_MOVE` reason-aware typed context for `FREE_OPERATION_NOT_GRANTED`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Implemented reason-specific `ILLEGAL_MOVE` context typing in `runtime-error.ts` and removed generic illegal-move `metadata` from the runtime contract surface.
  - Added typed free-operation denial context (`freeOperationDenial`) for `FREE_OPERATION_NOT_GRANTED`.
  - Updated `illegalMoveError` call sites in `apply-move.ts` to emit reason-specific context fields (including free-operation denial context and typed compound/pipeline context fields).
  - Strengthened integration coverage in `fitl-event-free-operation-grants.test.ts` and added missing denial causes:
    - `actionIdMismatch`
    - `noActiveSeatGrant`
  - Updated unit/integration assertions that previously read `error.metadata` to read typed `error.context` fields directly.
  - Added unit contract coverage in `runtime-error-contracts.test.ts` for typed `ILLEGAL_MOVE` context (including `FREE_OPERATION_NOT_GRANTED`).
- **Deviations from original plan**:
  - Scope was expanded beyond free-operation denial only: all `ILLEGAL_MOVE` contexts now follow reason-specific typed fields rather than mixed generic metadata payloads.
  - No changes were required in `turn-flow-eligibility.ts`, `runtime-reasons.ts`, or `schemas-extensions.ts`; the architecture gap remained at runtime error contracts and consumer tests.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/unit/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-option-matrix.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-us-arvn-special-activities.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-nva-vc-special-activities.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (307 passed, 0 failed).
  - `pnpm turbo lint` passed.
