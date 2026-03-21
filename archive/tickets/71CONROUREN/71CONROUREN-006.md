# 71CONROUREN-006: FITL Connection Visual Config Migration

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN-002.md, archive/tickets/71CONROUREN/71CONROUREN-005.md, archive/tickets/71CONROUREN/71CONROUREN-007.md

## Problem

FITL still renders Lines of Communication as `shape: line` rectangles in `visual-config.yaml`, even though the runner now has a generic connection-route presentation pipeline. The remaining work is not just a cosmetic config flip. FITL needs production-owned endpoint topology in visual config so connection routes can resolve deterministically without relying on zone-id parsing heuristics.

Today, the runner can already:

- resolve `connectionStyleKey`
- render `shape: connection` zones as connection routes
- keep route tokens visible
- render route marker text and badges after `71CONROUREN-007`

But the current FITL migration assumptions are incomplete because the visual-config pipeline still cannot express route endpoints, and many FITL LoCs are ambiguous under the resolver's name-parsing fallback.

## Assumption Reassessment (2026-03-21)

1. FITL `data/games/fire-in-the-lake/visual-config.yaml` still uses `zones.categoryStyles.loc.shape: line` with rectangle dimensions. Confirmed.
2. The generic runner architecture is already ahead of this ticket in several areas:
   - `ZoneShape` already includes `'connection'`.
   - `zones.connectionStyles` already exists in `VisualConfigSchema`.
   - `VisualConfigProvider.resolveConnectionStyle()` already exists.
   - `buildPresentationScene()` already projects connection-shaped zones through `resolveConnectionRoutes()`.
   - marker text / badge parity for connection routes was already completed in `71CONROUREN-007`.
3. The ticket's old assumption that only one FITL LoC needs explicit endpoint help is false. Under the current fallback heuristic, only 6 of the 17 FITL LoCs are unambiguous from runtime IDs alone; the remaining 11 need explicit endpoint data for deterministic production rendering.
4. The real architectural gap is not renderer parity anymore. It is config ownership: `resolveConnectionRoutes()` accepts `endpointOverrides`, but `visual-config.yaml` and `VisualConfigProvider` currently have no way to supply them.
5. The clean long-term architecture is explicit topology in visual config for production connection zones. Route endpoint semantics should not depend on string parsing of zone IDs when the visual config can own that topology directly.
6. FITL migration should prefer explicit `connectionEndpoints` for all 17 LoCs, not only the ambiguous ones. That makes the production config deterministic, self-documenting, and resilient to future naming changes.

## Architecture Check

1. This remains fully aligned with F3 (Visual Separation): FITL-specific connection topology belongs in `data/games/fire-in-the-lake/visual-config.yaml`, not in runner code.
2. The runner change should stay generic:
   - add a generic `connectionEndpoints` config field
   - expose it through `VisualConfigProvider`
   - pass it into `resolveConnectionRoutes()`
3. The existing resolver fallback heuristics may remain as a generic convenience, but production FITL should not rely on them. Explicit config is cleaner than encoding topology into naming conventions.
4. No backwards compatibility shims: FITL `loc` zones should move fully from `shape: line` to `shape: connection`. Any affected tests should be updated to current truth.
5. This ticket should not reopen renderer work already completed in `71CONROUREN-007`. Its responsibility is config ownership, data migration, and production verification.

## What to Change

### 1. Add generic connection endpoint config support

Extend the runner visual-config contract so a game can declare explicit route endpoints in `visual-config.yaml`.

Target shape:

```yaml
zones:
  connectionEndpoints:
    "loc-hue-da-nang:none": ["hue:none", "da-nang:none"]
    "loc-saigon-an-loc-ban-me-thuot:none": ["saigon:none", "an-loc:none"]
```

This must be generic runner infrastructure, not FITL-specific branching.

### 2. Thread endpoint config through the presentation pipeline

- Add schema support for `zones.connectionEndpoints`.
- Expose the parsed endpoint map from `VisualConfigProvider`.
- Pass the provider-owned endpoint map into `resolveConnectionRoutes()` from `buildPresentationScene()`.

The resolver should continue validating that configured endpoints are real, distinct, non-connection neighboring zones.

### 3. Migrate FITL LoCs to connection routes

In `data/games/fire-in-the-lake/visual-config.yaml`:

- change `zones.categoryStyles.loc.shape` from `line` to `connection`
- remove obsolete `width` / `height` from the `loc` category style
- add `zones.connectionStyles` for highway and Mekong route rendering
- change LoC terrain-based `attributeRules` from color styling to `connectionStyleKey`
- add explicit `zones.connectionEndpoints` entries for all 17 FITL LoCs

