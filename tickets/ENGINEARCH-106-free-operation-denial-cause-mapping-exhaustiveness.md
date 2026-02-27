# ENGINEARCH-106: Free-Operation Denial Cause Mapping Exhaustiveness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — legality projection contract mapping in kernel
**Deps**: None

## Problem

`legalChoicesDiscover` currently maps free-operation denial causes with inline conditional logic. The mapping is not compile-time exhaustive and can silently misclassify newly introduced denial causes.

## Assumption Reassessment (2026-02-27)

1. `FreeOperationBlockCause` is the canonical denial-cause union defined in turn-flow eligibility.
2. `legalChoicesDiscover` projects denial causes into `ChoiceIllegalReason` values for simulator-facing discovery semantics.
3. Mismatch: mapping is currently inline/non-exhaustive and defaults to `freeOperationZoneFilterMismatch`; corrected scope is to enforce exhaustive compile-time mapping and fail fast on drift.

## Architecture Check

1. A centralized, exhaustive mapper is cleaner and safer than scattered inline ternaries.
2. This is kernel-internal contract hardening and does not introduce game-specific branching into agnostic runtime surfaces.
3. No backwards-compatibility aliases; one canonical mapping path from denial cause to choice illegal reason.

## What to Change

### 1. Introduce a canonical denial-cause projection helper

Add a helper (or module-local function) that maps `FreeOperationBlockCause` to `ChoiceIllegalReason` using an exhaustive `switch` with `never` checking.

### 2. Replace inline mapping call sites

Refactor `legalChoicesDiscover` free-operation denial handling to call the helper instead of embedding conditional mapping logic.

### 3. Add mapping contract tests

Add unit tests that assert each supported denial cause maps to the expected choice illegal reason and that unsupported causes are compile-time unreachable.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/legality-reasons.ts` (modify if shared helper typing needs tightening)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)

## Out of Scope

- Free-operation grant semantics changes.
- Turn-flow data model changes.
- Compiler-layer changes.

## Acceptance Criteria

### Tests That Must Pass

1. Denial-cause projection in `legalChoicesDiscover` uses one canonical helper.
2. Mapping remains exact for all supported causes (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Adding a new `FreeOperationBlockCause` requires explicit mapping update (compile-time enforced).
2. Runtime/kernel remains game-agnostic; no GameSpecDoc or visual-config coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — denial-cause-to-choice-reason mapping assertions per cause.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — spot-check projected reason consistency against apply-time cause for mapped scenarios.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
