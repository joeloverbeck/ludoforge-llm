# VISCONF-005: Wire visual config into faction color provider and renderer contracts

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D7
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider), VISCONF-004 (render model visual wiring)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop consuming engine visual types)

---

## Summary

Remove remaining renderer-level dependencies on engine visual types by replacing `GameDefFactionColorProvider` with a `VisualConfigProvider`-backed implementation and by updating renderer contracts to use runner-owned token visual types.

---

## Assumption Reassessment (Current Code vs Ticket)

1. VISCONF-004 is already completed and render-model visuals are runner-owned.
- `RenderZone.visual` and zone labels already come from `VisualConfigProvider` in `derive-render-model.ts`.
- This ticket should not re-scope render-model derivation work.

2. `canvas-equality.ts` visual comparison simplification is already implemented.
- Current comparator already directly compares `shape`, `width`, `height`, `color`.
- No additional `canvas-equality.ts` logic change is required unless type fallout appears.

3. The old ticket overstated required renderer file edits.
- `zone-renderer.ts`, `canvas-updater.ts`, and most of `canvas-equality.ts` are not the architectural bottleneck.
- The actual bottleneck is `faction-colors.ts` + `renderer-types.ts` + `GameCanvas.tsx` still consuming engine visual/type fields.

4. Test target assumptions were stale.
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` does not validate engine visual type coupling and should not be mandatory for this ticket.
- `packages/runner/test/canvas/canvas-updater.test.ts` does not need direct behavior changes for this refactor unless type propagation requires fixture updates.

5. Current `GameCanvas` subscription model is coupled to GameDef presentation fields.
- `selectGameDefFactions` + `selectGameDefTokenTypes` subscriptions only exist to refresh `GameDefFactionColorProvider` caches.
- With `VisualConfigProvider`, these subscriptions are unnecessary and should be removed for cleaner architecture.

---

## Architecture Decision (Reassessed)

Adopt a single source of truth for runtime visuals at the renderer boundary: `VisualConfigProvider`.

Why this is better than current architecture:
- Eliminates dual-source presentation data (`GameDef` fields + visual config) at runtime.
- Makes renderer contracts fully runner-owned and aligned with Spec 42 goals.
- Reduces reactive complexity in `GameCanvas` by removing GameDef faction/token-type subscription churn.
- Unblocks VISCONF-008 by removing remaining engine visual type imports under `packages/runner/src/canvas/`.

No backwards compatibility layer, aliasing, or dual mode should be kept.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/canvas/renderers/faction-colors.ts` | Replace `GameDefFactionColorProvider` with `VisualConfigFactionColorProvider` backed by `VisualConfigProvider`. Remove engine imports (`FactionDef`, `TokenTypeDef`, `TokenVisualHints`). Keep deterministic fallback provider for standalone use. |
| `packages/runner/src/canvas/renderers/renderer-types.ts` | Change `FactionColorProvider.getTokenTypeVisual()` return type from engine `TokenVisualHints | null` to runner `ResolvedTokenVisual`. |
| `packages/runner/src/canvas/GameCanvas.tsx` | Instantiate `VisualConfigFactionColorProvider` from injected `VisualConfigProvider` dependency; remove `gameDef` faction/token-type subscription paths tied to engine presentation fields. |
| `packages/runner/src/ui/GameContainer.tsx` | Thread `VisualConfigProvider` dependency through to `GameCanvas` props. |
| `packages/runner/src/App.tsx` | Pass bootstrap `visualConfigProvider` into `GameContainer` to keep dependency injection explicit. |
| `packages/runner/src/canvas/renderers/token-renderer.ts` | Update token visual handling to consume non-null `ResolvedTokenVisual` from provider contract (remove null/optional branches where no longer needed). |

## Files to update (tests)

| File | Change |
|------|--------|
| `packages/runner/test/canvas/renderers/faction-colors.test.ts` | Rewrite around `VisualConfigFactionColorProvider` and deterministic fallback behavior. |
| `packages/runner/test/canvas/renderers/renderer-types.test.ts` | Update contract expectations to non-null `ResolvedTokenVisual` return type. |
| `packages/runner/test/canvas/renderers/token-renderer.test.ts` | Update mock provider contract and assertions to non-null token visuals. |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Update runtime assertions for provider wiring and removal of game-def faction/token-type subscription behavior. |

