# Spec 108: Per-Surface Hidden Sampling

**Status**: Draft
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
| **8. Determinism** | No change to deterministic behavior |
| **11. Immutability** | New state returned, not mutated |
| **14. No Backwards Compatibility** | `requiresHiddenSampling: boolean` replaced atomically; all consumers updated |
| **15. Architectural Completeness** | Fixes root cause (whole-state flag) instead of papering over with config workaround |

## Design

### Part 1: Per-Zone Hidden Sampling in PlayerObservation

Replace the single boolean with a per-zone map:

**`packages/engine/src/kernel/observation.ts`**:
- Change `PlayerObservation.requiresHiddenSampling: boolean` to `hiddenSamplingZones: ReadonlySet<string>` (set of zone IDs where the observer cannot see all tokens)
- In `derivePlayerObservation()`, instead of setting a single flag, collect the zone IDs where `visibleTokens.length < tokens.length` into the set

**`packages/engine/src/kernel/types-core.ts`** (if `PlayerObservation` is also declared here):
- Update the interface to match

### Part 2: Per-Ref Hidden Sampling Check in resolveSurface()

**`packages/engine/src/agents/policy-preview.ts`**:
- In `resolveSurface()`, replace the check at line 146 with:
  ```
  if (hiddenSamplingZones.size > 0 && !visibility.preview.allowWhenHiddenSampling) {
    // Check if the surface ref's zones intersect with hidden zones
    // For now: if ANY zone is hidden, the check fires (same as current behavior)
    // Future: surface→zone dependency mapping would allow targeted checks
    return { kind: 'unknown', reason: 'hidden' };
  }
  ```
- **Phase 1 (this spec)**: The behavior remains the same as today (any hidden zone blocks), but the infrastructure is in place for per-surface refinement
- **Phase 2 (future)**: When surface→zone dependency declarations exist, `resolveSurface()` can check only the relevant zones

### Part 3: Consumer Migration

All consumers of `requiresHiddenSampling` must be updated:
- `policy-preview.ts` — primary consumer (Part 2)
- Any test that asserts on `requiresHiddenSampling` — update to use `hiddenSamplingZones`
- Trace types if they expose the field

## Testing

1. **Unit test**: `derivePlayerObservation()` returns correct `hiddenSamplingZones` — zone with hidden tokens is in the set, zone with all-visible tokens is not
2. **Unit test**: `resolveSurface()` still returns `hidden` when hidden zones exist and `allowWhenHiddenSampling: false`
3. **Unit test**: `resolveSurface()` allows access when `allowWhenHiddenSampling: true` regardless of hidden zones
4. **Integration test**: FITL seed 1000 with `allowWhenHiddenSampling: true` — preview surfaces resolve successfully
5. **Determinism test**: Same seed produces identical results before and after refactor

## Migration Checklist

- [ ] Replace `requiresHiddenSampling: boolean` with `hiddenSamplingZones: ReadonlySet<string>` on `PlayerObservation`
- [ ] Update `derivePlayerObservation()` to build the zone set
- [ ] Update `resolveSurface()` to use `hiddenSamplingZones.size > 0` check
- [ ] Update all test assertions referencing `requiresHiddenSampling`
- [ ] Update trace types if they expose the field
- [ ] Verify `schemas-core.ts` / `policy-contract.ts` if applicable
- [ ] Run full test suite: `pnpm turbo test`
- [ ] Run typecheck: `pnpm turbo typecheck`
