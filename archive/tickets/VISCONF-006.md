# VISCONF-006: Wire visual config into layout pipeline (layoutMode, layoutRole)

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D8
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop reading `layoutMode`/`layoutRole` from GameDef)

---

## Summary

Move layout-mode and aux-zone-role resolution to `VisualConfigProvider` so the layout pipeline no longer reads `GameDef.metadata.layoutMode` or `ZoneDef.layoutRole` directly. Update layout caching to include visual-config identity so layout recomputes when config changes.

---

## Reassessed assumptions and scope

### Confirmed assumptions

- `packages/runner/src/layout/build-layout-graph.ts` currently reads `def.metadata.layoutMode` in `resolveLayoutMode()`.
- `packages/runner/src/layout/aux-zone-layout.ts` currently reads `zone.layoutRole` in `classifyAuxZone()`.
- `packages/runner/src/layout/layout-cache.ts` cache key currently hashes only `GameDef` content.
- `VisualConfigProvider` already exposes `getLayoutMode(hasAdjacency)` and `getLayoutRole(zoneId)`; only config identity is missing.

### Discrepancies corrected in this ticket

1. `GameCanvas` is an implementation dependency and must be in-scope:
- `packages/runner/src/canvas/GameCanvas.tsx` currently calls `getOrComputeLayout(gameDef)` and must pass `visualConfigProvider` through.

2. Test impact is broader than originally listed:
- Signature changes in layout APIs require updating all affected layout tests, plus canvas call-site tests that compile against `getOrComputeLayout`.

3. Cache acceptance should be behavior-based (invalidation semantics), not private-key-string specific:
- Tests should assert cache hit/miss behavior with same/different config identity, not inspect private key internals.

### Architectural decision

These changes are better than the current architecture because they enforce strict separation:
- `GameDef` remains rules-only; visual/layout presentation lives in visual config.
- Layout cache invalidates on relevant visual-config changes, preventing stale layout behavior.
- No aliases/backward-compat paths are introduced; code reads from one source of truth (`VisualConfigProvider`).

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/config/visual-config-provider.ts` | Add stable `readonly configHash` identity for cache invalidation (`'null'` when config absent). |
| `packages/runner/src/layout/build-layout-graph.ts` | Change `resolveLayoutMode()` to use `VisualConfigProvider`; remove `zone.visual` from graph node attrs. |
| `packages/runner/src/layout/aux-zone-layout.ts` | Change aux-zone classification to use `provider.getLayoutRole(zone.id)` first, then heuristics fallback. |
| `packages/runner/src/layout/layout-cache.ts` | Thread `VisualConfigProvider` through `getOrComputeLayout`; include `provider.configHash` in cache key. |
| `packages/runner/src/canvas/GameCanvas.tsx` | Pass `visualConfigProvider` to `getOrComputeLayout` call site. |

## Files to update (tests)

| File | Change |
|------|--------|
| `packages/runner/test/layout/build-layout-graph.test.ts` | Update `resolveLayoutMode` tests to pass provider and validate provider-first behavior + adjacency fallback. Update graph attrs expectation (no `visual`). |
| `packages/runner/test/layout/aux-zone-layout.test.ts` | Update to pass provider, validate config role precedence + heuristics fallback. |
| `packages/runner/test/layout/layout-cache.test.ts` | Update `getOrComputeLayout` calls to pass provider; add cache behavior checks for same/different/null `configHash`. |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Update layout-cache call expectations if needed after signature change. |

---

## Detailed requirements

### 1) VisualConfigProvider identity

Add `configHash` to `VisualConfigProvider`:
- `readonly configHash: string`
- Deterministic hash derived from config content.
- `'null'` when config is `null`.

Implementation note: reuse existing layout cache stable-serialization + FNV-1a style hash (or equivalent deterministic implementation) without introducing duplicate divergent hash logic.

### 2) build-layout-graph changes

`resolveLayoutMode(def: GameDef, provider: VisualConfigProvider): LayoutMode`
- Compute `hasAdjacency = def.zones.some(z => (z.adjacentTo?.length ?? 0) > 0)`.
- Return `provider.getLayoutMode(hasAdjacency)`.
- Must not read `def.metadata.layoutMode` directly.

`buildLayoutGraph()` node attrs:
- Keep `category` and `attributes`.
- Remove `visual` attribute from stored node data.

### 3) aux-zone-layout changes

`computeAuxLayout(auxZones, boardBounds, provider)`:
- Grouping classification checks `provider.getLayoutRole(zone.id)` first.
- Role mappings: `card -> cards`, `forcePool -> forcePools`, `hand -> hands`, `other -> other`.
- If provider returns `null`, keep current heuristics exactly:
  - card heuristic: `ordering === 'stack' && no adjacency`
  - hand heuristic: `owner === 'player' && visibility === 'owner'`
  - fallback: `other`
- Must not read `zone.layoutRole` directly.

### 4) layout-cache + canvas wiring

`getOrComputeLayout(def, provider)`:
- Use provider-aware `resolveLayoutMode` and `computeAuxLayout` signatures.
- Cache key includes game identity, game-def hash, and `provider.configHash`.

`GameCanvas`:
- Pass `options.visualConfigProvider` into `getOrComputeLayout`.

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

### Behavior tests

1. `resolveLayoutMode` uses provider-configured mode when present.
2. `resolveLayoutMode` falls back to adjacency heuristic when provider has null config.
3. `buildLayoutGraph` node attrs contain no `visual` payload.
4. Aux classification uses provider role precedence (`card`/`hand`/`forcePool`/`other`).
5. Aux classification heuristics remain unchanged when provider returns `null`.
6. Layout cache returns same object for same `GameDef` + same `configHash`.
7. Layout cache recomputes for same `GameDef` + different `configHash`.
8. Layout cache behavior with null-config provider is deterministic across calls.

### Invariants

- `packages/runner/src/layout/build-layout-graph.ts` does not read `GameDef.metadata.layoutMode`.
- `packages/runner/src/layout/aux-zone-layout.ts` does not read `ZoneDef.layoutRole`.
- `packages/runner/src/layout/layout-cache.ts` cache identity includes visual config identity.

### Required verification

- `pnpm -F @ludoforge/runner typecheck`
- `pnpm -F @ludoforge/runner test`

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed (implemented)**:
  - Added `VisualConfigProvider.configHash` with deterministic stable hashing and a `'null'` sentinel.
  - Updated layout mode resolution to use `VisualConfigProvider` only.
  - Updated aux-zone classification to resolve roles from `VisualConfigProvider` first, then existing heuristics.
  - Removed `zone.visual` from layout graph node attributes.
  - Updated layout cache key to include visual config identity.
  - Wired `GameCanvas` to pass `visualConfigProvider` into layout-cache calls.
  - Added shared stable-hash utility to avoid duplicate hash logic.
  - Updated and expanded layout/config/canvas tests for provider wiring, cache invalidation, and role precedence.
- **Deviations from original plan**:
  - Scope was expanded to include `packages/runner/src/canvas/GameCanvas.tsx` and `packages/runner/test/canvas/GameCanvas.test.ts` due signature propagation from `getOrComputeLayout(def, provider)`.
  - Added one extra robustness test for provider role precedence over heuristic classification.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
