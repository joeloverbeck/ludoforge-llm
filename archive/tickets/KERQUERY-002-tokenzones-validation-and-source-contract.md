# KERQUERY-002: Strengthen tokenZones validation and source contract diagnostics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — validation and diagnostics around query transforms
**Deps**: packages/engine/src/cnl/compile-conditions.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/eval-query.ts

## Problem

`tokenZones` validation in behavior checks source-shape compatibility, but does not enforce `dedupe` literal type when malformed payloads bypass static typing. Runtime diagnostics for malformed source items exist, but contract coverage is weak in tests.

## Assumption Reassessment (2026-03-04)

1. CNL lowering validates `dedupe` type in `compile-conditions`, but behavior-level `validateOptionsQuery` does not.
2. Behavior validation already enforces `tokenZones` source-shape compatibility (`token|string|unknown`) via `DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH`.
3. Runtime already throws deterministic `TYPE_MISMATCH` for incompatible `tokenZones` source items and includes query/source/item details in error context; tests currently assert code but not detail contract.

## Architecture Check

1. Transform queries should have explicit validation contracts in both lowering and behavior validation.
2. This is engine-wide query validation, not game-specific logic.
3. No backward compatibility path is needed; invalid payloads should fail fast.

## What to Change

### 1. Add missing behavior validation for `tokenZones.dedupe`

1. In `validateOptionsQuery`, validate `tokenZones.dedupe` as boolean when present.
2. Emit deterministic domain diagnostic metadata (`code`, `path`, `severity`, message/suggestion) for malformed `dedupe`.

### 2. Strengthen runtime diagnostic contract tests (no behavior change expected)

1. Add/strengthen tests asserting existing `evalQuery` `TYPE_MISMATCH` context shape for invalid `tokenZones` source items.
2. Keep runtime implementation stable unless tests reveal a real contract gap.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Query contract shape/domain reclassification (`KERQUERY-001`)
- Event card content edits

## Acceptance Criteria

### Tests That Must Pass

1. Invalid `tokenZones.dedupe` payloads are rejected during behavior validation.
2. Invalid `tokenZones` source items produce deterministic runtime `TYPE_MISMATCH` diagnostics with asserted context fields.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query transform validation must happen before runtime where feasible.
2. Diagnostics must remain engine-agnostic and reusable across games/specs.
3. Existing stable runtime behavior should not be rewritten when validation/test coverage closes the gap.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — malformed `tokenZones` payload validation.
2. `packages/engine/test/unit/eval-query.test.ts` — source incompatibility diagnostic scenarios.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Added behavior-level validation for malformed `tokenZones.dedupe` payloads in `validateOptionsQuery` with deterministic diagnostic `DOMAIN_TOKEN_ZONES_DEDUPE_INVALID`.
  - Added a unit test in `validate-gamedef.test.ts` covering non-boolean `tokenZones.dedupe`.
  - Added a unit test in `eval-query.test.ts` asserting `TYPE_MISMATCH` context includes `source`, `item`, and `itemType` for invalid `tokenZones` source items.
- **Deviations from original plan**:
  - No runtime code changes were required in `eval-query.ts`; reassessment confirmed runtime diagnostics were already present and architecture-consistent.
  - Source-shape compatibility validation for `tokenZones` was already implemented and retained as-is.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/eval-query.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
