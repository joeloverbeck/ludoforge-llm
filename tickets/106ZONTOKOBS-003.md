# 106ZONTOKOBS-003: Add zone validation to `validate-observers.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `validate-observers.ts`, `compiler-core.ts`
**Deps**: `archive/tickets/106ZONTOKOBS-001.md`, `archive/tickets/106ZONTOKOBS-002.md`, `specs/106-zone-token-observer-integration.md`

## Problem

Observer profiles can now declare `zones` in YAML. The validator must check that zone base IDs reference existing zones, that `tokens`/`order` values are valid visibility classes, and emit warnings for set-zone order and owner-on-none edge cases. The reserved-key diagnostic for `zones` must be removed.

## Assumption Reassessment (2026-04-01)

1. `validate-observers.ts` has `RESERVED_PROFILE_KEYS = new Set(['zones'])` — confirmed. Must remove `zones` from it.
2. `OBSERVER_PROFILE_KEYS = new Set(['extends', 'description', 'surfaces'])` — confirmed. Must add `zones`.
3. `KnownSurfaceIds` interface exported from `validate-observers.ts` — confirmed. Zone info needs a similar parameter.
4. `compiler-core.ts` calls `validateObservers(resolvedTableRefDoc.observability, knownSurfaceIds, diagnostics)` at line ~683 — confirmed. Must add zone info parameters.
5. Zone base IDs are available from `MaterializedZones` or from `resolvedTableRefDoc.zones` — the base IDs can be extracted from `GameSpecZoneDef.id` before materialization, or from materialized zones by extracting the base from qualified IDs.

## Architecture Check

1. Validation is extracted to the existing `validate-observers.ts` — consistent with Spec 102 pattern.
2. Zone base ID validation at compile time aligns with Foundation 12 (Compiler-Kernel Boundary).
3. Warning diagnostics for set-zone order and owner-on-none are helpful but non-blocking.

## What to Change

### 1. Update key sets in `validate-observers.ts`

- Remove `'zones'` from `RESERVED_PROFILE_KEYS`.
- Add `'zones'` to `OBSERVER_PROFILE_KEYS`.

### 2. Add zone info parameter

Add a new `KnownZoneInfo` interface (or extend `KnownSurfaceIds`):

```typescript
export interface KnownZoneInfo {
  readonly zoneBaseIds: ReadonlySet<string>;
  readonly zoneOrderingByBase: Readonly<Record<string, string>>;  // 'stack' | 'queue' | 'set'
  readonly zoneOwnershipByBase: Readonly<Record<string, string>>; // 'none' | 'player'
}
```

Update `validateObservers` signature to accept `KnownZoneInfo`.

### 3. Add `validateZones()` function

Validation rules:
- `zones` must be a record (object).
- Each key must be `_default` or a known zone base ID. Unknown base IDs emit error diagnostic.
- Each value must be an object with at least one of `tokens` or `order`.
- `tokens` and `order` values must be `'public' | 'owner' | 'hidden'`.
- **Warning**: if zone base has ordering `set` and `order` is explicitly set differently from `tokens`, warn that order is meaningless for set zones.
- **Warning**: if zone has `owner: 'none'` and entry specifies `tokens: owner` or `order: owner`, warn that owner visibility on non-owned zones is equivalent to hidden.
- Unknown keys within a zone entry (other than `tokens` and `order`) emit warning.

### 4. Update `compiler-core.ts` to pass zone info

Extract zone base IDs and ordering from `resolvedTableRefDoc.zones` (or from materialized zones) and pass to `validateObservers`.

## Files to Touch

- `packages/engine/src/cnl/validate-observers.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)

## Out of Scope

- Zone compilation in `compile-observers.ts` — that is ticket 004
- Runtime changes — ticket 005
- Game spec migration — ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. Valid zone entries pass validation with no diagnostics
2. Unknown zone base ID emits error diagnostic
3. Invalid `tokens` or `order` value emits error diagnostic
4. Empty zone entry (no `tokens` or `order`) emits error diagnostic
5. `zones` key no longer emits reserved-key error
6. Warning for `order` differing from `tokens` on a `set`-type zone
7. Warning for `tokens: owner` on `owner: 'none'` zone
8. `_default` entry with valid values passes validation
9. Existing tests pass unchanged

### Invariants

1. Validation is pure — no side effects, no mutation
2. Zone base ID validation happens at compile time (Foundation 12)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-observers-zones.test.ts` — comprehensive zone validation tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern validate-observers` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
