# 71CONROUREN-006: FITL Visual Config Migration and End-to-End Verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/71CONROUREN-002.md, archive/tickets/71CONROUREN/71CONROUREN-005.md, archive/tickets/71CONROUREN/71CONROUREN-007.md

## Problem

The FITL `visual-config.yaml` still declares LoC zones as `shape: line` (270×50px rectangles). With the connection-route pipeline fully wired, the final step is to migrate the FITL config to use `shape: connection` with `connectionStyles` and `attributeRules` that map highway/mekong terrain tags to named connection styles. This ticket also includes adding explicit `connectionEndpoints` overrides for ambiguous zone names and verifying the end-to-end visual result.

## Assumption Reassessment (2026-03-21)

1. Current FITL `visual-config.yaml` has `zones.categoryStyles.loc: { shape: line, width: 270, height: 50 }` — confirmed.
2. No `connectionStyles` section exists yet — confirmed.
3. No `connectionEndpoints` overrides exist yet — confirmed.
4. Attribute rules exist for terrain-based styling (e.g., jungle, mountain) — the same mechanism is used for `connectionStyleKey`.
5. 17 LoC zones need to transition: 13 highways + 4 mekong river segments.
6. Zone ID `loc-saigon-an-loc-ban-me-thuot` contains 3 city references — needs explicit `connectionEndpoints` override per spec.
7. The current connection-route renderer does not yet render connection-zone marker text or badges. FITL migration must not assume sabotage-state visibility survives automatically; that parity work belongs in `71CONROUREN-007`.

## Architecture Check

1. This ticket remains a FITL data migration + verification ticket, but it depends on `71CONROUREN-007` for full connection-zone marker presentation parity before manual verification can be considered complete.
2. Visual config changes are in `data/games/fire-in-the-lake/visual-config.yaml` — game-specific visual data stays in the game's data directory. Aligns with F3 (Visual Separation).
3. No backwards-compat shims: `shape: line` is replaced by `shape: connection` for the `loc` category. Aligns with F9.

## What to Change

### 1. Update LoC category style

In `data/games/fire-in-the-lake/visual-config.yaml`, change:
```yaml
loc:
  shape: line
  width: 270
  height: 50
```
to:
```yaml
loc:
  shape: connection
```

The `width`/`height` fields are no longer used for connection shapes (curve dimensions are determined by endpoint positions and curvature).

### 2. Add `connectionStyles` section

Add under `zones:`:
```yaml
connectionStyles:
  highway:
    strokeWidth: 8
    strokeColor: "#8b7355"
    strokeAlpha: 0.8
  mekong:
    strokeWidth: 12
    strokeColor: "#4a7a8c"
    strokeAlpha: 0.9
    wavy: true
    waveAmplitude: 4
    waveFrequency: 0.08
```

### 3. Add `attributeRules` for connection style keys

Add (or extend existing) attribute rules:
```yaml
attributeRules:
  - match:
      category: [loc]
      attributeContains:
        terrainTags: highway
    style:
      connectionStyleKey: highway
  - match:
      category: [loc]
      attributeContains:
        terrainTags: mekong
    style:
      connectionStyleKey: mekong
```

### 4. Add `connectionEndpoints` override for ambiguous zone

Add under `zones.zoneOverrides` (or create the section):
```yaml
zoneOverrides:
  "loc-saigon-an-loc-ban-me-thuot:none":
    connectionEndpoints: ["an-loc:none", "saigon:none"]
```

### 5. Visual verification checklist

Run `pnpm -F @ludoforge/runner dev`, load FITL, and verify all 10 items from the spec's visual verification section.

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify — LoC style, connectionStyles, attribute rules, endpoint overrides)

## Out of Scope

- Any TypeScript source code changes (all code is done in previous tickets)
- Kernel or compiler changes
- Texas Hold'em visual config (no connection zones in poker)
- Animated river flow (follow-up)
- Tangent-perpendicular token fanning (follow-up)
- Curvature auto-adjustment (follow-up)
- Changes to any other game's visual config

## Acceptance Criteria

### Tests That Must Pass

1. FITL visual config parses successfully through `ZonesConfigSchema` (including new `connectionStyles` and updated `attributeRules`)
2. The 17 LoC zones resolve `visual.shape === 'connection'` (not `'line'`)
3. Highway LoCs resolve `connectionStyleKey: 'highway'` via attribute rules
4. Mekong LoCs resolve `connectionStyleKey: 'mekong'` via attribute rules
5. `loc-saigon-an-loc-ban-me-thuot:none` resolves `connectionEndpoints: ['an-loc:none', 'saigon:none']`
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Non-LoC zones (cities, provinces) are unaffected — their shapes, sizes, and styles remain identical
2. No engine/kernel test regressions
3. Visual config remains valid YAML parseable by the Zod schema
4. No game-specific code was introduced in any TypeScript source file

## Test Plan

### New/Modified Tests

1. If a visual config integration test exists, verify it picks up the new `connectionStyles` section. If not, this is validated by the schema parse in the existing config loading path.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner dev` (manual visual verification)

### Visual Verification Checklist (Manual)

1. LoC rectangles are gone, replaced by curves connecting endpoint zones
2. Highway curves are solid brown (#8b7355), 8px stroke
3. Mekong curves are wavy blue (#4a7a8c), 12px stroke
4. Junction dots appear where LoCs meet (e.g., Da Nang–Dak To / Kontum–Dak To intersection)
5. Labels are readable, rotated to follow curve direction
6. Tokens on LoCs cluster at curve midpoints
7. LoC zones remain selectable (pointer hover, click)
8. Sabotage marker presentation remains visible on sabotaged LoCs after the migration
9. No adjacency lines from LoC endpoints remain
10. Non-LoC zones (cities, provinces) render identically to before
