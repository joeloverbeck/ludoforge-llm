# Spec 108: Per-Surface Hidden Sampling

**Status**: COMPLETED
**Priority**: P2
**Complexity**: M
**Dependencies**: `archive/specs/105-explicit-preview-contracts.md`
**Blocks**: None
**Estimated effort**: 2–4 days

## Problem Statement

The `requiresHiddenSampling` flag on `PlayerObservation` is a whole-state boolean. It is set to `true` if **any** zone in the game state contains tokens not fully visible to the observer (`observation.ts:149-151`). In FITL, the deck zone has hidden token order, so `requiresHiddenSampling` is always `true` for every player.

The preview surface resolution check in `policy-preview.ts:146-148` uses this flag:
```typescript
if (preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling) {
  return { kind: 'unknown', reason: 'hidden' };
}
```

This blocks **all** preview surface access — including fully public surfaces like `victory.currentMargin` — whenever any zone has hidden tokens. The only workaround is setting `allowWhenHiddenSampling: true` in the game spec's observability config, which is semantically misleading: it doesn't mean "allow sampling of hidden data" — it means "this surface doesn't depend on hidden data, proceed anyway."

The correct fix is to make the hidden-sampling check **per-surface** (or per-zone) so that public surfaces remain accessible regardless of hidden zones elsewhere in the state.

## Goals

- Replace the whole-state `requiresHiddenSampling: boolean` with per-zone or per-surface hidden-sampling metadata
- Allow `resolveSurface()` to check only the zones/surfaces relevant to each preview ref, not the entire game state
- Remove the need for game specs to use `allowWhenHiddenSampling: true` as a workaround for public surfaces
- Preserve the current behavior for surfaces that genuinely depend on hidden information

## Non-Goals

- Implementing per-surface dependency tracking (knowing which zones a surface computation reads from). This spec uses per-zone granularity; a future spec could add surface→zone dependency declarations.
- Changing how `derivePlayerObservation()` determines visibility (the per-zone token visibility logic is correct)
- Removing `allowWhenHiddenSampling` from the observability config schema (it remains useful for opt-in on genuinely hidden-dependent surfaces)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | No game-specific logic — per-zone hidden-sampling is generic |
| **4. Authoritative State and Observer Views** | Strengthens observer model by making hidden-info granular |
| **8. Determinism** | `hiddenSamplingZones` uses a sorted `readonly string[]` (not `Set`) for deterministic serialization and iteration order |
| **11. Immutability** | New state returned, not mutated |
| **14. No Backwards Compatibility** | `requiresHiddenSampling: boolean` replaced atomically; all consumers updated |
| **15. Architectural Completeness** | Fixes root cause (whole-state flag) instead of papering over with config workaround |

## Design

### Part 1: Per-Zone Hidden Sampling in PlayerObservation

Replace the single boolean with a sorted zone-ID array:

**`packages/engine/src/kernel/observation.ts`** (`PlayerObservation` is defined here at lines 18-24 — it is NOT in `types-core.ts`):
- Change `PlayerObservation.requiresHiddenSampling: boolean` to `readonly hiddenSamplingZones: readonly string[]` (sorted array of zone IDs where the observer cannot see all tokens)
- In `derivePlayerObservation()` (lines 109-161), instead of setting a single boolean flag, collect zone IDs where `visibleTokens.length < tokens.length` into a `Set<string>`, then convert to a sorted array (`[...set].sort()`) before returning

### Part 2: Per-Ref Hidden Sampling Check in resolveSurface() and PreviewOutcome

**`packages/engine/src/agents/policy-preview.ts`**:

1. **Update `PreviewOutcome` union type** (lines 86-104): Replace `requiresHiddenSampling: boolean` with `readonly hiddenSamplingZones: readonly string[]` on both the `'ready'` (line 90) and `'stochastic'` (line 97) variants.

2. **Update `getPreviewOutcome()`** (line 278): Change the assignment from `requiresHiddenSampling: observation.requiresHiddenSampling` to `hiddenSamplingZones: observation.hiddenSamplingZones`.

3. **Update `resolveSurface()`** (line 146): Replace the check with:
   ```
   if (preview.hiddenSamplingZones.length > 0 && !visibility.preview.allowWhenHiddenSampling) {
     // Check if the surface ref's zones intersect with hidden zones
     // For now: if ANY zone is hidden, the check fires (same as current behavior)
     // Future: surface→zone dependency mapping would allow targeted checks
     return { kind: 'unknown', reason: 'hidden' };
   }
   ```

