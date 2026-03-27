# 88ADJUNIFY-004: Replace Pixi-mutating dashed-path geometry with pure dashed segments

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `archive/tickets/88ADJUNIFY/88ADJUNIFY-002.md`

## Problem

The remaining adjacency-path architecture problem is not really in the adjacency renderer. It sits lower in the stack: `packages/runner/src/canvas/geometry/dashed-path.ts` mixes two responsibilities that should be separate:

- dash geometry generation
- Pixi `Graphics` mutation (`moveTo` / `lineTo`)

That design made the shared dashed-path primitive look generic, but it also baked a renderer-specific path-emission policy into the geometry layer. The result is that both `drawDashedLine()` and `drawDashedPolygon()` inherit the same multi-sub-path behavior, even though different renderers may need different stroke strategies under Pixi 8.

The cleaner architecture is a pure, bounded geometry contract that returns dash segments. Renderers can then decide how to stroke those segments safely for their use case.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/geometry/dashed-path.ts` currently walks points and directly calls `graphics.moveTo()` / `graphics.lineTo()` for each dash segment. Confirmed.
2. `packages/runner/src/canvas/geometry/dashed-line.ts` and `packages/runner/src/canvas/geometry/dashed-polygon.ts` are thin wrappers over `drawDashedPath()`. Confirmed.
3. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` uses `drawDashedLine()` and therefore inherits the shared multi-sub-path emission behavior. Confirmed.
4. `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` uses `drawDashedPolygon()` followed by one `graphics.stroke()` call, so it also depends on the same dashed-path emission contract. Confirmed.
5. The current geometry tests (`dashed-line.test.ts`, `dashed-polygon.test.ts`) assert Pixi mutation calls directly rather than a pure geometric output contract. Confirmed.
6. Additional codebase fact: `drawDashedPath()` is not used outside `dashed-line.ts` and `dashed-polygon.ts`. Confirmed.
7. Additional test-surface fact: adjacency renderer tests mock `drawDashedLine()` directly, so `drawDashedLine()` remains a useful semantic API even after the geometry refactor. Confirmed.
8. Scope correction: the generic Pixi-mutating `drawDashedPath()` helper should not survive this ticket. It is the leaky abstraction. This ticket should replace it with a pure dashed-segment builder and keep only semantic Pixi adapters (`drawDashedLine()`, `drawDashedPolygon()`) where they still add value.

## Architecture Check

1. A pure dashed-segment builder is cleaner than the current architecture because it keeps geometry deterministic and renderer-agnostic. It produces bounded data from bounded inputs and does not know or care how Pixi will stroke those segments.
2. This aligns with `docs/FOUNDATIONS.md` by keeping contracts generic and explicit. Although this is runner-only code, the same principle applies: data/geometry generation should not be entangled with a specific rendering side effect when a cleaner boundary is available.
3. This design is more extensible than patching `drawDashedPath()` in place. Future renderers can reuse the same segment builder while choosing different stroke backends or batching strategies.
4. `drawDashedLine()` and `drawDashedPolygon()` are not backwards-compatibility shims if they remain semantic Pixi adapters. They encode two distinct drawing intents that the renderers already express clearly.
5. `drawDashedPath()` is not a good long-term abstraction. It is generic in name but renderer-specific in behavior, so deleting it in this ticket is cleaner than carrying a temporary transition layer forward.

## What to Change

### 1. Introduce a pure dashed-segment geometry module

Create `packages/runner/src/canvas/geometry/dashed-segments.ts`:
- Export a pure function such as `buildDashedSegments(points, dashLength, gapLength, options?)`.
- Accept the same open/closed path semantics currently modeled by `drawDashedPath()`.
- Return immutable dash segment data, for example `readonly Array<{ from: Point2D; to: Point2D }>`.
- Validate the dash pattern contract explicitly:
  - `dashLength` must be finite and greater than zero
  - `gapLength` must be finite and greater than or equal to zero
  - invalid input should fail fast instead of risking an unbounded walk
