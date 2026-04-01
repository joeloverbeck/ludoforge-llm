# 106ZONTOKOBS-004: Add zone compilation to `compile-observers.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `compile-observers.ts`, `compiler-core.ts`
**Deps**: `tickets/106ZONTOKOBS-001.md`, `tickets/106ZONTOKOBS-002.md`, `tickets/106ZONTOKOBS-003.md`, `specs/106-zone-token-observer-integration.md`

## Problem

Observer profiles with `zones` in YAML must be compiled into `CompiledZoneVisibilityCatalog` on each `CompiledObserverProfile`. The compilation must handle `_default` expansion, `extends` inheritance (per-zone override, consistent with surface extends), and built-in observer zone behavior.

## Assumption Reassessment (2026-04-01)

1. `compile-observers.ts` exists with `lowerObservers()` — confirmed. Currently builds `surfaces` only, no `zones`.
2. `LowerObserversOptions` has `knownGlobalVarIds`, `knownPerPlayerVarIds`, `knownDerivedMetricIds` — confirmed. Needs `knownZoneBaseIds`.
3. `resolveObserverSurfaces()` applies surface overrides on a base — confirmed. Zone resolution follows the same pattern.
4. Built-in `omniscient` is constructed in `buildOmniscientSurfaces()` — confirmed. Needs parallel `buildOmniscientZones()`.
5. Built-in `default` is constructed in `buildDefaultSurfaces()` — confirmed. `default` zones = `undefined`.
6. `fingerprintObserverIr()` uses generic canonicalization — confirmed. Including `zones` in the profile object suffices for fingerprinting.

## Architecture Check

1. Zone compilation follows the same pattern as surface compilation — consistent architecture.
2. `extends` for zones uses per-zone override (not full replacement) — consistent with Spec 102 surface extends.
3. `omniscient` uses `defaultEntry` instead of enumerating all zone base IDs — cleaner, automatically covers any zone.
4. `default` has `zones: undefined` — natural fallback to `ZoneDef.visibility`, not a compatibility shim.

## What to Change

### 1. Extend `LowerObserversOptions`

Add `knownZoneBaseIds: readonly string[]`.

### 2. Add zone resolution functions

Parallel to surface resolution:
- `resolveBaseZones(name, profileDef, allProfiles, options, diagnostics)` — resolves parent zones via `extends` or returns empty base.
- `resolveObserverZones(zones, base, diagnostics, path)` — applies zone overrides on top of base. Handles `_default` and per-base-ID entries.

### 3. Update per-profile compilation in `lowerObservers()`

For each user-defined profile:
1. Resolve base zones (from parent via `extends`, or `undefined`).
2. Apply zone overrides from `profileDef.zones`.
3. Store compiled `CompiledZoneVisibilityCatalog` or `undefined` on the profile.

### 4. Build built-in zones

- `buildOmniscientZones()`: returns `{ entries: {}, defaultEntry: { tokens: 'public', order: 'public' } }`.
- `buildDefaultZones()`: returns `undefined`.

### 5. Update `compiler-core.ts`

Pass `knownZoneBaseIds` (extracted from zone compilation results) to `lowerObservers()`.

## Files to Touch

- `packages/engine/src/cnl/compile-observers.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)

## Out of Scope

- Runtime changes (`observation.ts`) — that is ticket 005
- Game spec migration — ticket 006
- Diagnostic codes — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. Profile with no zones compiles to `zones: undefined`
2. Profile with `_default` only compiles to `zones: { entries: {}, defaultEntry: {...} }`
3. Profile with specific zone entries compiles correctly
4. Profile with both `_default` and specific entries compiles correctly
5. `extends` inherits parent zone entries; child overrides per-zone
6. `extends` with child `_default` replaces parent `_default`
7. `omniscient` built-in has `zones: { entries: {}, defaultEntry: { tokens: 'public', order: 'public' } }`
8. `default` built-in has `zones: undefined`
9. Fingerprint changes when zone entries are added
10. Existing compile-observers tests pass unchanged

### Invariants

1. Zone compilation is pure — no side effects, deterministic output
2. Zone `extends` is consistent with surface `extends` (per-field override, not full replacement)
3. Built-in profiles always have correct zone behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-observers-zones.test.ts` — comprehensive zone compilation tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern compile-observers` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
