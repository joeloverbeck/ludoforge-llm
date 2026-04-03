# 108PERSURHI-001: Replace whole-state requiresHiddenSampling with per-zone hiddenSamplingZones array

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel observation interface, agents preview pipeline
**Deps**: `archive/specs/105-explicit-preview-contracts.md`

## Problem

The `requiresHiddenSampling` flag on `PlayerObservation` is a whole-state boolean. If ANY zone has hidden tokens (e.g., FITL's deck with hidden order), the flag is `true` for the entire observation, blocking ALL preview surface access when `allowWhenHiddenSampling: false`. This prevents agents from accessing fully public surfaces like `victory.currentMargin` through the preview system, even though those surfaces don't depend on hidden information.

The fix replaces the boolean with a sorted array of zone IDs that have hidden tokens (`hiddenSamplingZones: readonly string[]`), enabling future per-surface zone-dependency checks while maintaining Phase 1 behavioral equivalence (any hidden zone still blocks).

## Assumption Reassessment (2026-04-02)

1. `PlayerObservation` is defined ONLY in `observation.ts:18-24` — NOT in `types-core.ts` — confirmed
2. `requiresHiddenSampling` appears in 7 production code locations across 2 files and 6 test assertions across 4 files — confirmed via blast radius analysis
3. `PreviewOutcome` union type in `policy-preview.ts:86-104` carries `requiresHiddenSampling: boolean` on `'ready'` (line 90) and `'stochastic'` (line 97) variants — confirmed
4. `derivePlayerObservation()` at `observation.ts:118` initializes `requiresHiddenSampling = false`, sets `true` at line 150 when `visibleTokens.length < tokens.length`, returns at line 159 — confirmed
5. `resolveSurface()` at `policy-preview.ts:146-148` checks `preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling` — confirmed
6. `PlayerObservation` is a runtime-only type, not in the GameDef schema (`schemas-core.ts`) — no schema migration needed — confirmed

## Architecture Check

1. Sorted `readonly string[]` preserves Foundation 8 (Determinism) — deterministic serialization and iteration order, unlike `Set` which has non-deterministic JSON serialization
2. Phase 1 maintains behavioral equivalence (`.length > 0` replaces the boolean check) — no game behavior changes, only data structure improvement
3. The change is engine-generic (Foundation 1) — zone IDs are domain identifiers, not game-specific
4. Foundation 14 (No Backwards Compatibility) — all consumers updated atomically in one ticket; no shims or fallbacks

## What to Change

### 1. Update PlayerObservation interface

In `packages/engine/src/kernel/observation.ts` (lines 18-24):

Replace:
```typescript
readonly requiresHiddenSampling: boolean;
```
With:
```typescript
readonly hiddenSamplingZones: readonly string[];
```

### 2. Update derivePlayerObservation() logic

In `packages/engine/src/kernel/observation.ts` (lines 109-161):

Replace the boolean flag pattern:
```typescript
let requiresHiddenSampling = false;
// ... in zone loop:
if (visibleTokens.length < tokens.length) {
  requiresHiddenSampling = true;
}
// ... return:
requiresHiddenSampling,
```

With a Set-collect-and-sort pattern:
```typescript
const hiddenZones = new Set<string>();
// ... in zone loop:
if (visibleTokens.length < tokens.length) {
  hiddenZones.add(zoneId);
}
// ... return:
hiddenSamplingZones: [...hiddenZones].sort(),
```

### 3. Update PreviewOutcome union type

In `packages/engine/src/agents/policy-preview.ts` (lines 86-104):

Replace `requiresHiddenSampling: boolean` with `readonly hiddenSamplingZones: readonly string[]` on both the `'ready'` variant (line 90) and the `'stochastic'` variant (line 97).

### 4. Update getPreviewOutcome() assignment

In `packages/engine/src/agents/policy-preview.ts` (line 278):

Replace:
```typescript
requiresHiddenSampling: observation.requiresHiddenSampling,
```
With:
```typescript
hiddenSamplingZones: observation.hiddenSamplingZones,
```

### 5. Update resolveSurface() check

In `packages/engine/src/agents/policy-preview.ts` (lines 146-148):

Replace:
```typescript
if (preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling) {
```
With:
```typescript
if (preview.hiddenSamplingZones.length > 0 && !visibility.preview.allowWhenHiddenSampling) {
```

### 6. Update test assertions

In all 4 test files, replace `requiresHiddenSampling` references with `hiddenSamplingZones`:

- `observation.test.ts:166` — change `obs.requiresHiddenSampling === false` to `deepStrictEqual(obs.hiddenSamplingZones, [])`
- `observation.test.ts:179` — change `obs.requiresHiddenSampling === true` to assert `obs.hiddenSamplingZones` contains the expected hidden zone ID(s)
- `observation-observer-profile.test.ts:240` — change `obs.requiresHiddenSampling === false` to `deepStrictEqual(obs.hiddenSamplingZones, [])`
- `policy-preview.test.ts:124` — change mock `requiresHiddenSampling: hidden` to `hiddenSamplingZones: hidden ? ['some-zone'] : []` (or equivalent)
- `fitl-policy-agent.test.ts:807` — change `observation.requiresHiddenSampling === true` to assert `observation.hiddenSamplingZones.length > 0`

## Files to Touch

- `packages/engine/src/kernel/observation.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/unit/kernel/observation.test.ts` (modify)
- `packages/engine/test/unit/kernel/observation-observer-profile.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)

## Out of Scope

- Per-surface zone-dependency mapping (Phase 2 — future spec)
- Changing `allowWhenHiddenSampling` config values in any game spec (that's DIAGFITL-003)
- Adding new preview-referencing considerations to agent profiles
- Modifying trace output format (the field rename flows through existing trace construction)
- Schema changes in `schemas-core.ts` (`PlayerObservation` is runtime-only)

## Acceptance Criteria

### Tests That Must Pass

1. `derivePlayerObservation()` returns `hiddenSamplingZones: []` when all zones are fully visible
2. `derivePlayerObservation()` returns `hiddenSamplingZones` containing the correct zone ID(s) when zones have hidden tokens; array is sorted
3. `resolveSurface()` returns `{ kind: 'unknown', reason: 'hidden' }` when `hiddenSamplingZones.length > 0` and `allowWhenHiddenSampling: false`
4. `resolveSurface()` allows access when `allowWhenHiddenSampling: true` regardless of `hiddenSamplingZones` content
5. FITL policy agent integration test passes with the updated field
6. Existing suite: `pnpm turbo test`

### Invariants

1. `hiddenSamplingZones` array is always sorted (deterministic order — Foundation 8)
2. Phase 1 behavioral equivalence: `.length > 0` check produces identical game outcomes as the prior `=== true` check
3. No `requiresHiddenSampling` references remain anywhere in the codebase after this ticket

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/observation.test.ts` — update 3 assertions from boolean to array checks
2. `packages/engine/test/unit/kernel/observation-observer-profile.test.ts` — update 1 assertion
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — update mock construction
4. `packages/engine/test/integration/fitl-policy-agent.test.ts` — update 1 assertion

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `grep -r 'requiresHiddenSampling' packages/engine/src/ packages/engine/test/` — must return 0 results

## Outcome

- Completed: 2026-04-02
- What changed:
  - Replaced `PlayerObservation.requiresHiddenSampling` with sorted `hiddenSamplingZones` in `packages/engine/src/kernel/observation.ts`
  - Updated preview readiness/stochastic handling in `packages/engine/src/agents/policy-preview.ts` to use `hiddenSamplingZones.length > 0`
  - Updated the owned unit and FITL integration tests to assert the new per-zone field
- Deviations from original plan:
  - Implemented `hiddenSamplingZones` as `readonly ZoneId[]` rather than `readonly string[]` to preserve Foundation 17 nominal identifier typing
  - No schema or generated artifact changes were needed because `PlayerObservation` is a runtime-only surface
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test "dist/test/unit/kernel/observation.test.js" "dist/test/unit/kernel/observation-observer-profile.test.js" "dist/test/unit/agents/policy-preview.test.js" "dist/test/integration/fitl-policy-agent.test.js"`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