Do not leave FITL production behavior dependent on zone-id parsing heuristics.

### 4. Strengthen production-facing tests

Add or update tests to prove:

- the new schema accepts `connectionEndpoints`
- `VisualConfigProvider` exposes endpoint mappings deterministically
- `buildPresentationScene()` uses provider-owned endpoint config when resolving connection routes
- FITL production visual config resolves all 17 LoCs as connection routes with expected style keys and endpoint pairs

## Files to Touch

- `tickets/71CONROUREN-006.md` (this ticket; update first)
- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/src/presentation/presentation-scene.ts`
- `packages/runner/test/config/visual-config-schema.test.ts`
- `packages/runner/test/config/visual-config-provider.test.ts`
- `packages/runner/test/presentation/presentation-scene.test.ts`
- `packages/runner/test/config/visual-config-files.test.ts`
- `data/games/fire-in-the-lake/visual-config.yaml`

## Out of Scope

- Any engine/kernel/compiler changes
- Connection-route renderer marker parity work from `71CONROUREN-007`
- Tangent-perpendicular token fanning
- Animated river flow
- Curvature auto-adjustment
- Texas Hold'em or any non-FITL game visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. `VisualConfigSchema` accepts `zones.connectionEndpoints`.
2. `VisualConfigProvider` returns configured endpoint pairs for connection zones.
3. `buildPresentationScene()` resolves connection routes using configured endpoint pairs from visual config.
4. FITL production visual config parses and validates successfully.
5. All 17 FITL LoCs resolve as `visual.shape === 'connection'`.
6. FITL highway LoCs resolve `connectionStyleKey === 'highway'`.
7. FITL Mekong LoCs resolve `connectionStyleKey === 'mekong'`.
8. FITL connection routes use the configured endpoint pairs from visual config, not heuristic inference.
9. Existing suite: `pnpm -F @ludoforge/runner test`
10. `pnpm -F @ludoforge/runner typecheck`
11. `pnpm -F @ludoforge/runner lint`

### Invariants

1. Non-LoC FITL zones keep their existing visual semantics.
2. No FITL-specific code branches are introduced in runner TypeScript.
3. Connection endpoint topology is owned by visual config, not by zone-id parsing assumptions.
4. Visual config remains valid YAML and valid against reference checks.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts`
   - add schema coverage for `zones.connectionEndpoints`
2. `packages/runner/test/config/visual-config-provider.test.ts`
   - add provider coverage for reading configured connection endpoints
3. `packages/runner/test/presentation/presentation-scene.test.ts`
   - prove configured endpoint pairs drive route resolution through the real scene-building path
4. `packages/runner/test/config/visual-config-files.test.ts`
   - upgrade FITL production assertions to cover connection route migration, style keys, and all configured endpoint pairs

### Commands

1. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
3. `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
4. `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm -F @ludoforge/runner lint`

### Visual Verification Checklist (Manual)

1. LoC rectangles are gone and replaced by connection routes.
2. Highway routes render with the configured highway connection style.
3. Mekong routes render with the configured Mekong connection style.
4. Route labels, route markers, and badges remain visible.
5. Tokens on LoCs remain visible and interactable.
6. Non-LoC zones still render as before.

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the current runner and corrected the scope before implementation.
  - Added generic `zones.connectionEndpoints` support to the visual-config schema, provider, reference validation, and presentation-scene wiring.
  - Migrated FITL `loc` visuals from `shape: line` to `shape: connection`, added `connectionStyles`, switched LoC terrain rules to `connectionStyleKey`, and configured explicit endpoint pairs for all 17 LoCs.
  - Strengthened runner tests around schema acceptance, provider exposure, reference validation, scene resolution, FITL production config invariants, and FITL bootstrap expectations.
- Deviations from original plan:
  - The original ticket assumed only one ambiguous LoC needed an explicit endpoint override. In practice, production FITL needed explicit endpoint ownership for all 17 LoCs to avoid topology drift and name-parsing dependence.
  - Added reference-validation coverage for `zones.connectionEndpoints`. This was not called out in the original ticket, but it is part of a complete config contract.
  - Some FITL route names refer to towns that are not modeled as standalone board zones. Under the current generic route model, those routes use explicit neighboring board-zone proxies as endpoints. A future ideal architecture could support non-zone route anchors directly, but that is outside this ticket.
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-schema.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-provider.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/validate-visual-config-refs.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/presentation/presentation-scene.test.ts`
  - `pnpm -F @ludoforge/runner exec vitest run test/config/visual-config-files.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
