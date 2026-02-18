# AGNOSTIC-008: De-duplicate Pointer Hover Dispatch in Canvas Interaction Handlers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## What Needs to Change

1. Refactor zone/token hover handler registration so each user hover transition emits a single enter/leave event.
2. Remove redundant event bindings that cause duplicate callbacks for the same pointer transition.
3. Keep cross-input compatibility for pointer, mouse, and touch without regressing selection interactions.
4. Ensure tooltip anchor update cadence remains stable under pan/zoom and hover transitions.

## Invariants

1. Hover enter and leave callbacks fire once per logical transition.
2. Zone/token selection click behavior remains unchanged.
3. Drag-intent suppression behavior for selection remains unchanged.
4. Tooltip state does not flicker due to duplicate hover events.

## Tests That Should Pass

1. `packages/runner/test/canvas/interactions/zone-select.test.ts`
   - Update expectations for exactly one hover callback per transition.
2. `packages/runner/test/canvas/interactions/token-select.test.ts`
   - Add/verify symmetric single-dispatch behavior for tokens.
3. `packages/runner/test/ui/TooltipLayer.test.ts` (or integration-level hover/tooltip tests)
   - New regression case: no duplicate anchor updates from one pointer entry.
4. `pnpm -F @ludoforge/runner test`

