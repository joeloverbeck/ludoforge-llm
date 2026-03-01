# SEATRES-003: Seat-resolution regression guards and condition-context deduplication

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler lowering + tests (`compile-lowering.ts`, `compile-actions.test.ts`, `compile-zones.test.ts`, `compile-conditions.test.ts`)
**Deps**: archive/tickets/SEATRES-001-universal-seat-name-resolution.md, archive/tickets/SEATRES-002-canonical-seat-identity-source.md

## Problem

SEATRES-001 expanded seat-name resolution coverage, but two robustness gaps remain:

1. `lowerEndConditions` assembles equivalent condition-lowering context twice inline (`when` and `result`), despite an existing shared context builder in the same module.
2. Compile-entry regression guards remain incomplete for seat-name selectors when canonical `seatIds` are unavailable.

Without these guards, future refactors can reintroduce inconsistent behavior across lowering paths and diagnostic surfaces.

## Assumption Reassessment (2026-03-01)

1. `compile-lowering.ts` currently duplicates condition-context assembly in `lowerEndConditions` (verified at `packages/engine/src/cnl/compile-lowering.ts:895-919`).
2. There is already selector-level negative coverage for missing `seatIds` in `compile-selectors.test.ts`; the missing coverage is compile-entry behavior and stable diagnostic pathing in top-level compile surfaces.
3. Canonical `seatIds` can still be absent at compile-entry (when neither turn-flow seats nor piece-catalog seats are available), so this is still a valid failure mode to pin.
4. No active ticket duplicates this exact context-dedup + compile-entry regression-hardening scope; SEATRES-004 depends on this ticket but targets broader seat-contract unification.

## Architecture Check

1. Reusing the existing `buildConditionLoweringContext` helper is cleaner than adding another context builder path and reduces drift risk.
2. Compile-entry regression tests at action/zone/condition surfaces improve contract robustness where callers actually interact with diagnostics.
3. This keeps compiler behavior game-agnostic and strict: seat-name selectors require canonical seat identity inputs and fail deterministically when absent.

## What to Change

### 1. Deduplicate condition-context construction in terminal lowering

Refactor `lowerEndConditions` to build one shared condition-lowering context via `buildConditionLoweringContext` and use it for both `when` and `result` lowering.

### 2. Add compile-entry negative regression guards

Add compile-entry tests that assert seat-name selectors fail with stable diagnostics when canonical `seatIds` are absent:

1. action `actor` / `executor`
2. terminal `result.player`
3. zone qualifier selectors (for example `hand:NVA`)
4. condition owner/pvar selectors

### 3. Harden path determinism for diagnostics

Ensure failures in those surfaces report deterministic diagnostic code and path values.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/test/unit/compile-actions.test.ts` (modify)
- `packages/engine/test/unit/compile-zones.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Canonical seat identity reconciliation policy (SEATRES-002)
- Shared seat-identity contract module across compiler subsystems (SEATRES-004)
- Runtime changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `lowerEndConditions` uses one shared condition-context builder path for `when` and `result` lowering.
2. Seat-name selectors fail deterministically without canonical seat ids at compile-entry surfaces.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Condition lowering context fields cannot diverge between terminal `when` and `result` paths.
2. Compiler seat-name support remains explicit and data-driven; no implicit fallbacks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-actions.test.ts` — compile-entry negative tests for actor/executor/terminal seat-name selectors without canonical seat ids.
2. `packages/engine/test/unit/compile-zones.test.ts` — negative tests for seat-name zone qualifiers without canonical seat ids.
3. `packages/engine/test/unit/compile-conditions.test.ts` — negative tests for owner/pvar seat-name selectors without canonical seat ids.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
3. `node --test packages/engine/dist/test/unit/compile-zones.test.js`
4. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Actually Changed**:
  - Refactored `lowerEndConditions` in `compile-lowering.ts` to construct one shared condition context and reuse it for both terminal `when` and `result` lowering.
  - Added deterministic regression tests for missing canonical seat ids in:
    - action/terminal compile-entry selectors (`compile-actions.test.ts`)
    - zone selector seat-name qualifiers (`compile-zones.test.ts`)
    - condition owner/pvar seat-name selectors (`compile-conditions.test.ts`)
- **Deviations From Original Plan**:
  - No new context builder was introduced; the existing `buildConditionLoweringContext` helper was reused for a cleaner architecture with fewer context-construction paths.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - Targeted tests passed:
    - `node --test packages/engine/dist/test/unit/compile-actions.test.js`
    - `node --test packages/engine/dist/test/unit/compile-zones.test.js`
    - `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
  - Full validation passed:
    - `pnpm turbo test`
    - `pnpm turbo typecheck`
    - `pnpm turbo lint`
