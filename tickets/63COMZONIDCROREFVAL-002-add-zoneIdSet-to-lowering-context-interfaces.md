# 63COMZONIDCROREFVAL-002 — Add `zoneIdSet` to Lowering Context Interfaces

## Summary

Add an optional `zoneIdSet?: ReadonlySet<string>` field to both `ConditionLoweringContext` and `EffectLoweringContext` interfaces. This threads the materialized zone ID set into the lowering pipeline without changing any behavior yet.

## Motivation

The lowering contexts currently carry `ownershipByBase` (zone bases) but not the full materialized zone ID set. Downstream validation (tickets 003, 006) needs this set to check that static zone ID literals actually exist.

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-conditions-shared.ts` | Add `readonly zoneIdSet?: ReadonlySet<string>` to `ConditionLoweringContext` |
| `packages/engine/src/cnl/compile-effects-types.ts` | Add `readonly zoneIdSet?: ReadonlySet<string>` to `EffectLoweringContext` |

## Implementation Details

In `compile-conditions-shared.ts`, add to `ConditionLoweringContext`:
```typescript
readonly zoneIdSet?: ReadonlySet<string>;
```

In `compile-effects-types.ts`, add to `EffectLoweringContext`:
```typescript
readonly zoneIdSet?: ReadonlySet<string>;
```

The field is optional so that existing tests and internal callers that construct a minimal context without zones continue to compile without changes. When absent, the existence check (ticket 003) is skipped — graceful degradation to current behavior.

### Downstream type propagation

`EffectLoweringSharedContext` is defined as `Omit<EffectLoweringContext, 'bindingScope'>` in `compile-lowering.ts`. Since `zoneIdSet` is not `bindingScope`, it will automatically flow through — no change needed there.

`ConditionLoweringSharedContext` is defined as `Pick<EffectLoweringSharedContext, 'ownershipByBase' | ...>` in `compile-lowering.ts`. This Pick does NOT include `zoneIdSet`, so it must be updated to include it. Add `'zoneIdSet'` to the Pick union.

## Out of Scope

- Populating the field with actual data (ticket 005).
- Using the field in `canonicalizeZoneSelector` (ticket 003).
- Modifying any callers to pass `zoneIdSet` (tickets 005, 006).
- Changes to `compile-zones.ts`, `compiler-core.ts`, or any test files.

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes — the new field is optional, so all existing context construction remains valid.
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`).

### Invariants
- `ConditionLoweringContext.zoneIdSet` is optional and readonly.
- `EffectLoweringContext.zoneIdSet` is optional and readonly.
- `ConditionLoweringSharedContext` Pick union includes `'zoneIdSet'`.
- No existing fields are renamed or removed.
- No runtime behavior changes.
