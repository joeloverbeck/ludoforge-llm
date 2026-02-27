# ENGINEARCH-106: Free-Operation Denial Cause Mapping Exhaustiveness

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — legality projection contract mapping in kernel
**Deps**: None

## Problem

`legalChoicesDiscover` currently maps free-operation denial causes with inline conditional logic. The mapping is not compile-time exhaustive and can silently misclassify newly introduced denial causes.

## Assumption Reassessment (2026-02-27)

1. `FreeOperationBlockCause` is the canonical denial-cause union defined in `packages/engine/src/kernel/free-operation-denial-contract.ts` and consumed by turn-flow eligibility.
2. `legalChoicesDiscover` projects denial causes into `ChoiceIllegalReason` values for simulator-facing discovery semantics.
3. Verified mismatch: mapping is currently inline/non-exhaustive in `packages/engine/src/kernel/legal-choices.ts` and falls back to `freeOperationZoneFilterMismatch`; corrected scope is to enforce exhaustive compile-time mapping and fail fast on denial-cause drift.
4. Final behavior: `legalChoicesDiscover` now evaluates free-operation zone filters in denial analysis and can emit `zoneFilterMismatch` when a move falls outside grant scope.
5. Final test scope includes explicit coverage for `noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, and `zoneFilterMismatch`.

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

Add unit tests that assert each discovery-time denial cause (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`) maps to the expected choice illegal reason.

Add a compile-time exhaustiveness guard in source (via `never` in the mapper `switch`) so unsupported causes are unreachable by construction.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify for cross-surface parity matrix completion)

## Out of Scope

- Free-operation grant semantics changes.
- Turn-flow data model changes.
- Compiler-layer changes.

## Acceptance Criteria

### Tests That Must Pass

1. Denial-cause projection in `legalChoicesDiscover` uses one canonical helper.
2. Mapping remains exact for all discovery-time denial causes (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`).
3. Unit/parity coverage explicitly includes all discovery-time denial causes; no cause depends on a default/fallback branch.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Adding a new `FreeOperationBlockCause` that participates in discovery-time denial projection requires explicit mapping update (compile-time enforced).
2. Runtime/kernel remains game-agnostic; no GameSpecDoc or visual-config coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — denial-cause-to-choice-reason mapping assertions for all discovery-time denial causes.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — parity assertions between `legalChoicesDiscover` reason and `applyMove` denial cause for all discovery-time denial causes.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Replaced inline free-operation denial projection logic in `legalChoicesDiscover` with a canonical exhaustive mapper in `packages/engine/src/kernel/legal-choices.ts`.
  - Unified denial policy so `legalChoicesDiscover` evaluates zone filters during free-operation denial checks, with discovery-safe deferral for unresolved `$zone` bindings in template probes.
  - Added/expanded tests to cover discovery-time denial mapping and parity scenarios:
    - `noActiveSeatGrant`
    - `sequenceLocked`
    - `actionClassMismatch`
    - `actionIdMismatch`
    - `zoneFilterMismatch`
  - Reassessed and corrected ticket assumptions/scope to reflect the final unified discovery/apply denial behavior.
- **Deviations From Original Plan**:
  - The final implementation goes beyond initial reassessment by enabling zone-filter denial projection in discovery-time checks, while preserving template-move probing via explicit unresolved `$zone` deferral.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`312`/`312`).
  - `pnpm turbo lint` passed.
