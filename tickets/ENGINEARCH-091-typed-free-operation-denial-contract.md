# ENGINEARCH-091: Typed Free-Operation Denial Contract in Kernel Errors

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime error contracts, free-operation denial typing, schema validation surface
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

`FREE_OPERATION_NOT_GRANTED` currently carries denial details in untyped `metadata` records. This is brittle for simulator consumers, encourages stringly-typed parsing, and allows silent contract drift.

## Assumption Reassessment (2026-02-27)

1. Current code emits useful denial metadata (`block.cause`, grant ids), but the payload is not type-enforced in `IllegalMoveError` context.
2. Existing tests assert selected causes but do not enforce an explicit typed contract for denial metadata shape.
3. Mismatch: runtime observability exists, but contractual robustness is incomplete; corrected scope is to promote denial metadata to a typed reason-specific contract.

## Architecture Check

1. Typed reason-specific error payloads are cleaner and safer than generic `Record<string, unknown>` metadata.
2. This keeps game-specific behavior in GameSpecDoc while preserving kernel/simulator agnostic error semantics.
3. No backwards-compatibility shims or alias paths; move directly to the typed contract.

## What to Change

### 1. Type the illegal-move denial payload

Introduce a typed `FreeOperationDenial` contract (cause enum + structured fields) and wire it through runtime error context for `FREE_OPERATION_NOT_GRANTED`.

### 2. Normalize kernel error surface

Make `illegalMoveError` for free-operation denial emit strongly typed context fields instead of opaque metadata blobs.

### 3. Validate and test the contract

Add unit tests for each denial cause and contract shape stability.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` (modify if message/context mapping requires)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if runtime error schemas surface this payload)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify/add)

## Out of Scope

- Changing free-operation legality semantics.
- Introducing game-specific denial causes.

## Acceptance Criteria

### Tests That Must Pass

1. `FREE_OPERATION_NOT_GRANTED` errors expose typed denial payloads (not generic metadata) for all denial causes.
2. Integration free-operation failure paths assert typed denial payload shape and cause values.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel error contracts remain game-agnostic and reason-centric.
2. Denial payload fields are deterministic and stable across simulator/runtime entry points.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — assert typed denial payload for actionClass/sequence/zone mismatch.
2. `packages/engine/test/unit/kernel/runtime-reasons.test.ts` — assert denial cause enum + payload contract stability.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
