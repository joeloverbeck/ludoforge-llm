# CARGAMVISEXP-002: Card template color and symbol support

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-001 (card shape must be active for template rendering to engage)

## Problem

`drawCardContent()` in `card-template-renderer.ts` renders all text in hardcoded white (`#f8fafc`). There is no mechanism for property-driven colors (red hearts, black spades), no value-to-symbol mapping (suitName "Hearts" -> unicode heart), and no way to source a display value from a different token property than the field key name.

## Assumption Reassessment (2026-02-20)

1. `CardFieldLayoutSchema` currently has only `y`, `fontSize`, `align`, and `wrap` (no `x`, `sourceField`, `symbolMap`, `colorFromProp`, `colorMap`) — confirmed in `packages/runner/src/config/visual-config-types.ts`.
2. `drawCardContent()` currently renders all text with hardcoded `fill: '#f8fafc'` and resolves values by field key only — confirmed in `packages/runner/src/canvas/renderers/card-template-renderer.ts`.
3. Existing renderer tests cover only baseline layout/wrap behavior; they do not cover property remapping, symbol transforms, or color mapping — confirmed in `packages/runner/test/canvas/renderers/card-template-renderer.test.ts`.
4. Texas Hold'em `visual-config.yaml` still uses a basic `poker-card` template with `rankName` and `suitName` only; no symbol/color-aware field config exists yet — confirmed in `data/games/texas-holdem/visual-config.yaml`.
5. D1 prerequisite is already present (`tokenTypeDefaults` + card assignment for `card-` prefix), so this ticket can stay runner-only and focused on template text rendering behavior.

## Architecture Check

1. Additive schema fields remain the correct approach here; they keep templates declarative and avoid hardcoded game branches in runner code.
2. For long-term maintainability, text/value/color resolution should be implemented as small pure helpers inside the renderer module (or same-file private functions), not inline ad-hoc branches in the render loop.
3. The mapping model (`sourceField`, `symbolMap`, `colorFromProp`, `colorMap`) is engine-agnostic and reusable across any card-like token template.
4. This work should not touch kernel/compiler/sim contracts; all behavior remains data-driven via visual config.

## What to Change

### 1. Extend `CardFieldLayoutSchema`

In `visual-config-types.ts`, add optional fields:
```typescript
x: z.number().optional(),              // horizontal pixel offset
sourceField: z.string().optional(),     // read from this property instead of field key name
symbolMap: z.record(z.string(), z.string()).optional(), // property value -> display text
colorFromProp: z.string().optional(),   // property name whose value selects color
colorMap: z.record(z.string(), z.string()).optional(),  // property value -> hex color
```

### 2. Modify `drawCardContent()` in card-template-renderer.ts

For each field in the template layout:
1. **Source resolution**: `fields[fieldLayout.sourceField ?? fieldName]`
2. **Symbol mapping**: if `symbolMap` defined, `symbolMap[String(rawValue)] ?? String(rawValue)`
3. **Color resolution**: if `colorFromProp` defined, lookup `fields[colorFromProp]` in `colorMap`; if found use it, else default white
4. **X offset**: support `fieldLayout.x` in addition to alignment-based positioning
5. Keep resolution logic in pure helper functions so adding future display transforms does not bloat the render loop

### 3. Update Texas Hold'em visual-config.yaml

Replace the basic `poker-card` template with the full layout from Spec 43 (rankCorner, suitCenter, rankBottom fields with sourceField, symbolMap, colorFromProp, colorMap).

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/canvas/renderers/card-template-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/card-template-renderer.test.ts` (modify)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Token type prefix matching (resolved by CARGAMVISEXP-001)
- Zone layout or table positioning — that's CARGAMVISEXP-003
- Table background or overlays — that's CARGAMVISEXP-004/005
- Hand panel UI (MiniCard component) — that's CARGAMVISEXP-006
- Engine/kernel changes of any kind
- FITL visual config changes
- Modifying `visual-config-provider.ts` (D1 handles that)

## Acceptance Criteria

### Tests That Must Pass

1. `card-template-renderer.test.ts` — new test: `sourceField` resolution reads from specified property instead of field key name
2. `card-template-renderer.test.ts` — new test: `symbolMap` transforms raw value to display text (e.g., "Hearts" -> unicode heart)
3. `card-template-renderer.test.ts` — new test: `symbolMap` passes through unmapped values unchanged
4. `card-template-renderer.test.ts` — new test: `colorFromProp` + `colorMap` applies correct fill color per suit
5. `card-template-renderer.test.ts` — new test: missing `colorFromProp` falls back to default white
6. `card-template-renderer.test.ts` — new test: `x` offset positions text at specified horizontal coordinate
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Templates without the new optional fields render identically to before (backwards compatible).
2. `drawCardContent()` remains a pure rendering function — it reads data, never mutates game state.
3. No game-specific logic in the renderer — all behavior is driven by config.
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/card-template-renderer.test.ts` — add describe block for sourceField, symbolMap, colorMap, and x-offset rendering

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/canvas/renderers/card-template-renderer.test.ts`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Extended `CardFieldLayoutSchema` with `x`, `sourceField`, `symbolMap`, `colorFromProp`, and `colorMap`.
  - Refactored `drawCardContent()` to use pure helper resolution paths for display text and text color, and added `x` offset support.
  - Replaced Texas Hold'em `poker-card` template with Spec 43-style `rankCorner` / `suitCenter` / `rankBottom` layout and suit symbol/color mapping.
  - Expanded renderer tests for source remapping, symbol mapping (mapped + passthrough), color mapping fallback, and x-offset positioning.
  - Updated `visual-config-files.test.ts` Texas config expectation to match the new template contract.
- **Deviation from original plan**:
  - Added one extra config validation test update (`packages/runner/test/config/visual-config-files.test.ts`) because the hard suite revealed the previous expected template snapshot was stale.
- **Verification**:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
