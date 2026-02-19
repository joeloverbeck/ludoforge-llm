# VISCONF-006: Wire visual config into layout pipeline (layoutMode, layoutRole)

**Spec**: 42 (Per-Game Visual Config), D8
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop reading `layoutMode`/`layoutRole` from GameDef)

---

## Summary

Change the layout pipeline to resolve `layoutMode` and `layoutRole` from `VisualConfigProvider` instead of from `GameDef.metadata.layoutMode` and `ZoneDef.layoutRole`. Update the layout cache key to incorporate visual config identity.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/layout/build-layout-graph.ts` | Change `resolveLayoutMode()` to accept `VisualConfigProvider` instead of reading `GameDef.metadata.layoutMode`. Remove `zone.visual` from graph node attributes. |
| `packages/runner/src/layout/aux-zone-layout.ts` | Change `classifyAuxZone()` to accept `VisualConfigProvider` and call `provider.getLayoutRole(zone.id)` instead of reading `zone.layoutRole`. Keep the heuristic fallback for zones with no config. |
| `packages/runner/src/layout/layout-cache.ts` | Include visual config identity in the cache key. The cache must invalidate when the visual config changes. |

## Files to update (test)

| File | Change |
|------|--------|
| `packages/runner/test/layout/build-layout-graph.test.ts` | Update `resolveLayoutMode` tests: pass provider instead of GameDef with `layoutMode`. |
| `packages/runner/test/layout/aux-zone-layout.test.ts` | Update `classifyAuxZone` tests: pass provider instead of zones with `layoutRole`. |
| `packages/runner/test/layout/layout-cache.test.ts` | Verify cache invalidates when visual config changes. |

---

## Detailed requirements

### build-layout-graph.ts changes

**Current** `resolveLayoutMode(def: GameDef)`:
- Reads `def.metadata?.layoutMode`
- Falls back to adjacency-based heuristic

**New** `resolveLayoutMode(def: GameDef, provider: VisualConfigProvider)`:
- Calls `provider.getLayoutMode(hasAdjacency)` where `hasAdjacency = def.zones.some(z => z.adjacentTo?.length)`
- The provider checks config first, falls back to the same adjacency heuristic

Remove `zone.visual` from graph node attributes in `buildLayoutGraph()`. The layout graph should only store `category`, `attributes` (for attribute-aware seeding), not visual presentation data.

### aux-zone-layout.ts changes

**Current** `classifyAuxZone(zone: ZoneDef)`:
- Reads `zone.layoutRole` (primary)
- Falls back to heuristics (`isCardZone`, `isHandZone`)

**New** `classifyAuxZone(zone: ZoneDef, provider: VisualConfigProvider)`:
- Calls `provider.getLayoutRole(zone.id)` (primary)
- Falls back to same heuristics if provider returns `null`

The heuristic functions (`isCardZone`, `isHandZone`) stay unchanged — they use `zone.ordering`, `zone.owner`, `zone.visibility`, `zone.adjacentTo` which are NOT being removed from the engine.

### layout-cache.ts changes

**Current** cache key: `${def.metadata.id}:${fnv1aHash(stableSerialize(def))}`

**New** cache key must also incorporate visual config identity. Options:
1. Hash the visual config and append to key: `${def.metadata.id}:${defHash}:${configHash}`
2. Or pass `VisualConfigProvider` which exposes a `configHash` getter

The simplest approach: `VisualConfigProvider` exposes a `readonly configHash: string` property (computed once in constructor from `JSON.stringify(config)` FNV-1a hash, or `'null'` for no config). Include this in the layout cache key.

**Add** `configHash` to `VisualConfigProvider` in this ticket (small addition to the VISCONF-001 class).

---

## Out of scope

- Render model changes (VISCONF-004)
- Faction color / renderer changes (VISCONF-005)
- Animation system changes (VISCONF-007)
- Engine type removals (VISCONF-008)
- Removing `layoutRole` from `ZoneDef` (engine change — VISCONF-008)
- Removing `layoutMode` from `GameDef.metadata` (engine change — VISCONF-008)

---

## Acceptance criteria

### Tests that must pass

**build-layout-graph.test.ts** (updated):
1. `resolveLayoutMode` with provider having config `mode: 'table'` returns `'table'`
2. `resolveLayoutMode` with null-config provider and zones with adjacency returns `'graph'`
3. `resolveLayoutMode` with null-config provider and zones without adjacency returns `'table'`
4. `buildLayoutGraph` does NOT store `visual` in graph node attributes

**aux-zone-layout.test.ts** (updated):
1. Zone with config layoutRole `'card'` classifies as `'cards'`
2. Zone with config layoutRole `'hand'` classifies as `'hands'`
3. Zone with no config layoutRole but stack ordering + no adjacency classifies as `'cards'` (heuristic)
4. Zone with no config layoutRole but owner=player + visibility=owner classifies as `'hands'` (heuristic)
5. Zone with no config and no heuristic match classifies as `'other'`

**layout-cache.test.ts** (updated):
1. Same GameDef + same visual config = same cache key
2. Same GameDef + different visual config = different cache key
3. Same GameDef + null visual config = consistent cache key

### Invariants

- `build-layout-graph.ts` does NOT read `GameDef.metadata.layoutMode` directly
- `aux-zone-layout.ts` does NOT read `ZoneDef.layoutRole` directly
- Layout heuristic fallbacks (stack/adjacency, owner/visibility) still work when provider returns null
- `pnpm -F @ludoforge/runner typecheck` passes
- `pnpm -F @ludoforge/runner test` passes
