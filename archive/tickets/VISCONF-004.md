# VISCONF-004: Wire visual config into render model derivation

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D7
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop consuming engine visual types)

---

## Summary

Change `deriveRenderModel()` and the `RenderZone` type so zone visual data and labels come from `VisualConfigProvider` instead of `ZoneDef.visual` (engine type). The render model must carry runner-owned visual types only.

---

## Assumption Reassessment (Current Code vs Ticket)

1. `ResolvedZoneVisual` location assumption was incorrect.
- Previous assumption: import from `packages/runner/src/config/visual-config-types.ts`.
- Actual code: `ResolvedZoneVisual` is currently declared in `packages/runner/src/config/visual-config-provider.ts`.
- Ticket update: this ticket imports `ResolvedZoneVisual` from provider module (no type relocation in this ticket).

2. Derivation wiring path assumption was incomplete.
- Previous assumption: check `bridge/game-bridge.ts` for call site wiring.
- Actual code: `deriveRenderModel` is invoked in `packages/runner/src/store/game-store.ts` (`deriveStoreRenderModel`), and store is created by `App.tsx` from bootstrap config.
- Ticket update: scope explicitly includes store/bootstrap wiring, not bridge internals.

3. Test impact was underestimated.
- Previous assumption: only `derive-render-model-zones`, `render-model-types`, maybe `tooltip-payload`.
- Actual code: derive-render-model signature/context changes cascade to `derive-render-model-state`, `derive-render-model-structural-sharing`, and store/bootstrap tests if provider dependency injection is tightened.
- Ticket update: expand required test updates to all affected model/store call sites.

4. Zone label behavior source was missing.
- Current renderer uses `zone.visual?.label ?? zone.displayName`.
- Provider returns labels via `getZoneLabel(zoneId)`; resolved visual object does not carry `label`.
- Ticket update: `RenderZone.displayName` becomes the single resolved label source and renderer no longer reads label off visual object.

5. Metadata passthrough needed explicit cleanup.
- Current `deriveZoneMetadata()` still copies `zoneDef.visual` into metadata.
- Ticket update: remove visual metadata passthrough to avoid engine visual bleed-through.

---

## Architecture Decision (Reassessed)

Adopt explicit dependency injection of `VisualConfigProvider` through `RenderContext` (store-owned dependency), instead of adding a separate top-level positional argument to `deriveRenderModel`.

Rationale:
- Keeps function signature focused (`state`, `def`, `context`, `previousModel`) without widening positional parameter churn.
- Keeps derivation dependencies grouped in one context contract.
- Makes test setup straightforward and deterministic (`makeRenderContext` provides provider).
- Avoids hidden global lookups or game-id conditionals.

