# ENGINEARCH-016: Restore Branded ZoneId Rigor in Zone-Property EvalError Contexts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel eval-error context contracts + zone-prop error emitters + type tests
**Deps**: ENGINEARCH-014

## Problem

`ZONE_PROP_NOT_FOUND` context currently accepts `zoneId: string`. This weakens type guarantees for a core engine contract by allowing arbitrary strings where a zone identifier domain type is expected.

## Assumption Reassessment (2026-02-25)

1. `ZoneId` branded type exists in the kernel branded primitives.
2. Current `ZONE_PROP_NOT_FOUND` context in `packages/engine/src/kernel/eval-error.ts` is typed as plain `string` for `zoneId` (confirmed).
3. `resolveMapSpaceId` in `packages/engine/src/kernel/resolve-selectors.ts` currently returns plain `string`, which is the main source of type weakening for map-space/zone property paths.
4. Existing `zoneProp` and `zonePropIncludes` emitters in `eval-condition.ts` and `resolve-ref.ts` already pass `zoneId` variables directly; once `resolveMapSpaceId` is branded, these call sites naturally preserve brand semantics with minimal edits.
5. Existing tests cover `ZONE_PROP_NOT_FOUND` code behavior in `eval-condition.test.ts` and `resolve-ref.test.ts`, but do not assert branded `zoneId` compile-time rejection for plain string payloads.

## Architecture Check

1. Restoring branded `ZoneId` increases domain rigor and prevents accidental non-zone string leakage.
2. The durable architectural fix is to harden the source (`resolveMapSpaceId`) rather than only patching downstream error context typing.
3. This is strictly game-agnostic type hardening in kernel contracts.
4. No compatibility shims or aliasing: callers are updated to emit correct types directly.

## What to Change

### 1. Re-type `ZONE_PROP_NOT_FOUND.zoneId` to branded `ZoneId`

Update context type mapping for `ZONE_PROP_NOT_FOUND`.

### 2. Harden selector boundary typing (`resolveMapSpaceId`)

Change `resolveMapSpaceId` return type to branded `ZoneId` and normalize bound-string conversion through `asZoneId(...)`.

### 3. Keep zone-prop emitters brand-preserving

Ensure `eval-condition.ts` and `resolve-ref.ts` `ZONE_PROP_NOT_FOUND` payloads compile without casts and preserve branded `zoneId`.

### 4. Add contract tests

Add compile-time and runtime assertions to ensure branded `ZoneId` is preserved in error context and plain string contexts are rejected.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (touch if required by compiler)
- `packages/engine/src/kernel/resolve-ref.ts` (touch if required by compiler)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/resolve-ref.test.ts` (modify)

## Out of Scope

- Zone selector semantics changes
- GameSpecDoc data model changes
- Visual config / runner changes

## Acceptance Criteria

### Tests That Must Pass

1. `ZONE_PROP_NOT_FOUND` rejects non-`ZoneId` `zoneId` at compile time.
2. Existing runtime `zoneProp`/`zonePropIncludes` error paths still behave correctly and expose `context.zoneId`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Error context contracts use kernel domain brands where appropriate.
2. No game-specific special-casing introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time contract checks that plain string `zoneId` is rejected for `ZONE_PROP_NOT_FOUND`.
2. `packages/engine/test/unit/eval-condition.test.ts` — verify `ZONE_PROP_NOT_FOUND` payload integrity (`context.zoneId`) in condition evaluation paths.
3. `packages/engine/test/unit/resolve-ref.test.ts` — verify `ZONE_PROP_NOT_FOUND` payload integrity (`context.zoneId`) in reference resolution paths.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-condition.test.js`
4. `node --test packages/engine/dist/test/unit/resolve-ref.test.js`
5. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Re-typed `ZONE_PROP_NOT_FOUND.zoneId` from `string` to branded `ZoneId`.
  - Re-typed `ZONE_PROP_NOT_FOUND.availableZoneIds` to `readonly ZoneId[]`.
  - Hardened `resolveMapSpaceId` to return branded `ZoneId` and normalize bound/literal zone strings via `asZoneId(...)`.
  - Updated compile-time type contracts in `types-foundation.test.ts` to require branded zone IDs.
  - Strengthened runtime error tests in `eval-condition.test.ts` and `resolve-ref.test.ts` to assert `error.context.zoneId`.
- **Deviation from original plan**:
  - Added `resolve-selectors.ts` as the primary architectural fix point (root cause), rather than only patching downstream emitters.
  - Did not modify `eval-error.test.ts` because existing coverage remained sufficient once stronger contract and runtime-path tests were added.
- **Verification**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-condition.test.js` passed.
  - `node --test packages/engine/dist/test/unit/resolve-ref.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
