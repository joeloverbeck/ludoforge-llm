# AGNOSTIC-007: Owner-Safe Token Stack Grouping in Runner Renderer

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## Assumption Reassessment (2026-02-18)

1. Current `token-renderer` stack grouping key is `zoneID + type + factionId + faceUp` and does not include `ownerID`.
2. In current runner architecture, ownership can affect rendered semantics:
   - fill color fallback when `factionId` or token-type color is unavailable.
   - hover/tooltip payload identity via representative token ID.
3. Existing tests already cover generic stacking and representative rebinding in `token-renderer`.
4. `GameCanvas` tests currently validate hover-anchor behavior and ordering, but do not directly prove owner-safe stacking boundaries.

## Updated Scope

1. Update stack grouping in `packages/runner/src/canvas/renderers/token-renderer.ts` so ownership-distinct tokens cannot merge into a shared stack.
2. Make grouping deterministic and robust against key-collision ambiguity (use structured keying instead of ad hoc concatenation).
3. Preserve current optimization behavior:
   - non-selectable, non-selected equivalent tokens stack with count badge.
   - selectable or selected tokens remain unstacked and individually targetable.
4. Keep interaction and container-map semantics deterministic for hover/select dispatch.

## Invariants

1. Tokens with different ownership semantics are never merged into the same stack.
2. Tokens equivalent under render/interaction semantics still stack.
3. Stacked token counts remain accurate after add/remove/reorder updates.
4. Selectable/selected tokens remain unstacked and individually targetable.
5. Stack keying is deterministic and collision-safe.

## Tests That Should Pass

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
   - New case: same `zone/type/faction/faceUp` but different `ownerID` do not merge.
   - Regression case: equivalent non-selectable tokens still merge and show count badge.
   - Regression case: handler rebinding remains correct when representative token changes.
2. `packages/runner/test/canvas/GameCanvas.test.ts` (only if needed)
   - Add/update case only if integration-level hover/select identity regression is observed after renderer change.
3. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion Date**: 2026-02-18
- **What changed**:
  - Updated `token-renderer` stack keying to structured, collision-safe grouping that includes `ownerID`.
  - Preserved existing optimization behavior for non-selectable/non-selected tokens.
  - Added owner-separation regression coverage and key-collision regression coverage in token renderer tests.
- **Deviations from original plan**:
  - No `GameCanvas` test changes were required because no integration-level hover/select regression was observed after the renderer fix.
  - Scope stayed runner-only and localized to token renderer + renderer tests.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- packages/runner/test/canvas/renderers/token-renderer.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