No compatibility layer or aliasing will be introduced.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/model/render-model.ts` | Replace `ZoneVisualHints` import with runner-owned `ResolvedZoneVisual` from provider module. Change `RenderZone.visual` to non-null `ResolvedZoneVisual`. |
| `packages/runner/src/model/derive-render-model.ts` | Consume `context.visualConfigProvider`. Use `resolveZoneVisual()` and `getZoneLabel()`. Remove `zoneDef.visual` usage and metadata passthrough. Replace `isZoneVisualEqual()` with explicit primitive field comparison for resolved visual shape. |
| `packages/runner/src/store/store-types.ts` | Add `visualConfigProvider: VisualConfigProvider` to `RenderContext`. |
| `packages/runner/src/store/game-store.ts` | Make store own provider dependency and pass it into render context/derivation. |
| `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` | Surface per-game visual config provider from bootstrap descriptor. |
| `packages/runner/src/bootstrap/bootstrap-registry.ts` | Register provider resolver for each bootstrap target using existing YAML loader exports. |
| `packages/runner/src/App.tsx` | Pass bootstrap visual provider into `createGameStore`. |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Stop using `zone.visual?.label`; use resolved `displayName` only. |

## Files to update (tests)

| File | Change |
|------|--------|
| `packages/runner/test/model/derive-render-model-zones.test.ts` | Use provider-backed context; update assertions for non-null resolved visuals and provider label behavior. |
| `packages/runner/test/model/derive-render-model-state.test.ts` | Update context fixture(s) to include provider dependency. |
| `packages/runner/test/model/derive-render-model-structural-sharing.test.ts` | Update context fixture(s) to include provider dependency. |
| `packages/runner/test/model/render-model-types.test.ts` | Update `RenderZone.visual` type expectations to concrete `ResolvedZoneVisual`. |
| `packages/runner/test/model/tooltip-payload.test.ts` | Update fixture shape if required by non-null visual field. |
| `packages/runner/test/store/game-store*.test.ts` | Update `createGameStore` construction for provider dependency. |
| `packages/runner/test/bootstrap/*.test.ts` | Add/adjust assertions for visual provider resolution path where needed. |

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
import type { ResolvedZoneVisual } from '../config/visual-config-provider.js';
// ...
readonly visual: ResolvedZoneVisual;
```

Invariant: `RenderZone.visual` is always concrete (`null`/`undefined` disallowed).

### derive-render-model.ts changes

1. Use provider from context:
   ```typescript
   context.visualConfigProvider.resolveZoneVisual(zoneId, zoneDef.category ?? null, zoneDef.attributes ?? {})
   ```

2. Resolve display name via provider label first:
   ```typescript
   context.visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId)
   ```

3. Remove all `zoneDef.visual` reads from zone projection.

4. Remove `isZoneVisualEqual()` helper. Replace its use with direct primitive comparison for:
- `shape`
- `width`
- `height`
- `color`

5. Remove `zoneDef.visual` passthrough from `deriveZoneMetadata()`.

### Store/bootstrap wiring

1. `createGameStore` receives a `VisualConfigProvider` dependency and persists it.
2. `RenderContext` always contains that provider.
3. Bootstrap registry/config resolves provider per selected bootstrap target.
4. `App` passes bootstrap provider to store construction.

---

## Out of scope

- Faction color provider changes (VISCONF-005)
- Layout pipeline changes (VISCONF-006)
- Animation system changes (VISCONF-007)
- Engine type removals (VISCONF-008)
- Creating or loading YAML files (VISCONF-002, VISCONF-003)

---

## Acceptance criteria

### Tests that must pass

1. `derive-render-model-zones.test.ts`:
- default provider yields `{ shape: 'rectangle', width: 160, height: 100, color: null }`
- configured provider overrides zone visual
- display name uses provider label override when present
- stabilization detects changed resolved visual
- stabilization preserves references when resolved visual unchanged

2. `derive-render-model-state.test.ts` and `derive-render-model-structural-sharing.test.ts` continue to pass with provider-aware context.

3. Store/bootstrap tests pass with provider injection.

4. Full runner suite passes:
- `pnpm -F @ludoforge/runner typecheck`
- `pnpm -F @ludoforge/runner test`

### Invariants

- `RenderZone.visual` is never `null`/`undefined`
- `derive-render-model.ts` does not import/use `ZoneVisualHints`
- `render-model.ts` does not import engine visual types
- zone label rendering source is `RenderZone.displayName`, not `visual.label`
- zone metadata does not include engine `visual` payload

---

## Outcome

- **Completion date**: 2026-02-19
- **What was actually changed**:
  - Wired zone visual + label resolution through `VisualConfigProvider` in render-model derivation.
  - Converted `RenderZone.visual` to non-null runner-owned resolved visual shape.
  - Injected provider through `RenderContext`, `createGameStore`, bootstrap config/registry, and app bootstrap path.
  - Removed `zoneDef.visual` metadata passthrough and `visual.label` renderer dependency.
  - Updated impacted model/store/bootstrap/canvas/UI tests for new invariants.
- **Deviations from original plan**:
  - Provider dependency was injected through `RenderContext` rather than adding a new positional `deriveRenderModel` argument; this kept derivation dependencies cohesive and reduced API churn.
  - Bootstrap wiring was implemented via `bootstrap-registry` + `resolve-bootstrap-config` instead of `game-bridge` changes.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test` ✅ (95 files, 742 tests)
  - `pnpm -F @ludoforge/runner lint` ✅
