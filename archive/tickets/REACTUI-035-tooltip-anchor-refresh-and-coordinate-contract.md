# REACTUI-035: Tooltip Anchor Refresh + Coordinate Contract

**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P1
**Depends on**: REACTUI-016
**Estimated complexity**: M
**Status**: ✅ COMPLETED

---

## Assumption Reassessment (Current Code Baseline)

- `GameContainer` currently derives tooltip anchor rect in React via:
  - hover target identity (`onHoverTargetChange`)
  - world-bounds resolver (`onHoverBoundsResolverReady`)
  - coordinate bridge (`onCoordinateBridgeReady`)
- This derivation does **not** refresh on pan/zoom when hover target identity is unchanged, because no viewport-transform signal is wired into React state updates.
- `GameCanvas` currently emits raw building blocks (bridge + resolver), not an explicit tooltip anchor contract.
- `GameContainer.test.ts` is currently server-rendered/static-markup focused; it does not exercise runtime callback updates over time.
- `coordinate-bridge.test.ts` currently validates conversion behavior and remains the correct contract test location for conversion math.

## Corrected Scope

- Replace the current split hover-anchor plumbing (`onCoordinateBridgeReady` + `onHoverBoundsResolverReady`) with a single explicit hover-anchor payload emitted from canvas.
- Introduce a typed hover-anchor contract with explicit coordinate space and monotonic `version` for update ordering.
- Make canvas the single authority for anchor recomputation during:
  - hover target enter/leave
  - viewport transform changes (pan/zoom)
- Keep coordinate conversion ownership unambiguous:
  - if emitted anchor `space` is `'screen'`, UI consumes rect directly
  - no UI-side world-to-screen conversion in `GameContainer`
- Update tests to verify callback-driven anchor refresh behavior and space contract semantics.

## What Needs To Change

- Introduce an explicit hover-anchor contract in canvas/UI bridge, with unambiguous coordinate space.
  - Required shape: `{ target, rect, space, version }`.
  - `space` must be explicit (`'world'` or `'screen'`), never implicit.
- Ensure tooltip anchor updates while viewport transform changes (pan/zoom), not only when hover target identity changes.
- Remove ambiguous/double conversion risk:
  - If canvas emits screen rect, UI must not pass through `worldBoundsToScreenRect()`.
  - If canvas emits world rect, UI must convert exactly once.
- Update `GameContainer` and `TooltipLayer` integration to consume the new anchor contract.

Likely files:
- `packages/runner/src/canvas/GameCanvas.tsx`
- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/src/canvas/coordinate-bridge.ts` (if contract helpers are added)
- `packages/runner/test/canvas/GameCanvas.test.ts`
- `packages/runner/test/ui/GameContainer.test.ts`

---

## Invariants

- Tooltip remains anchored to the hovered sprite during continuous pan/zoom.
- Anchor coordinate space is explicit and validated by type contract.
- No double coordinate conversion paths exist.
- Tooltip anchoring remains game-agnostic (no game-specific rules/fields).

---

## Tests That Must Pass

- `packages/runner/test/canvas/GameCanvas.test.ts`
  - Emits updated hover anchor when viewport transform changes while hover target is stable.
  - Emits anchors with explicit coordinate space contract and monotonic `version`.
- `packages/runner/test/ui/GameContainer.test.ts`
  - Uses latest anchor update from canvas callback contract.
  - Does not perform forbidden/duplicate conversion for emitted `'screen'` anchors.
- `packages/runner/test/canvas/coordinate-bridge.test.ts`
  - Contract-level test for whichever conversion path remains authoritative.

---

## Outcome

- **Completion date**: 2026-02-18
- **What was changed**:
  - Replaced split hover-anchor plumbing in `GameCanvas` (`onCoordinateBridgeReady` + `onHoverBoundsResolverReady` + `onHoverTargetChange`) with single `onHoverAnchorChange` contract carrying `{ target, rect, space, version }`.
  - Added discriminated hover-anchor type contract in `GameCanvas` for explicit coordinate space.
  - Extracted hover-anchor contract types into dedicated shared module `packages/runner/src/canvas/hover-anchor-contract.ts` so UI and canvas layers depend on a stable contract module, not component-local types.
  - Implemented canvas-driven anchor refresh on viewport movement (`moved` events) while hover target remains stable.
  - Removed UI-side world-to-screen tooltip conversion path from `GameContainer`; UI now consumes screen-space anchors directly.
  - Added/updated tests for screen-space contract mapping, viewport-driven refresh, and monotonic anchor versioning.
- **Deviations from original plan**:
  - Added a pure helper (`resolveTooltipAnchorState`) in `GameContainer` to keep conversion ownership explicit and testable in a non-DOM test environment.
  - No changes were required in `coordinate-bridge.ts`; existing conversion contract remained authoritative.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
