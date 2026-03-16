# 63COMZONIDCROREFVAL-005 — Wire `zoneIdSet` Into Compiler Core Lowering Contexts

## Summary

Build `zoneIdSet` from the materialized zones in `compiler-core.ts` and thread it into the `EffectLoweringSharedContext` and all ad-hoc lowering context construction sites (`lowerEndConditions`, `lowerVictory`).

## Prerequisites

- 63COMZONIDCROREFVAL-002 (interface fields exist)

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compiler-core.ts` | Build `zoneIdSet`; add to `loweringContext` and ad-hoc contexts |
| `packages/engine/src/cnl/compile-lowering.ts` | Add `zoneIdSet` param to `lowerEndConditions`; include in `sharedConditionContext` |

## Implementation Details

### In `compiler-core.ts`

After zone materialization (line ~396, `zones = zoneCompilation.value`), build the set:

```typescript
const zoneIdSet: ReadonlySet<string> | undefined =
  zones !== null && zones.length > 0 ? new Set(zones.map(z => z.id)) : undefined;
```

Add to the `loweringContext` construction (line ~469):

```typescript
const loweringContext: EffectLoweringSharedContext = {
  ownershipByBase,
  ...(zoneIdSet !== undefined ? { zoneIdSet } : {}),  // NEW
  // ... existing fields unchanged
};
```

Update the `lowerEndConditions` call (line ~558) to pass `zoneIdSet`:

```typescript
lowerEndConditions(
  rawTerminal.conditions,
  ownershipByBase,
  diagnostics,
  derivedFromAssets.tokenTraitVocabulary ?? undefined,
  tokenFilterProps,
  namedSets,
  typeInference,
  seatIds,
  zoneIdSet,  // NEW
),
```

Update the `lowerVictory` ad-hoc context (line ~570) to include `zoneIdSet`:

```typescript
lowerVictory(rawTerminal, diagnostics, {
  ownershipByBase,
  ...(zoneIdSet !== undefined ? { zoneIdSet } : {}),  // NEW
  // ... existing fields unchanged
}),
```

### In `compile-lowering.ts`

Update `lowerEndConditions` signature to accept `zoneIdSet`:

```typescript
export function lowerEndConditions(
  endConditions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>,
  tokenFilterProps?: readonly string[],
  namedSets?: CanonicalNamedSets,
  typeInference?: TypeInferenceContext,
  seatIds?: readonly string[],
  zoneIdSet?: ReadonlySet<string>,  // NEW
): readonly EndCondition[]
```

Add `zoneIdSet` to the `sharedConditionContext` construction inside `lowerEndConditions`:

```typescript
const sharedConditionContext: ConditionLoweringSharedContext = {
  ownershipByBase,
  ...(zoneIdSet !== undefined ? { zoneIdSet } : {}),  // NEW
  // ... existing fields unchanged
};
```

## Out of Scope

- Using `zoneIdSet` in `canonicalizeZoneSelector` calls (ticket 006).
- Changes to `canonicalizeZoneSelector` itself (ticket 003).
- Changes to `compile-conditions-shared.ts` or `compile-effects-types.ts` (ticket 002).
- Test files.

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes.
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`) — the field is populated but not yet consumed by `canonicalizeZoneSelector`.

### Invariants
- `zoneIdSet` is `undefined` when zones failed to compile (no false positives on broken specs).
- `zoneIdSet` is a `ReadonlySet<string>` containing every materialized zone ID when zones compile successfully.
- All lowering context construction sites in `compiler-core.ts` include `zoneIdSet`.
- `lowerEndConditions` and `lowerVictory` ad-hoc contexts also include `zoneIdSet`.
- No runtime behavior change yet — `canonicalizeZoneSelector` doesn't read the field until ticket 006.
