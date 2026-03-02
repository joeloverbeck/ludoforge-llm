# SEATRES-042: Clarify seat-reference diagnostic suggestion wording

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — compiler diagnostic wording
**Deps**: archive/tickets/SEATRES-022-split-compiler-seat-reference-diagnostic-code-from-asset-reference-missing.md

## Problem

Seat-reference miss diagnostics currently suggest using “declared seat catalog ids,” which is ambiguous because the failed field is a seat id value, not a data-asset id. This weakens diagnostic precision for users and tooling.

## Assumption Reassessment (2026-03-02)

1. Seat-reference misses currently emit `CNL_COMPILER_SEAT_REF_MISSING` in compiler data-asset derivation flow.
2. The suggestion string for these diagnostics refers to seat catalog ids rather than seat ids.
3. No active ticket in `tickets/` currently scopes wording precision for this compiler diagnostic.

## Architecture Check

1. Precise diagnostic language improves long-term maintainability and supportability of agnostic compiler contracts.
2. This is message-level refinement only; no game-specific logic leaks into `GameDef` or simulation layers.
3. No backward-compatibility shims; canonical code and contract remain unchanged.

## What to Change

### 1. Update seat-reference suggestion text

Change seat-reference diagnostic suggestion to explicitly reference canonical seat ids from the selected seat catalog.

### 2. Add targeted assertion for suggestion text

Add or update unit test assertion to lock wording to the corrected seat-id-focused guidance.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)

## Out of Scope

- Diagnostic code changes
- Seat-selection algorithm changes
- Validator wording parity

## Acceptance Criteria

### Tests That Must Pass

1. Seat-reference diagnostics suggest using declared seat ids from selected seat catalog (not asset ids).
2. Diagnostic code/path behavior remains unchanged from `SEATRES-022`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic semantics stay deterministic and domain-accurate.
2. Compiler remains game-agnostic and free of compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert corrected suggestion wording for a seat-reference miss. Rationale: prevents regression to ambiguous asset-id language.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `pnpm -F @ludoforge/engine test`

