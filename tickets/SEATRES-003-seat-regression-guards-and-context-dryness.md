# SEATRES-003: Seat-resolution regression guards and condition-context deduplication

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler lowering + tests (`compile-lowering.ts`, `compile-conditions.ts`, unit tests)
**Deps**: archive/tickets/SEATRES-001-universal-seat-name-resolution.md, archive/tickets/SEATRES-002-canonical-seat-identity-source.md

## Problem

SEATRES-001 expanded seat-name resolution coverage, but two robustness gaps remain:

1. `lowerEndConditions` constructs equivalent condition context objects twice inline (`when` and `result`), increasing drift risk as context fields evolve.
2. Negative compile-entry regression guards are incomplete for seat-name selectors when `seatIds` are unavailable.

Without these guards, future refactors can reintroduce inconsistent behavior across lowering paths.

## Assumption Reassessment (2026-03-01)

1. `compile-lowering.ts` currently duplicates condition-context assembly in `lowerEndConditions`.
2. Existing tests strongly cover positive seat-name resolution but do not comprehensively pin failure behavior at compile-entry level when `seatIds` are absent.
3. No active ticket in `tickets/*` currently covers this context-dedup + regression-hardening work.

## Architecture Check

1. Centralizing context construction is cleaner and reduces high-churn drift risk.
2. Strong negative regression tests reinforce deterministic compiler contracts without introducing game-specific logic.
3. No compatibility shims: unsupported seat-name usage without canonical seat ids must fail explicitly.

## What to Change

### 1. Deduplicate condition-context construction in terminal lowering

Refactor `lowerEndConditions` to use a single helper/builder for its condition context, including `seatIds`, so `when` and `result` consume the same source.

### 2. Add compile-entry negative regression guards

Add tests that explicitly assert seat-name selectors fail with stable diagnostics when canonical seat ids are absent:

1. action `actor` / `executor`
2. terminal `result.player`
3. zone qualifier selectors (e.g. `hand:NVA`)
4. condition owner/pvar selectors

### 3. Harden path determinism for diagnostics

Ensure diagnostics from those failures report stable paths and codes to prevent future accidental behavior drift.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/test/unit/compile-actions.test.ts` (modify)
- `packages/engine/test/unit/compile-zones.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Canonical seat identity reconciliation policy (SEATRES-002)
- Runtime changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `lowerEndConditions` uses one shared context builder path for `when` and `result` lowering.
2. Seat-name selectors fail deterministically without canonical seat ids at compile-entry surfaces.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Condition lowering context fields cannot diverge between terminal `when` and `result` paths.
2. Compiler seat-name support remains explicit and data-driven; no implicit fallbacks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-actions.test.ts` — negative tests for actor/executor/terminal seat-name selectors without seat ids.
2. `packages/engine/test/unit/compile-zones.test.ts` — negative tests for seat-name zone qualifiers without seat ids.
3. `packages/engine/test/unit/compile-conditions.test.ts` — negative tests for owner/pvar seat-name selectors without seat ids.

### Commands

1. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
2. `node --test packages/engine/dist/test/unit/compile-zones.test.js`
3. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
4. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
