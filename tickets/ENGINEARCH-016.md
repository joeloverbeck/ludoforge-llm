# ENGINEARCH-016: Restore Branded ZoneId Rigor in Zone-Property EvalError Contexts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel eval-error context contracts + zone-prop error emitters + type tests
**Deps**: ENGINEARCH-014

## Problem

`ZONE_PROP_NOT_FOUND` context currently accepts `zoneId: string`. This weakens type guarantees for a core engine contract by allowing arbitrary strings where a zone identifier domain type is expected.

## Assumption Reassessment (2026-02-25)

1. `ZoneId` branded type exists in the kernel branded primitives.
2. Current `ZONE_PROP_NOT_FOUND` context in `packages/engine/src/kernel/eval-error.ts` is typed as plain string for `zoneId`.
3. Existing emitters often carry string forms (`String(zoneId)` / `zone.id`) and need a consistent typed path to emit branded `ZoneId` in error context.

## Architecture Check

1. Restoring branded `ZoneId` increases domain rigor and prevents accidental non-zone string leakage.
2. This is strictly game-agnostic type hardening in kernel contracts.
3. No compatibility shims: callers are updated to emit correct types directly.

## What to Change

### 1. Re-type `ZONE_PROP_NOT_FOUND.zoneId` to branded `ZoneId`

Update context type mapping for `ZONE_PROP_NOT_FOUND`.

### 2. Normalize zone-prop error emitters to branded IDs

Update call sites in resolver/eval-condition paths to emit branded `ZoneId` consistently (including lookup paths currently using string projection).

### 3. Add contract tests

Add compile-time and runtime assertions to ensure branded `ZoneId` is preserved in error context.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify, if needed)

## Out of Scope

- Zone selector semantics changes
- GameSpecDoc data model changes
- Visual config / runner changes

## Acceptance Criteria

### Tests That Must Pass

1. `ZONE_PROP_NOT_FOUND` rejects non-`ZoneId` `zoneId` at compile time.
2. Existing runtime `zoneProp`/`zonePropIncludes` error paths still behave correctly.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Error context contracts use kernel domain brands where appropriate.
2. No game-specific special-casing introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time contract checks for branded `zoneId`.
2. `packages/engine/test/unit/eval-condition.test.ts` — verify `ZONE_PROP_NOT_FOUND` payload integrity in condition evaluation paths.
3. `packages/engine/test/unit/resolve-ref.test.ts` — verify `ZONE_PROP_NOT_FOUND` payload integrity in reference resolution paths.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-condition.test.js`
4. `node --test packages/engine/dist/test/unit/resolve-ref.test.js`
5. `pnpm -F @ludoforge/engine test:unit`
