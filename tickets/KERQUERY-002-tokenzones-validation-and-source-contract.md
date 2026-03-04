# KERQUERY-002: Strengthen tokenZones validation and source contract diagnostics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — validation and diagnostics around query transforms
**Deps**: packages/engine/src/cnl/compile-conditions.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/eval-query.ts

## Problem

`tokenZones` validation currently checks only nested source query shape recursively and does not fully enforce transform-specific constraints (`dedupe` type and source compatibility). Runtime then becomes the first line of defense for malformed payloads.

## Assumption Reassessment (2026-03-04)

1. CNL lowering validates `dedupe` type in `compile-conditions`, but behavior-level `validateOptionsQuery` does not.
2. Runtime accepts token objects and known token-id strings from source items; invalid source items throw late at runtime.
3. We need deterministic, earlier diagnostics for malformed query payloads to keep authored specs safer.

## Architecture Check

1. Transform queries should have explicit validation contracts in both lowering and behavior validation.
2. This is engine-wide query validation, not game-specific logic.
3. No backward compatibility path is needed; invalid payloads should fail fast.

## What to Change

### 1. Add transform-specific behavior validation

1. In `validateOptionsQuery`, validate `tokenZones.dedupe` as boolean when present.
2. Add source-compatibility diagnostic rules for `tokenZones` (token or token-id-compatible inputs only, with clear guidance).

### 2. Clarify runtime error diagnostics

1. Ensure `evalQuery` type mismatch errors for `tokenZones` include source query and offending item details.
2. Keep error codes deterministic and consistent with existing runtime diagnostics taxonomy.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- Query contract shape/domain reclassification (`KERQUERY-001`)
- Event card content edits

## Acceptance Criteria

### Tests That Must Pass

1. Invalid `tokenZones.dedupe` payloads are rejected during behavior validation.
2. Invalid `tokenZones` source items produce deterministic runtime type mismatch diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query transform validation must happen before runtime where feasible.
2. Diagnostics must remain engine-agnostic and reusable across games/specs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — malformed `tokenZones` payload validation.
2. `packages/engine/test/unit/eval-query.test.ts` — source incompatibility diagnostic scenarios.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
