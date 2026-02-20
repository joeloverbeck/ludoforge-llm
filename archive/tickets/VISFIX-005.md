# VISFIX-005: Stack Visuals for Hidden Zones (Deck, Burn, Muck)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: VISFIX-002 (zone token badge removal)

## Problem

Hidden zones (deck, burn, muck) currently render as plain zone rectangles. While `hiddenTokenCount` is present in the render model and tooltips, the board itself does not visually communicate hidden pile depth. Players cannot assess pile state at a glance.

## Assumption Reassessment (2026-02-20)

Verified against current code/tests:

1. `RenderZone.hiddenTokenCount` already exists in `packages/runner/src/model/render-model.ts` and is derived in `packages/runner/src/model/derive-render-model.ts`.
2. `canvas-equality.ts` already includes `hiddenTokenCount` in zone visual equality checks, and `packages/runner/test/canvas/canvas-equality.test.ts` already covers this.
3. `zone-renderer.ts` currently owns all zone visuals (base + labels) and is the natural place to add hidden-pile visuals without introducing a new top-level renderer lifecycle.
4. `canvas-updater.ts` and `GameCanvas.tsx` do not need wiring changes if hidden-pile visuals are rendered inside `zone-renderer`.
5. The ticket assumption about using `MiniCard.module.css` directly from canvas code is incorrect: canvas renderers cannot consume CSS module gradients. A shared TS color token is required for visual parity.

## Architecture Decision

### Proposed in original ticket
- New standalone `stack-renderer.ts`
- New renderer wiring through `canvas-updater.ts` and `GameCanvas.tsx`

### Reassessed design (adopted)
- Keep hidden-stack visuals inside zone rendering flow, implemented as a focused helper module used by `zone-renderer.ts`.

Rationale:
1. Zone-local concern: hidden stack is part of zone appearance, not an independent scene primitive.
2. Fewer moving parts: avoids new renderer interface plumbing, lifecycle management, and synchronization risk.
3. Better robustness: preserves single source of truth for zone container composition and hit-area behavior.
4. Extensibility: helper extraction still keeps implementation modular for future style variants/animations.

No backwards-compatibility shims or aliasing are introduced.

## Updated Scope

### In scope

1. Add hidden pile drawing within zone visuals for zones where `hiddenTokenCount > 0`.
2. Render a capped face-down stack silhouette (`min(hiddenTokenCount, 5)` layers).
3. Render a count badge that shows total hidden token count.
4. Ensure stack visuals update correctly when `hiddenTokenCount` changes.
5. Add/strengthen renderer tests for shape count, zero-count behavior, and count updates.

### Out of scope

1. New top-level `stack-renderer` integration via `canvas-updater.ts` / `GameCanvas.tsx`.
2. Animation of pile transitions.
3. Face-up top-card rendering semantics.
4. Game-specific stack behavior.

## What to Change

1. `packages/runner/src/canvas/renderers/zone-renderer.ts`
- Extend zone visual elements to include hidden-stack graphics + count label.
- Draw hidden-stack visuals only when `zone.hiddenTokenCount > 0`.
- Keep existing zone hit area and label behavior intact.

2. `packages/runner/src/canvas/renderers/` (new helper module)
- Add a small helper for hidden-stack drawing constants/logic to keep `zone-renderer.ts` maintainable.
- Use TS constants for face-down palette aligned with MiniCard styling intent.

3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
- Add tests that assert hidden stack is shown for non-zero counts and hidden for zero.
- Add tests that assert displayed stack card count is clamped at 5.
- Add tests that assert badge text updates with `hiddenTokenCount` changes.

## Files to Touch

- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/*hidden-stack*.ts` (new helper)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (modify)

## Acceptance Criteria

1. Zones with `hiddenTokenCount > 0` render a visible hidden-stack silhouette and count badge.
2. Layer count is clamped to 5 rendered shapes regardless of larger hidden counts.
3. Zones with `hiddenTokenCount === 0` render no stack silhouette/badge.
4. Stack visuals update correctly as `hiddenTokenCount` changes.
5. Existing runner test suite remains green.

## Invariants

1. Pure view-layer change in runner canvas rendering only.
2. No engine/kernel/GameSpecDoc/schema changes.
3. No game-specific branches/hardcoded per-game IDs.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
- hidden stack visibility toggles by `hiddenTokenCount`
- rendered stack layers are clamped to 5
- badge label tracks hidden count updates

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Actual implementation:
  - Added `packages/runner/src/canvas/renderers/hidden-zone-stack.ts` and integrated it into `zone-renderer.ts`.
  - Hidden zones now render a face-down stack silhouette plus count badge when `hiddenTokenCount > 0`.
  - Rendered stack layers clamp at 5 while badge text shows exact hidden count.
  - Strengthened `packages/runner/test/canvas/renderers/zone-renderer.test.ts` with hidden-stack visibility, clamp, and badge-update assertions.
- Deviation from original plan:
  - Did not add a new top-level `stack-renderer` or updater/runtime wiring; implemented as a zone-renderer-local helper for cleaner ownership and lower lifecycle complexity.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
