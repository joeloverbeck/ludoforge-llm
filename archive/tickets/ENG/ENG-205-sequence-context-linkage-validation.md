# ENG-205: Sequence-Context Linkage Validation for Free-Operation Grants

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation grant contract validation (event/effect paths)
**Deps**: archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts

## Problem

`sequenceContext.requireMoveZoneCandidatesFrom` currently fails only at runtime when the required key was never captured (for example typo or wrong chain/step). This allows invalid contracts to compile and turns authoring mistakes into opaque runtime denial behavior.

## Assumption Reassessment (2026-03-09)

1. Current runtime enforces required captured-key lookup and denies unmatched grants as runtime mismatch (`FREE_OPERATION_NOT_GRANTED` path), so missing linkage is discovered late.
2. Current static checks are split:
   - `schemas-extensions.ts` / `schemas-ast.ts` enforce `sequenceContext` shape (non-empty capture/require fields).
   - `validate-gamedef-behavior.ts` enforces effect-side grant shape constraints (`sequence.step`, `sequenceContext requires sequence`, etc.).
3. Missing today: cross-step semantic linkage validation that guarantees `requireMoveZoneCandidatesFrom` is backed by an earlier capture in the same sequence chain.
4. Correction: add one generic static linkage validator pass over both event-card grants and effect-issued grants.

## Architecture Check

1. Static linkage validation is cleaner than relying on runtime denials to discover bad grant wiring.
2. Validation remains generic and game-agnostic while allowing game-specific keys in `GameSpecDoc` only.
3. No compatibility aliases/shims: invalid contracts fail fast with canonical diagnostics.

## What to Change

### 1. Add chain-level capture/require linkage validation

Validate free-operation grant sequences so each `requireMoveZoneCandidatesFrom` key is captured by an earlier grant in the same `sequence.chain`.

### 2. Apply parity across event-side grants and effect-issued grants

Enforce the same linkage contract for:
- `eventDecks[].cards[].*.freeOperationGrants`
- `grantFreeOperation` in all effect arrays (including nested control-flow effects)

### 3. Emit explicit diagnostics

Add dedicated diagnostics for:
- missing required capture key
- require key captured only at same/later step

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Changing runtime matching semantics for valid contracts.
- Ia Drang card data migration (covered elsewhere).

## Acceptance Criteria

### Tests That Must Pass

1. Grant definitions with `requireMoveZoneCandidatesFrom` and no earlier matching capture fail validation with typed diagnostics.
2. Valid same-chain capture-before-require definitions pass validation.
3. Parity holds for event-side grants and nested effect-issued grants.
4. Existing suites:
   - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
   - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Semantically impossible sequence-context contracts are rejected before runtime.
2. Validation rules are generic and do not encode FITL/card-specific identifiers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add sequence-context linkage diagnostics coverage.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — guard that invalid linkage cannot be issued from effects.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine test`

## Outcome

Implemented:
1. Added generic static sequence-context linkage diagnostics for both event-card grants and effect-issued grants (including nested effects).
2. Added dedicated error diagnostics for missing required capture and non-earlier capture order.
3. Added/updated unit + integration coverage to assert fail-fast validation and valid capture-before-require behavior.

Adjusted vs original plan:
1. No `types-turn-flow.ts` changes were required.
2. Duplicate-capture policy checks were not introduced because there is no strict duplicate-capture contract in current runtime behavior.
