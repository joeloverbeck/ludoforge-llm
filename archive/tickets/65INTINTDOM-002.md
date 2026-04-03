# 65INTINTDOM-002: ZoneId branded type migration (string → number)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — branded.ts (ZoneId type), all kernel/cnl modules that reference ZoneId
**Deps**: `archive/tickets/65INTINTDOM-001.md`

## Problem

`ZoneId` is currently `Brand<string, 'ZoneId'>`. Every zone lookup, comparison, and Set/Map operation uses string keys, contributing to ~9% CPU overhead from string operations. Changing `ZoneId` to `Brand<number, 'ZoneId'>` is the foundation for integer-indexed zone access and eliminates string comparisons for the highest-frequency domain identifier.

## Assumption Reassessment (2026-04-03)

1. `ZoneId` is defined in `branded.ts:4` as `Brand<string, 'ZoneId'>` with `asZoneId(string)` constructor and `isZoneId` guard checking `typeof value === 'string'`.
2. ~45 files import `ZoneId` across the engine package.
3. `eval-query.ts` uses `String(zoneId)` casts at lines 519 and 829 — these will need updating to use the integer value directly.
4. Integer `0` is falsy in JS — any bare `if (zoneId)` checks will break for zone index 0. Must grep and fix all truthiness checks.

## Architecture Check

1. Branded number types satisfy Foundation 17 (Strongly Typed Domain Identifiers) — distinct nominal types, just with number base instead of string.
2. TypeScript's type system catches all usage sites at compile time — the compiler error list IS the migration checklist.
3. No backwards-compatibility shims — `ZoneId` changes from string to number in one atomic commit. No dual-type period.

## What to Change

### 1. Change `ZoneId` type in `branded.ts`

```typescript
// Before
export type ZoneId = Brand<string, 'ZoneId'>;
export const asZoneId = (value: string): ZoneId => value as ZoneId;
export const isZoneId = (value: unknown): value is ZoneId => typeof value === 'string';

// After
export type ZoneId = Brand<number, 'ZoneId'>;
export const asZoneId = (value: number): ZoneId => value as ZoneId;
export const isZoneId = (value: unknown): value is ZoneId => typeof value === 'number';
```

### 2. Fix all compilation errors

Run `pnpm turbo typecheck` and fix every error. Common patterns:
- `asZoneId('some-string')` → use intern table lookup
- String concatenation with ZoneId → use extern function
- `String(zoneId)` casts in `eval-query.ts` → remove, use integer directly
- Template literals with ZoneId → use extern function at output boundaries

### 3. Fix falsy-check hazard

Grep for patterns like `if (zoneId)`, `zoneId || default`, `zoneId && ...` across all engine files. Replace with explicit `zoneId !== undefined` or `zoneId !== -1` checks. Zone index 0 is a valid zone.

### 4. Update compiler to emit integer ZoneIds

Modify compiler modules that emit ZoneId values to use the intern table from ticket 001. Zone references in compiled GameDef use integer indices, not strings.

## Files to Touch

- `packages/engine/src/kernel/branded.ts` (modify) — ZoneId type, constructor, guard
- `packages/engine/src/kernel/eval-query.ts` (modify) — remove `String(zoneId)` casts
- `packages/engine/src/cnl/compiler-core.ts` (modify) — emit integer ZoneIds
- `packages/engine/src/cnl/` (modify) — all compiler modules that produce ZoneId values
- All kernel modules importing ZoneId (modify) — ~45 files, fix compilation errors
- All test files referencing ZoneId (modify) — update string zone IDs to integers via intern table

## Out of Scope

- Changing `GameState.zones` from Record to array (ticket 003)
- Serialization boundary integration (ticket 004)
- Runner migration (ticket 005)
- Other branded ID types — ActionId, PhaseId, SeatId (ticket 007)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes with zero errors
2. No bare truthiness checks on ZoneId remain (grep verification)
3. FITL and Texas Hold'em compile with integer ZoneIds in GameDef
4. Existing suite: `pnpm turbo test`

### Invariants

1. `ZoneId` is `Brand<number, 'ZoneId'>` — never a string at runtime
2. No `String(zoneId)` casts remain in kernel code
3. All ZoneId comparisons use `===` on numbers, not string comparison

## Test Plan

### New/Modified Tests

1. All existing tests that construct ZoneId values — update from string to integer using intern table
2. `packages/engine/test/unit/kernel/branded.test.ts` — verify `asZoneId` accepts number, `isZoneId` checks `typeof === 'number'`

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-04-04
- What changed:
  - Preserved canonical string `ZoneId` at the serialized `GameDef` boundary per `docs/FOUNDATIONS.md` instead of changing `ZoneId` itself to `Brand<number>`.
  - Added a runtime-only branded numeric `RuntimeZoneId` plus the new zone normalization layer in `packages/engine/src/kernel/runtime-zone-index.ts`.
  - Updated `packages/engine/src/kernel/spatial.ts` to build numeric runtime adjacency from the normalized zone index while preserving the outward canonical-string graph API used by existing kernel callers.
  - Extended `GameDefRuntime` with `zoneRuntimeIndex` and exported the new runtime layer from the kernel index.
  - Added focused unit coverage for runtime zone indexing and numeric adjacency storage, and updated one hand-built `GameDefRuntime` test fixture to include the new required runtime field.
- Deviations from original plan:
  - The original ticket boundary was not Foundation-compliant as written. `ZoneId` did not change from `Brand<string>` to `Brand<number>`, compiler output did not switch serialized zone ids to integers, and no repo-wide atomic `ZoneId` migration was performed.
  - Instead, the implemented boundary used a separate runtime-only numeric zone identifier layer inside `GameDefRuntime`, which preserves Foundation 17 while still delivering the intended runtime zone-indexing step ahead of `65INTINTDOM-003`.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/spatial-graph.test.js dist/test/unit/kernel/runtime-zone-index.test.js dist/test/unit/kernel/condition-annotator.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
