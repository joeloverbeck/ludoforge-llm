# 112GLBMRKPOLSUR-002: Parse and resolve globalMarker refs in policy surface

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agent policy surface, agent policy runtime
**Deps**: `archive/tickets/112GLBMRKPOLSUR-001.md`, `specs/112-global-marker-policy-surface.md`

## Problem

Agent profiles cannot reference `globalMarker.*` paths because the policy surface parser doesn't recognize them and the runtime resolver has no case for the `globalMarker` family. This ticket adds parsing (compile-time) and resolution (runtime) following the existing `var.global.*` pattern.

## Assumption Reassessment (2026-04-05)

1. `parseAuthoredPolicySurfaceRef` at `policy-surface.ts:26-216` handles all current families — confirmed.
2. `getPolicySurfaceVisibility` at `policy-surface.ts:218-242` switches on family — confirmed.
3. `currentSurface.resolveSurface` at `policy-runtime.ts:180-262` resolves refs at runtime — confirmed.
4. `GameState.globalMarkers` is `Readonly<Record<string, string>>` at `types-core.ts:1086` — confirmed.
5. `GameDef.globalMarkerLattices` is `readonly GlobalMarkerLatticeDef[]` at `types-core.ts:777` — confirmed.
6. Kernel `resolve-ref.ts:428-444` resolves `globalMarkerState` refs with fallback to `lattice.defaultState` — confirmed pattern to follow.

## Architecture Check

1. Follows the exact `var.global.*` pattern: parse prefix → extract ID → look up visibility in catalog → return `CompiledSurfaceRef`. No new patterns introduced.
2. Runtime resolution reads `state.globalMarkers[id]` with fallback to `def.globalMarkerLattices.find(l => l.id).defaultState` — same pattern as kernel `resolve-ref.ts`.
3. Engine-agnostic: resolves any game's global markers by ID, not game-specific marker names.

## What to Change

### 1. Add `globalMarker.*` parsing to `parseAuthoredPolicySurfaceRef` (`policy-surface.ts`)

After the existing `var.global.*` block (around line 40), add:

```typescript
if (refPath.startsWith('globalMarker.')) {
  const markerId = refPath.slice('globalMarker.'.length);
  if (markerId.length === 0) {
    return undefined; // invalid — no marker ID
  }
  const visibility = catalog.globalMarkers[markerId];
  if (visibility === undefined) {
    return undefined; // unknown marker ID
  }
  return {
    family: 'globalMarker' as const,
    id: markerId,
    visibility,
  };
}
```

### 2. Add `'globalMarker'` case to `getPolicySurfaceVisibility` (`policy-surface.ts`)

```typescript
case 'globalMarker':
  return catalog.globalMarkers[ref.id] ?? null;
```

### 3. Add `'globalMarker'` case to `currentSurface.resolveSurface` (`policy-runtime.ts`)

In the switch statement (lines 180-262), add between `perPlayerVar` and `activeCardAnnotation`:

```typescript
case 'globalMarker': {
  const markerState = input.state.globalMarkers?.[ref.id];
  if (markerState !== undefined) return markerState;
  const lattice = input.def.globalMarkerLattices?.find(l => l.id === ref.id);
  return lattice?.defaultState;
}
```

Returns the string state value (e.g., `"shaded"`, `"unshaded"`, `"inactive"`).

### 4. Unit tests

Test parsing: `globalMarker.cap_boobyTraps` → `{ family: 'globalMarker', id: 'cap_boobyTraps' }`.
Test resolution: returns current state from `state.globalMarkers`, falls back to `defaultState`, returns undefined for unknown ID.

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/test/agents/policy-surface-global-marker.test.ts` (new)

## Out of Scope

- No observer/compiler changes (ticket 003-004)
- No cookbook documentation (ticket 005)
- No FITL game data changes

## Acceptance Criteria

### Tests That Must Pass

1. `globalMarker.cap_boobyTraps` parses to family `globalMarker`, id `cap_boobyTraps`
2. Empty marker ID (`globalMarker.`) returns undefined
3. Unknown marker ID (not in catalog) returns undefined
4. Runtime: returns `state.globalMarkers[id]` when set
5. Runtime: falls back to `lattice.defaultState` when marker not explicitly set in state
6. Runtime: returns undefined when marker ID not in `globalMarkerLattices`
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No new imports from kernel modules in `policy-surface.ts`
2. Resolution returns STRING values (marker state names), not numbers
3. All existing surface families continue to work identically

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-surface-global-marker.test.ts` — parsing and resolution tests

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/agents/policy-surface-global-marker.test.js`
2. `pnpm -F @ludoforge/engine test`
