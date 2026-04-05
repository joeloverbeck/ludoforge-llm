# 112GLBMRKPOLSUR-004: Compile-agents defaults and agent compiler-core wiring

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL agent compiler, compiler core agent wiring
**Deps**: `archive/tickets/112GLBMRKPOLSUR-003.md`, `specs/112-global-marker-policy-surface.md`

## Problem

When no observer catalog is available, `compile-agents.ts` builds a fallback default catalog that currently omits `globalMarkers`. Also, the agent-side `lowerAgents` call in `compiler-core.ts` still does not pass `globalMarkerIds`, so the agent compilation pipeline cannot populate the fallback catalog with the game's actual marker IDs.

## Assumption Reassessment (2026-04-05)

1. Fallback catalog construction at `compile-agents.ts:153-173` — confirmed, builds 8-family catalog.
2. `LowerAgentsOptions` — confirmed, has `globalVarIds`, `perPlayerVarIds`, `policyMetricIds`.
3. `lowerAgents` call at `compiler-core.ts:709-731` — confirmed, still passes no `globalMarkerIds`.
4. Observer-side `compiler-core.ts` wiring for `knownGlobalMarkerIds` is already owned by and implemented in ticket `003`.
5. `sections.globalMarkerLattices` is available in compiler-core.ts after line 360 — confirmed.

## Architecture Check

1. Follows the exact `globalVarIds` pattern on the agent side: add to options, build defaults, pass from the `lowerAgents` call in `compiler-core`. No new patterns.
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

### 4. Validate unknown marker IDs in compile-agents ref validation

When a `globalMarker.*` ref is encountered during agent compilation, verify the marker ID exists in `globalMarkerIds`. Emit a diagnostic if unknown. This is handled by the existing validation in `parseAuthoredPolicySurfaceRef` returning `undefined` for unknown IDs (the catalog won't contain the ID).

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)

## Out of Scope

- No changes to observer compilation or observer-side `compiler-core` wiring (ticket 003)
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

## Outcome

Completed on 2026-04-05.

Implemented the missing agent-side half of the `globalMarkers` policy-surface compilation path:
- `compile-agents.ts` now accepts `globalMarkerIds` in `LowerAgentsOptions`
- the no-observer fallback `surfaceVisibility` catalog now populates `globalMarkers` entries with the same public/current and public/preview defaults used on the observer side
- `compiler-core.ts` now passes `sections.globalMarkerLattices` IDs into `lowerAgents(...)`

Focused proof coverage was added in the live owning test module:
- `compile-agents-authoring.test.ts` now proves fallback catalogs include populated `globalMarkers`
- the same test module now proves unknown `globalMarker.*` refs fail compilation with `CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN`

Deviations from the original plan:
- No separate ref-validation branch was needed in `compile-agents.ts`; the existing `parseAuthoredPolicySurfaceRef(...)` path already handled unknown marker IDs once the fallback catalog received real marker entries.
- I explicitly checked the nearby FITL policy catalog golden, but it required no update because the primary production path already sourced populated marker visibility through the observer-derived catalog rather than the fallback path changed in this ticket.

Verification run:
1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js`
3. `node packages/engine/dist/test/unit/policy-production-golden.test.js`
4. `pnpm -F @ludoforge/engine test`