- Preserve the existing bounded dash-walking behavior:
  - zero/single-point paths yield zero segments
  - dash state carries across polygon edges
  - degenerate edges are skipped safely
  - diagonal, reversed, and vertical paths stay on-axis

### 2. Replace the generic mutating path helper, not just wrap around it

- Delete `packages/runner/src/canvas/geometry/dashed-path.ts`.
- Update `dashed-line.ts` and `dashed-polygon.ts` to build segments and emit Pixi commands from those segments.
- Do not keep a generic mutating path helper under a new name. The clean split is:
  - pure geometry in `dashed-segments.ts`
  - semantic Pixi adapters in `dashed-line.ts` and `dashed-polygon.ts`

### 3. Move geometry proof tests to the pure contract

Add focused tests for the new module and rewrite the existing dashed geometry tests so they prove segment output rather than Pixi calls, with wrapper tests reduced to adapter coverage.

## Files to Touch

- `packages/runner/src/canvas/geometry/dashed-segments.ts` (new)
- `packages/runner/src/canvas/geometry/dashed-line.ts` (modify)
- `packages/runner/src/canvas/geometry/dashed-polygon.ts` (modify)
- `packages/runner/src/canvas/geometry/dashed-path.ts` (delete)
- `packages/runner/test/canvas/geometry/dashed-segments.test.ts` (new)
- `packages/runner/test/canvas/geometry/dashed-line.test.ts` (modify)
- `packages/runner/test/canvas/geometry/dashed-polygon.test.ts` (modify)

## Out of Scope

- Changing adjacency renderer stroke behavior.
- Changing region boundary renderer stroke behavior.
- Choosing the final Pixi-safe dash stroking strategy for renderers.
- Any game-specific visual-config changes.

## Acceptance Criteria

### Tests That Must Pass

1. The new dashed-segment builder returns the expected dash segments for horizontal, vertical, reversed, and diagonal open paths.
2. The new dashed-segment builder preserves dash state across closed polygon edges exactly as the old dashed polygon behavior did.
3. The new dashed-segment builder rejects invalid dash-pattern lengths instead of risking an infinite loop.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Dash geometry generation is pure and does not mutate Pixi `Graphics`.
2. The geometry layer exposes bounded segment data, not renderer-specific path-emission policy.
3. The only remaining Pixi mutation points are the semantic adapters that intentionally translate segment data into `Graphics` commands.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/geometry/dashed-segments.test.ts` — proves the new pure segment contract directly for open and closed paths.
2. `packages/runner/test/canvas/geometry/dashed-line.test.ts` — reduces wrapper coverage to “emits Pixi commands from built segments correctly” rather than re-proving dash math through Pixi mocks.
3. `packages/runner/test/canvas/geometry/dashed-polygon.test.ts` — does the same for closed paths while preserving the old dash-state expectations through the pure builder tests.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/canvas/geometry/dashed-segments.test.ts`
2. `pnpm -F @ludoforge/runner test -- test/canvas/geometry/dashed-line.test.ts`
3. `pnpm -F @ludoforge/runner test -- test/canvas/geometry/dashed-polygon.test.ts`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Added `packages/runner/src/canvas/geometry/dashed-segments.ts` with a pure `buildDashedSegments()` contract.
  - Updated `drawDashedLine()` and `drawDashedPolygon()` to emit Pixi commands from pure segment data.
  - Deleted `packages/runner/src/canvas/geometry/dashed-path.ts`.
  - Added explicit validation for invalid dash and gap lengths to prevent unbounded walks.
  - Added direct geometry-contract tests and reduced wrapper tests to adapter behavior.
- Deviations from original plan:
  - Kept `drawDashedLine()` and `drawDashedPolygon()` as stable semantic adapters instead of treating them as temporary wrappers scheduled for later deletion.
  - Removed the generic mutating path helper in this ticket rather than carrying a transition layer forward.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
