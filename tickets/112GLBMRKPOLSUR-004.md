# 112GLBMRKPOLSUR-004: Compile-agents defaults and compiler-core wiring

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL agent compiler, compiler core
**Deps**: `tickets/112GLBMRKPOLSUR-003.md`, `specs/112-global-marker-policy-surface.md`

## Problem

When no observer catalog is available, `compile-agents.ts` builds a fallback default catalog that currently omits `globalMarkers`. Also, `compiler-core.ts` doesn't pass `knownGlobalMarkerIds` to the `lowerObservers` or `lowerAgents` calls, so the compilation pipeline can't populate the catalog with the game's actual marker IDs.

## Assumption Reassessment (2026-04-05)

1. Fallback catalog construction at `compile-agents.ts:153-173` — confirmed, builds 8-family catalog.
2. `LowerAgentsOptions` — confirmed, has `globalVarIds`, `perPlayerVarIds`, `policyMetricIds`.
3. `lowerObservers` call at `compiler-core.ts:700-706` — confirmed, passes 3 known ID arrays.
4. `lowerAgents` call at `compiler-core.ts:709-731` — confirmed, passes ID arrays.
5. `sections.globalMarkerLattices` is available in compiler-core.ts after line 360 — confirmed.

## Architecture Check

1. Follows the exact `globalVarIds` pattern: add to options, build defaults, pass from compiler-core. No new patterns.
2. Marker IDs are derived from `sections.globalMarkerLattices.map(m => m.id)` — same pattern as global vars using `mergedGlobalVars.map(v => v.name)`.
3. Engine-agnostic: passes whatever marker IDs the game spec defines, no hardcoded names.

## What to Change

### 1. Add `globalMarkerIds` to `LowerAgentsOptions` (`compile-agents.ts`)

```typescript
readonly globalMarkerIds?: readonly string[];
```

### 2. Add `globalMarkers` to fallback catalog construction (`compile-agents.ts:153-173`)

```typescript
const globalMarkerDefaults: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: false },
};
const globalMarkers: Record<string, CompiledSurfaceVisibility> = {};
for (const id of options.globalMarkerIds ?? []) {
  globalMarkers[id] = globalMarkerDefaults;
}
```

Add `globalMarkers` to the returned catalog object.

### 3. Add `globalMarkerIds` to `lowerAgents` call in `compiler-core.ts` (~line 709-731)

```typescript
globalMarkerIds: (sections.globalMarkerLattices ?? []).map((m) => m.id),
```

### 4. Add `knownGlobalMarkerIds` to `lowerObservers` call in `compiler-core.ts` (~line 700-706)

```typescript
knownGlobalMarkerIds: (sections.globalMarkerLattices ?? []).map((m) => m.id),
```

### 5. Validate unknown marker IDs in compile-agents ref validation

When a `globalMarker.*` ref is encountered during agent compilation, verify the marker ID exists in `globalMarkerIds`. Emit a diagnostic if unknown. This is handled by the existing validation in `parseAuthoredPolicySurfaceRef` returning `undefined` for unknown IDs (the catalog won't contain the ID).

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)

## Out of Scope

- No changes to observer compilation (ticket 003)
- No changes to policy-surface.ts or policy-runtime.ts (ticket 002)
- No game data or cookbook changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles cleanly with globalMarker refs in agent profiles (once profiles use them)
2. Unknown marker ID in agent ref produces compilation diagnostic
3. Fallback catalog includes `globalMarkers` with correct default visibility
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Fallback defaults for `globalMarkers` match observer defaults: `public` current, `public` preview
2. All existing agent compilation behavior unchanged
3. Games without `globalMarkerLattices` produce an empty `globalMarkers` map

## Test Plan

### New/Modified Tests

1. Existing compilation tests should pass. Golden fixtures may need regeneration if they include the full catalog.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
