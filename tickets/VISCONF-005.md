# VISCONF-005: Wire visual config into faction color provider and renderers

**Spec**: 42 (Per-Game Visual Config), D7
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop consuming engine visual types)

---

## Summary

Rewrite `GameDefFactionColorProvider` to read faction colors and token visuals from `VisualConfigProvider` instead of from `FactionDef.color` and `TokenTypeDef.visual` (engine types). Update the `FactionColorProvider` interface and all renderer call sites.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/canvas/renderers/faction-colors.ts` | Replace `GameDefFactionColorProvider` with `VisualConfigFactionColorProvider` backed by `VisualConfigProvider`. Remove engine type imports (`FactionDef`, `TokenTypeDef`, `TokenVisualHints`). |
| `packages/runner/src/canvas/renderers/renderer-types.ts` | Change `FactionColorProvider.getTokenTypeVisual()` return type from `TokenVisualHints` (engine) to `ResolvedTokenVisual` (runner config type). Remove engine `TokenVisualHints` import. |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Update any usage of `FactionColorProvider` or visual hint types to use runner types. |
| `packages/runner/src/canvas/renderers/token-renderer.ts` | Update token visual lookup to use `ResolvedTokenVisual` instead of `TokenVisualHints`. |
| `packages/runner/src/canvas/canvas-equality.ts` | Update zone/token visual equality checks if they reference engine visual types. |
| `packages/runner/src/canvas/canvas-updater.ts` | Update if it passes engine visual types to renderers. |

## Files to update (test)

| File | Change |
|------|--------|
| `packages/runner/test/canvas/renderers/faction-colors.test.ts` | Rewrite tests for `VisualConfigFactionColorProvider`. |
| `packages/runner/test/canvas/renderers/token-renderer.test.ts` | Update visual type expectations. |
| `packages/runner/test/canvas/renderers/zone-renderer.test.ts` | Update visual type expectations. |
| `packages/runner/test/canvas/canvas-equality.test.ts` | Update visual comparison assertions. |
| `packages/runner/test/canvas/canvas-updater.test.ts` | Update if visual types changed. |

---

## Detailed requirements

### faction-colors.ts changes

**Remove**:
- Import of `FactionDef`, `TokenTypeDef`, `TokenVisualHints` from `@ludoforge/engine/runtime`
- `GameDefFactionColorProvider` class (reads `FactionDef.color` and `TokenTypeDef.visual`)

**Keep**:
- `DefaultFactionColorProvider` class (hash-based fallback) — but it should now delegate to `VisualConfigProvider` defaults
- `FactionColorProvider` interface (updated)

**Add**:
- `VisualConfigFactionColorProvider` class:
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

### renderer-types.ts changes

Change:
```typescript
import type { TokenVisualHints } from '@ludoforge/engine/runtime';
```
to:
```typescript
import type { ResolvedTokenVisual } from '../config/visual-config-types.js';
```

Update `FactionColorProvider` interface:
```typescript
export interface FactionColorProvider {
  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual;
  getColor(factionId: string | null, playerId: PlayerId): string;
}
```

### canvas-equality.ts changes

The `zonesVisuallyEqualItem` function compares `RenderZone.visual`. After VISCONF-004, `visual` is `ResolvedZoneVisual` (always non-null, with primitive fields). The equality check simplifies to comparing `shape`, `width`, `height`, `color` directly instead of the current generic object key comparison.

---

## Out of scope

- Render model changes (VISCONF-004)
- Layout pipeline changes (VISCONF-006)
- Animation system changes (VISCONF-007)
- Engine type removals (VISCONF-008)
- Loading YAML files or creating visual configs

---

## Acceptance criteria

### Tests that must pass

**faction-colors.test.ts** (rewritten):
1. `VisualConfigFactionColorProvider` with config — returns config color for known faction
2. `VisualConfigFactionColorProvider` with config — returns hash-based color for unknown faction
3. `VisualConfigFactionColorProvider` with null config — returns hash-based colors for all factions
4. `getTokenTypeVisual` returns config-backed visual for known token type
5. `getTokenTypeVisual` returns defaults for unknown token type
6. Null factionId falls back to playerId-based color

**canvas-equality.test.ts** (updated):
1. Zones with same `ResolvedZoneVisual` are visually equal
2. Zones with different shape are not visually equal
3. Zones with different color are not visually equal

**token-renderer.test.ts** (updated):
1. Token renderer receives `ResolvedTokenVisual` from provider (not engine `TokenVisualHints`)

### Invariants

- No file in `packages/runner/src/canvas/` imports `TokenVisualHints`, `ZoneVisualHints`, `FactionDef`, or `TokenTypeDef` from `@ludoforge/engine`
- `FactionColorProvider` interface uses only runner-owned types
- `DefaultFactionColorProvider` still works as a standalone fallback (no config needed)
- `pnpm -F @ludoforge/runner typecheck` passes
- `pnpm -F @ludoforge/runner test` passes