**Phase 1 (this spec)**: The behavior remains the same as today (any hidden zone blocks), but the infrastructure is in place for per-surface refinement. Phase 1 is a structural refactor only. The FITL preview regression is unblocked by DIAGFITL-003 (`allowWhenHiddenSampling: true` config workaround). Phase 2 (per-surface zone dependency) would make the workaround unnecessary.

**Phase 2 (future)**: When surface→zone dependency declarations exist, `resolveSurface()` can check only the relevant zones.

### Part 3: Blast Radius and Consumer Migration

**Production code** (2 files, 7 locations):
- `packages/engine/src/kernel/observation.ts` — interface definition (line 23), variable init (line 118), set-true logic (line 150), return (line 159)
- `packages/engine/src/agents/policy-preview.ts` — `PreviewOutcome` type (lines 90, 97), hidden-sampling check (line 146), assignment from observation (line 278)

**Test files** (4 files, 6 assertions):
- `packages/engine/test/unit/kernel/observation.test.ts` — assertions at lines 157, 166, 179
- `packages/engine/test/unit/kernel/observation-observer-profile.test.ts` — assertion at line 240
- `packages/engine/test/unit/agents/policy-preview.test.ts` — mock construction at line 124
- `packages/engine/test/integration/fitl-policy-agent.test.ts` — assertion at line 807

All consumers must be updated from `requiresHiddenSampling: boolean` to `hiddenSamplingZones: readonly string[]`.

## Testing

1. **Unit test** (`observation.test.ts`): `derivePlayerObservation()` returns correct `hiddenSamplingZones` — zone with hidden tokens is in the array, zone with all-visible tokens is not; array is sorted
2. **Unit test** (`policy-preview.test.ts`): `resolveSurface()` still returns `hidden` when `hiddenSamplingZones.length > 0` and `allowWhenHiddenSampling: false`
3. **Unit test** (`policy-preview.test.ts`): `resolveSurface()` allows access when `allowWhenHiddenSampling: true` regardless of hidden zones
4. **Unit test** (`observation-observer-profile.test.ts`): Update assertion from `requiresHiddenSampling === false` to `hiddenSamplingZones` being empty array
5. **Integration test** (`fitl-policy-agent.test.ts`): Update assertion from `requiresHiddenSampling === true` to `hiddenSamplingZones` containing the expected zone(s)
6. **Determinism test**: Same seed produces identical results before and after refactor

## Migration Checklist

- [ ] Replace `requiresHiddenSampling: boolean` with `readonly hiddenSamplingZones: readonly string[]` on `PlayerObservation` (`observation.ts:23`)
- [ ] Update `derivePlayerObservation()` to collect zone IDs into a Set, convert to sorted array (`observation.ts:109-161`)
- [ ] Update `PreviewOutcome` union type variants (`policy-preview.ts:90, 97`) from boolean to sorted array
- [ ] Update `getPreviewOutcome()` assignment (`policy-preview.ts:278`)
- [ ] Update `resolveSurface()` to use `hiddenSamplingZones.length > 0` check (`policy-preview.ts:146`)
- [ ] Update `observation.test.ts` assertions (lines 157, 166, 179)
- [ ] Update `observation-observer-profile.test.ts` assertion (line 240)
- [ ] Update `policy-preview.test.ts` mock construction (line 124)
- [ ] Update `fitl-policy-agent.test.ts` assertion (line 807)
- [ ] Verify `schemas-core.ts` — `PlayerObservation` is not in the schema (runtime-only type), so no schema change needed
- [ ] Run full test suite: `pnpm turbo test`
- [ ] Run typecheck: `pnpm turbo typecheck`

## Tickets

- `108PERSURHI-001` — Replace whole-state requiresHiddenSampling with per-zone hiddenSamplingZones array

## Outcome

- Completed: 2026-04-02
- What changed:
  - Replaced the whole-state `requiresHiddenSampling` flag with per-zone `hiddenSamplingZones` in the runtime observation surface
  - Updated the preview pipeline to carry the per-zone field and preserve Phase 1 `.length > 0` blocking behavior
  - Updated the owned unit and FITL integration tests to assert the new field
- Deviations from original plan:
  - Implemented `hiddenSamplingZones` as `readonly ZoneId[]` rather than `readonly string[]` to preserve Foundation 17 nominal identifier typing
  - This remained a runtime-only change; no schema artifact update was required
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test "dist/test/unit/kernel/observation.test.js" "dist/test/unit/kernel/observation-observer-profile.test.js" "dist/test/unit/agents/policy-preview.test.js" "dist/test/integration/fitl-policy-agent.test.js"`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
