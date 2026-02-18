# REACTUI-035: Tooltip Anchor Refresh + Coordinate Contract

**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P1
**Depends on**: REACTUI-016
**Estimated complexity**: M

---

## What Needs To Change

- Introduce an explicit hover-anchor contract in canvas/UI bridge, with unambiguous coordinate space.
  - Example shape: `{ target, rect, space, version }`.
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
  - Emits anchors with explicit coordinate space contract.
- `packages/runner/test/ui/GameContainer.test.ts`
  - Uses latest anchor update from canvas bridge.
  - Does not perform forbidden/duplicate conversion for emitted anchor space.
- `packages/runner/test/canvas/coordinate-bridge.test.ts`
  - Contract-level test for whichever conversion path remains authoritative.
