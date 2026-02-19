# VISCONF-004: Wire visual config into render model derivation

**Spec**: 42 (Per-Game Visual Config), D7
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop consuming engine visual types)

---

## Summary

Change `deriveRenderModel()` and the `RenderZone` type so that zone visual data comes from `VisualConfigProvider` instead of from `ZoneDef.visual` (engine type). The render model should carry runner-owned visual types, not engine visual types.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/model/render-model.ts` | Replace `ZoneVisualHints` import with runner-owned `ResolvedZoneVisual` type from VISCONF-001. Change `RenderZone.visual` field type. |
| `packages/runner/src/model/derive-render-model.ts` | Accept `VisualConfigProvider` parameter. Use `provider.resolveZoneVisual()` instead of `zoneDef.visual`. Use `provider.getZoneLabel()` for display names when available. Remove `isZoneVisualEqual()` function (replace with structural compare of `ResolvedZoneVisual`). |

## Files to update (test)

| File | Change |
|------|--------|
| `packages/runner/test/model/derive-render-model-zones.test.ts` | Update zone fixtures: pass `VisualConfigProvider` (null config for defaults), update assertions on `RenderZone.visual` shape. |
| `packages/runner/test/model/render-model-types.test.ts` | Update any type assertion tests for `RenderZone.visual`. |
| `packages/runner/test/model/tooltip-payload.test.ts` | Update if it references `RenderZone.visual`. |

---

## Detailed requirements

### render-model.ts changes

Replace:
```typescript
import type { ZoneVisualHints } from '@ludoforge/engine/runtime';
// ...
readonly visual: ZoneVisualHints | null;
```

With:
```typescript
import type { ResolvedZoneVisual } from '../config/visual-config-types.js';
// ...
readonly visual: ResolvedZoneVisual;
```

Note: The field is no longer nullable — the provider always returns concrete defaults.

### derive-render-model.ts changes

1. Add `VisualConfigProvider` as a parameter to `deriveRenderModel()`. The function signature becomes:
   ```typescript
   export function deriveRenderModel(
     def: GameDef,
     state: GameState,
     viewingPlayer: PlayerId,
     provider: VisualConfigProvider,
     // ...existing params...
   ): RenderModel
   ```

2. In the zone derivation loop, replace `zoneDef.visual ?? null` with:
   ```typescript
   provider.resolveZoneVisual(zoneDef.id, zoneDef.category ?? null, zoneDef.attributes ?? {})
   ```

3. For zone display names, check `provider.getZoneLabel(zoneDef.id)` first, then fall back to `formatIdAsDisplayName(zoneDef.id)`.

4. Remove the `isZoneVisualEqual()` helper function. Replace its usage in the stability comparison with a field-by-field check on `ResolvedZoneVisual` (shape, width, height, color — all primitives).

5. Remove the `zoneDef.visual` passthrough to `metadata` in `deriveZoneMetadata()`.

### Callers of deriveRenderModel

`deriveRenderModel` is called from the store (game bridge). That wiring is updated in VISCONF-004 as well — add the provider to the store or pass it through. The simplest approach: the store holds a `VisualConfigProvider` instance alongside the `GameDef`. Update the store's `deriveRenderModel` call site to pass it.

Check `packages/runner/src/bridge/game-bridge.ts` or equivalent for the call site and add the provider parameter.

---

## Out of scope

- Faction color provider changes (VISCONF-005)
- Layout pipeline changes (VISCONF-006)
- Animation system changes (VISCONF-007)
- Engine type removals (VISCONF-008)
- Creating or loading YAML files (VISCONF-002, 003)

---

## Acceptance criteria

### Tests that must pass

**derive-render-model-zones.test.ts** (updated):
1. Zone with null config provider gets default visual: `{ shape: 'rectangle', width: 160, height: 100, color: null }`
2. Zone with provider backed by config gets resolved visual (categoryStyle applied)
3. Zone display name uses provider label when available, falls back to `formatIdAsDisplayName`
4. Stability comparison correctly detects visual changes (different shape = not equal)
5. Stability comparison correctly detects no change (same resolved visual = equal)

**All existing runner tests** must continue to pass (updated to use null-config provider where needed).

### Invariants

- `RenderZone.visual` is never `null` or `undefined` — always a concrete `ResolvedZoneVisual`
- `deriveRenderModel` does NOT import `ZoneVisualHints` from engine
- `render-model.ts` does NOT import from `@ludoforge/engine`'s visual types
- `pnpm -F @ludoforge/runner typecheck` passes
- `pnpm -F @ludoforge/runner test` passes
