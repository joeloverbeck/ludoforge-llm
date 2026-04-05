# 112GLBMRKPOLSUR-003: Observer compilation and validation for globalMarkers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL observer compiler, observer validator
**Deps**: `archive/tickets/112GLBMRKPOLSUR-001.md`, `specs/112-global-marker-policy-surface.md`

## Problem

The observer compilation pipeline doesn't know about `globalMarkers`. Game specs that define `observability.observers.*.surfaces.globalMarkers` will have those entries silently ignored. The observer validator won't recognize `globalMarkers` as a valid surface family key, potentially emitting false-positive warnings.

## Assumption Reassessment (2026-04-05)

1. `SURFACE_DEFAULTS` at `compile-observers.ts:40-50` — confirmed, 9 entries, no `globalMarkers`.
2. `LowerObserversOptions` at `compile-observers.ts:29-34` — confirmed, has `knownGlobalVarIds`, `knownPerPlayerVarIds`, `knownDerivedMetricIds`, `knownZoneBaseIds`.
3. `buildDefaultSurfaces` at `compile-observers.ts:443-457` — confirmed, builds catalog with 8 families.
4. `buildOmniscientSurfaces` at `compile-observers.ts:466-484` — confirmed, all-public catalog.
5. `resolveObserverSurfaces` at `compile-observers.ts:181-262` — confirmed, merges overrides.
6. `OBSERVER_SURFACE_FAMILY_KEYS` at `validate-observers.ts:5-14` — confirmed, 8 entries.
7. `MAP_TYPE_SURFACE_FAMILIES` at `validate-observers.ts:16` — confirmed, set of 3 (`globalVars`, `perPlayerVars`, `derivedMetrics`).
8. `KnownSurfaceIds` at `validate-observers.ts:32-36` — confirmed, 3 fields.

## Architecture Check

1. Follows the exact `globalVars` pattern in every function: add to defaults, add to options, add to builders, add to resolver. No new patterns.
2. `globalMarkers` is a map-type family (like `globalVars`) — keyed by marker ID, each with its own visibility. Not a scalar like `activeCardTag`.
3. Default visibility is `public` — capability tracks are open information in most board games. Override via observability config.

## What to Change

### 1. Add to `SURFACE_DEFAULTS` (`compile-observers.ts:40-50`)

```typescript
globalMarkers: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: false } },
```

### 2. Add `knownGlobalMarkerIds` to `LowerObserversOptions` (`compile-observers.ts:29-34`)

```typescript
readonly knownGlobalMarkerIds?: readonly string[];
```

### 3. Add `globalMarkers` to `buildDefaultSurfaces` (`compile-observers.ts:443-457`)

Follow the `globalVars` pattern — expand map defaults using `knownGlobalMarkerIds`.

### 4. Add `globalMarkers` to `buildOmniscientSurfaces` (`compile-observers.ts:466-484`)

All-public entry for each known marker ID.

### 5. Add `globalMarkers` to `resolveObserverSurfaces` (`compile-observers.ts:181-262`)

Use `lowerObserverMapTypeSurface` pattern (same as `globalVars` at lines 193-216) to merge user overrides.

### 6. Add to `OBSERVER_SURFACE_FAMILY_KEYS` (`validate-observers.ts:5-14`)

```typescript
'globalMarkers',
```

### 7. Add to `MAP_TYPE_SURFACE_FAMILIES` (`validate-observers.ts:16`)

```typescript
const MAP_TYPE_SURFACE_FAMILIES = new Set<string>(['globalVars', 'perPlayerVars', 'derivedMetrics', 'globalMarkers']);
```

### 8. Add to `KnownSurfaceIds` (`validate-observers.ts:32-36`)

```typescript
readonly globalMarkers: ReadonlySet<string>;
```

## Files to Touch

- `packages/engine/src/cnl/compile-observers.ts` (modify)
- `packages/engine/src/cnl/validate-observers.ts` (modify)

## Out of Scope

- No changes to `compile-agents.ts` or `compiler-core.ts` (ticket 004)
- No parsing or runtime resolution (ticket 002)
- No game data or cookbook changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles cleanly with `globalMarkers` surface in observability config (if added)
2. FITL compiles cleanly without `globalMarkers` in observability config (backward compat — empty map default)
3. Observer validator accepts `globalMarkers` as a valid surface family key
4. Observer validator rejects unknown marker IDs within `globalMarkers` map
5. Omniscient surfaces include `globalMarkers` with all-public visibility
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Default visibility for globalMarkers is `public` (capability tracks are open information)
2. All 8 existing surface families continue to compile and validate identically
3. Games without `globalMarkerLattices` get an empty `globalMarkers` map in the catalog

## Test Plan

### New/Modified Tests

1. Existing observer compilation tests should pass with the new field present in the catalog. If any golden fixtures include `CompiledSurfaceCatalog`, they need regeneration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-04-05.

Implemented the observer-side `globalMarkers` compilation boundary end to end:
- `compile-observers.ts` now treats `globalMarkers` as a real map-type observer surface family, including defaults, omniscient expansion, and override lowering.
- `validate-observers.ts` now recognizes `globalMarkers` as a supported map-type family and validates marker IDs.
- `compiler-core.ts` now passes known global marker IDs into observer validation and lowering.
- `game-spec-doc.ts` now includes `observability.observers.*.surfaces.globalMarkers` in the authored source shape.

Tests and fixtures were updated on the live owning surfaces:
- observer unit tests now cover `globalMarkers` defaults, omniscient expansion, empty-known-ID behavior, accepted config, and unknown-ID rejection
- observer compilation end-to-end coverage now proves authored `globalMarkers` visibility survives compilation
- the FITL policy catalog golden was refreshed because the earlier placeholder `globalMarkers: {}` field now contains real compiled observer visibility data

Corrected boundary notes:
- The original ticket said `compiler-core.ts` was out of scope, but after reassessment that observer-side wiring was pulled into this ticket via confirmed `1-3-1` because it is part of the real observer compilation boundary.
- The authored source-shape file `game-spec-doc.ts` also needed updating even though it was not named in the original file list.

Verification run:
1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine run schema:artifacts:check`
3. `node --test packages/engine/dist/test/unit/cnl/compile-observers.test.js packages/engine/dist/test/unit/cnl/compile-observers-zones.test.js packages/engine/dist/test/unit/cnl/validate-observers.test.js packages/engine/dist/test/unit/cnl/validate-observers-zones.test.js packages/engine/dist/test/integration/observer-compilation-e2e.test.js`
4. `node packages/engine/dist/test/unit/policy-production-golden.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
