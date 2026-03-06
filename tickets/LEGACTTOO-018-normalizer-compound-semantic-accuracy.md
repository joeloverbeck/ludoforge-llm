# LEGACTTOO-018: Normalizer Compound Semantic Accuracy — removeByPriority Groups and chooseN Fallback

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-normalizer.ts`
**Deps**: `archive/tickets/LEGACTTOO/LEGACTTOO-005-compound-normalizer-control-flow-macros-stages.md`

## Problem

Two compound normalizer rules emit semantically inaccurate tooltip messages:

1. **`normalizeRemoveByPriority`** only examines `groups[0].to` for the destination, silently discarding all other priority groups. In games like FITL, priority-based removal (e.g., "remove guerrillas before bases") is mechanically significant — the tooltip should communicate the priority ordering, not just the first group's target.

2. **`normalizeChooseN` fallback** emits `{ kind: 'select', target: 'spaces' }` when `options` is neither a space query nor a token query (e.g., `enums` or future query types). This is semantically wrong — an enum-based `chooseN` is not selecting spaces.

## Assumption Reassessment (2026-03-06)

1. `removeByPriority` AST shape confirmed: `{ budget, groups: Array<{ filter, to }>, in? }` — `groups` is an ordered array where index = priority rank.
2. `OptionsQuery` confirmed to have multiple `query` variants beyond spaces/tokens: `enums`, `mapSpaces`, `zones`, `adjacentZones`, `tokensInZone`, `tokensInMapSpaces`, `tokensInAdjacentZones`.
3. `SelectMessage.target` is typed `'spaces' | 'zones'` — needs extension to support a generic `'items'` target or query-specific targets.

## Architecture Check

1. Fixing these makes the normalizer a more faithful translator of EffectAST → TooltipMessage. Downstream consumers (content planner, template realizer) will have richer, more accurate data to work with.
2. No game-specific logic — the fix is purely about correctly mapping generic AST structures to generic IR messages.
3. No backwards compatibility — `SelectMessage.target` union will be extended, not aliased.

## What to Change

### 1. Extend `SelectMessage.target` in `tooltip-ir.ts`

Add `'items'` (or replace with a broader union) to `SelectMessage.target` so non-spatial `chooseN` queries get a correct target.

### 2. Fix `normalizeChooseN` fallback

Instead of defaulting to `'spaces'`, inspect `options.query` and map to the correct target. For `enums` and any unrecognized query, use `'items'`.

### 3. Enrich `normalizeRemoveByPriority` output

Emit one `RemoveMessage` per priority group (preserving order) instead of collapsing to a single message from `groups[0]`. Each message should indicate priority rank.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — extend `SelectMessage.target`)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — fix `normalizeChooseN` fallback and `normalizeRemoveByPriority`)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add/update tests)

## Out of Scope

- Template realization of multi-group removal (LEGACTTOO-007)
- Content planner grouping logic (LEGACTTOO-006)

## Acceptance Criteria

### Tests That Must Pass

1. `chooseN` with `enums` query emits `{ target: 'items' }`, not `'spaces'`
2. `removeByPriority` with 2+ groups emits one `RemoveMessage` per group with correct priority ordering
3. `removeByPriority` with single group still works correctly
4. Existing suite: `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`

### Invariants

1. `SelectMessage.target` union covers all `OptionsQuery.query` variants meaningfully
2. No priority information is lost during normalization

## Test Plan

### New/Modified Tests

1. `tooltip-normalizer.test.ts` — `chooseN with enums options emits items target` — validates correct target for non-spatial queries
2. `tooltip-normalizer.test.ts` — `removeByPriority with multiple groups emits per-group messages` — validates priority ordering preservation
3. `tooltip-normalizer.test.ts` — update existing `removeByPriority` test if output shape changes

### Commands

1. `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`
2. `pnpm turbo build && pnpm turbo test`
