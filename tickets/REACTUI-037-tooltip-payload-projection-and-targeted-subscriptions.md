# REACTUI-037: Tooltip Payload Projection + Targeted Subscriptions

**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P2
**Depends on**: REACTUI-016
**Estimated complexity**: M

---

## What Needs To Change

- Introduce a game-agnostic tooltip payload projection layer.
  - `TooltipLayer` should render a normalized payload, not directly format `RenderZone`/`RenderToken` internals inline.
- Move tooltip data shaping into a projector utility/module near model/UI boundary.
- Narrow tooltip subscriptions so open tooltip reacts only to hovered entity data changes, not whole `zones`/`tokens` arrays.
- Keep renderer generic: rows/sections are data-driven, with no game-specific branching.

Likely files:
- `packages/runner/src/ui/TooltipLayer.tsx`
- `packages/runner/src/model/` (new tooltip projection utility)
- `packages/runner/test/ui/TooltipLayer.test.ts`
- `packages/runner/test/model/` (new projection tests)

---

## Invariants

- Tooltip rendering remains game-agnostic and does not encode per-game logic.
- Tooltip component receives normalized payload and does not own data-shaping policy.
- Unrelated RenderModel updates do not cause unnecessary tooltip recomputation/rerender for unchanged hovered entity payload.

---

## Tests That Must Pass

- `packages/runner/test/model/*tooltip*.test.ts` (new)
  - Projects zone hover into normalized tooltip payload.
  - Projects token hover into normalized tooltip payload.
  - Handles missing/invalid hover target with null payload.
- `packages/runner/test/ui/TooltipLayer.test.ts`
  - Renders normalized payload correctly for zone and token cases.
  - Ignores unrelated store updates when hovered payload is unchanged.
  - Still honors pointer-events and Floating UI positioning contract.
