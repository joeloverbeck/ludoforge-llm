**Status**: ✅ COMPLETED

# 63COMZONIDCROREFVAL-006 — Thread `zoneIdSet` Through All `canonicalizeZoneSelector` Call Sites

## Summary

Update the two `lowerZoneSelector` wrapper functions (in `compile-conditions-shared.ts` and `compile-effects-utils.ts`) to pass `context.zoneIdSet` to `canonicalizeZoneSelector`. This is the ticket that activates the validation end-to-end.

## Prerequisites

- 63COMZONIDCROREFVAL-002 (interface fields exist on contexts)
- 63COMZONIDCROREFVAL-003 (`canonicalizeZoneSelector` accepts `zoneIdSet`)
- 63COMZONIDCROREFVAL-005 (contexts are populated with `zoneIdSet`)

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-conditions-shared.ts` | Pass `context.zoneIdSet` to `canonicalizeZoneSelector` in `lowerZoneSelector` |
| `packages/engine/src/cnl/compile-effects-utils.ts` | Pass `context.zoneIdSet` to `canonicalizeZoneSelector` in `lowerZoneSelector` |

## Implementation Details

### In `compile-conditions-shared.ts` (line ~129)

Current:
```typescript
const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds);
```

Change to:
```typescript
const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds, context.zoneIdSet);
```

### In `compile-effects-utils.ts` (line ~85)

Current:
```typescript
const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds);
```

Change to:
```typescript
const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds, context.zoneIdSet);
```

### Why only these two files

`canonicalizeZoneSelector` is called from exactly 3 locations in `packages/engine/src/cnl/`:
1. `compile-conditions-shared.ts:129` — via `lowerZoneSelector` (conditions)
2. `compile-effects-utils.ts:85` — via `lowerZoneSelector` (effects)
3. `compile-zones.ts:140` — the function definition itself (not a call site)

All downstream callers (`compile-conditions-conditions.ts`, `compile-conditions-values.ts`, `compile-effects-token.ts`, `compile-effects-flow.ts`, `compile-effects-var.ts`) go through one of the two `lowerZoneSelector` wrappers. No additional changes needed.

## Out of Scope

- Changes to `canonicalizeZoneSelector` itself (ticket 003).
- Changes to lowering context interfaces (ticket 002).
- Changes to `compiler-core.ts` (ticket 005).
- Test files — unit tests in ticket 007, integration tests in ticket 009.
- Zone definition cross-references (ticket 004).

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes.
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`) — production specs have correct zone IDs.
- Tests that construct minimal contexts without `zoneIdSet` still pass (field is optional, check is skipped when absent).

### Invariants
- Every `canonicalizeZoneSelector` call from `lowerZoneSelector` now passes the zone ID set.
- When `context.zoneIdSet` is `undefined` (minimal test contexts), the existence check is skipped.
- When `context.zoneIdSet` is populated and a static literal zone ID doesn't exist, compilation fails with `CNL_COMPILER_ZONE_ID_UNKNOWN`.
- Binding references (`$space`, `hand:$actor`) are never validated against the set.
- This is the ticket that activates the end-to-end validation for effects and conditions.

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `compile-conditions-shared.ts:130` — passed `context.zoneIdSet` to `canonicalizeZoneSelector` in condition-side `lowerZoneSelector`
  - `compile-effects-utils.ts:85` — passed `context.zoneIdSet` to `canonicalizeZoneSelector` in effect-side `lowerZoneSelector`
  - `compile-effects-utils.ts:makeConditionContext` — propagated `zoneIdSet` from `EffectLoweringContext` to `ConditionLoweringContext`
- **Deviations from plan**: The ticket did not mention `makeConditionContext`. Without propagation there, condition sub-expressions nested inside effects (e.g., `tokensInZone.zone` in a condition within a `forEach`) would silently skip zone ID validation because the bridged `ConditionLoweringContext` dropped `zoneIdSet`. Fixed as part of this ticket since it is in the same file and completes the end-to-end threading.
- **Verification**: `pnpm turbo typecheck` clean, `pnpm turbo build` clean, `pnpm turbo test` — 4775 tests pass, 0 failures.