---

## Detailed requirements

### faction-colors.ts

- Remove engine visual/type imports from `@ludoforge/engine/runtime` except `PlayerId`.
- Introduce:

```typescript
class VisualConfigFactionColorProvider implements FactionColorProvider {
  constructor(private readonly provider: VisualConfigProvider) {}

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      return this.provider.getFactionColor(factionId);
    }
    return this.provider.getFactionColor(`player-${playerId}`);
  }

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    return this.provider.getTokenTypeVisual(tokenTypeId);
  }
}
```

- Keep deterministic fallback implementation available for isolated tests and default behavior validation.

### renderer-types.ts

- Replace engine `TokenVisualHints` import with runner `ResolvedTokenVisual`.
- Update interface:

```typescript
export interface FactionColorProvider {
  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual;
  getColor(factionId: string | null, playerId: PlayerId): string;
}
```

### GameCanvas.tsx

- Use injected `visualConfigProvider` dependency as renderer visual source.
- Remove `selectGameDefFactions`/`selectGameDefTokenTypes` selectors and related subscriptions.
- Ensure token renderer refresh behavior remains correct through existing canvas updater flow.

### App/GameContainer wiring

- Keep `VisualConfigProvider` as an explicit bootstrap dependency (App-level injection), not mutable store state.
- Thread provider via props: `App` -> `GameContainer` -> `GameCanvas`.
- Do not add compatibility aliases or fallback to GameDef presentation fields.

### token-renderer.ts

- Treat `getTokenTypeVisual` as always returning a resolved object.
- Remove null checks that only existed for nullable engine visual hints.

---

## Out of scope

- Render model derivation changes (VISCONF-004)
- Layout pipeline changes (VISCONF-006)
- Animation system changes (VISCONF-007)
- Engine type removals outside runner renderer boundary (VISCONF-008+)
- YAML loading / config file creation (VISCONF-002/003)

---

## Acceptance criteria

### Tests that must pass

1. `faction-colors.test.ts`
- `VisualConfigFactionColorProvider` returns configured faction color.
- Unknown faction ID returns deterministic fallback from default palette resolver.
- Null faction ID uses `player-${playerId}` deterministic fallback key path.
- `getTokenTypeVisual` returns provider-resolved defaults for unknown token type.

2. `token-renderer.test.ts`
- Renderer consumes non-null resolved token visuals from `FactionColorProvider`.
- Token type color still overrides faction color when present.

3. `GameCanvas.test.ts`
- Runtime constructs token renderer with visual-config-backed provider.
- No subscription path remains for `selectGameDefFactions`/`selectGameDefTokenTypes` behavior.

4. `renderer-types.test.ts`
- Contract typing reflects runner-owned `ResolvedTokenVisual` return type.

5. Runner verification:
- `pnpm -F @ludoforge/runner typecheck`
- `pnpm -F @ludoforge/runner test`
- `pnpm -F @ludoforge/runner lint`

### Invariants

- No file in `packages/runner/src/canvas/` imports `TokenVisualHints`, `FactionDef`, or `TokenTypeDef` from engine runtime.
- `FactionColorProvider` uses runner-owned visual types only.
- Renderer visual source is `VisualConfigProvider`, not GameDef presentation fields.
- No compatibility aliases for removed provider paths.

---

## Outcome

- **Completion date**: 2026-02-19
- **What was actually changed**:
  - Replaced `GameDefFactionColorProvider` with `VisualConfigFactionColorProvider` and removed engine presentation-type coupling from canvas renderer contracts.
  - Updated `FactionColorProvider` to return non-null runner-owned `ResolvedTokenVisual`.
  - Updated token renderer to consume resolved visuals directly (no nullable engine hint path).
  - Injected `VisualConfigProvider` through `App` -> `GameContainer` -> `GameCanvas` and removed GameDef faction/token-type subscription refresh logic from `GameCanvas`.
  - Updated renderer/runtime tests to match the new architecture boundary.
- **Deviations from original plan**:
  - Scoped out `zone-renderer.ts`, `canvas-equality.ts`, and `canvas-updater.ts` behavioral changes after reassessment showed no remaining engine visual coupling in those files.
  - Used explicit app-level dependency injection for `VisualConfigProvider` rather than storing provider state in the zustand store.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner test` ✅ (95 files, 738 tests)
