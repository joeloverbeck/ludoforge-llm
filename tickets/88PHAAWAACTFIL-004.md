# 88PHAAWAACTFIL-004: Introduce shared action-pipeline lookup for hot-path kernel callers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel lookup module and hot-path caller cleanup
**Deps**: specs/88-phase-aware-action-filtering.md, archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-001.md

## Problem

After phase-aware action filtering landed, the next avoidable hot-path cost is repeated linear scanning of `def.actionPipelines`.

Today multiple kernel callers recompute pipeline membership or candidates by scanning the full pipeline array:
- `legal-moves.ts` uses `.some()` to decide whether an action has any pipeline.
- `action-applicability-preflight.ts` uses `.some()` for selector-contract checks.
- `apply-move-pipeline.ts` uses `.filter()` to gather the candidate pipelines for one action.

This duplicates work, spreads ownership of the same lookup logic across modules, and leaves hot-path callers paying repeated O(all_pipelines) scans for data that is already structurally static inside `GameDef`.

## Assumption Reassessment (2026-03-28)

1. The remaining active tickets in `tickets/` are `88PHAAWAACTFIL-002.md` and `88PHAAWAACTFIL-003.md`; neither owns this issue. `002` is stale integration work already subsumed by archived `001`, and `003` is stale test-splitting with outdated assumptions about testing private helpers.
2. `GameDef.actionPipelines` is an optional stable `readonly ActionPipelineDef[]` reference at `packages/engine/src/kernel/types-core.ts:556`, suitable for a module-level WeakMap cache keyed on the array reference, matching the existing lookup-cache pattern.
3. The repeated scans are real and current:
   - `packages/engine/src/kernel/legal-moves.ts` uses `.some()` in at least three hot-path sites.
   - `packages/engine/src/kernel/action-applicability-preflight.ts` uses `.some()` for `hasActionPipeline`.
   - `packages/engine/src/kernel/apply-move-pipeline.ts` uses `.filter()` to gather profiles for one action.
4. `docs/FOUNDATIONS.md` requires generic schema ownership, no backwards-compatibility shims, and architecturally complete fixes. A shared generic lookup aligns with those constraints better than leaving each caller to rescan the raw array.

## Architecture Check

1. A dedicated action-pipeline lookup module is cleaner than scattering `.some()` and `.filter()` calls across hot-path modules. It establishes one ownership point for pipeline indexing and keeps callers declarative.
2. The lookup is derived entirely from generic `GameDef.actionPipelines` data. It preserves engine agnosticism and does not introduce any game-specific branching or per-game schema.
3. The correct architecture is a shared lookup module, not incremental aliases or caller-local caches. No backwards-compatibility shims, alternate APIs, or duplicate fallback paths should be introduced.
4. Scope should stay focused on the runtime/hot-path callers that currently duplicate the work. Broader non-hot-path cleanup in annotators/validators can be separate if desired.

## What to Change

### 1. Create `packages/engine/src/kernel/action-pipeline-lookup.ts`

- Export a lookup shape that answers both questions current callers need:
  - whether an action has any pipeline
  - which pipeline profiles belong to one action
- Cache the lookup in a module-level `WeakMap` keyed by `def.actionPipelines`.
- Recommended surface:
  - `getActionPipelineLookup(def: GameDef): ActionPipelineLookup`
  - `ActionPipelineLookup` includes `byActionId: ReadonlyMap<ActionId, readonly ActionPipelineDef[]>`
  - optional convenience helpers are acceptable if they reduce caller branching without duplicating state
- When `def.actionPipelines` is `undefined` or empty, return a stable empty lookup rather than allocating per call.

### 2. Replace hot-path raw scans with lookup reads

- Update `packages/engine/src/kernel/legal-moves.ts` to replace the current `.some()` checks with lookup-based reads.
- Update `packages/engine/src/kernel/action-applicability-preflight.ts` to replace `hasActionPipeline` scanning with the shared lookup.
- Update `packages/engine/src/kernel/apply-move-pipeline.ts` so `resolveActionPipelineDispatch()` reads pre-grouped candidates from the lookup instead of filtering the full array.
- Preserve current behavior exactly:
  - selector-contract evaluation still sees the same `hasPipeline` truth value
  - pipeline dispatch still preserves current applicability ordering
  - empty/no-pipeline cases still resolve to `noneConfigured`

### 3. Add tests that prove both lookup behavior and caller adoption

- Add focused lookup tests for grouping, empty lookup behavior, and cache identity.
- Add source-guard tests for the hot-path modules so raw `.some()` / `.filter()` scans over `def.actionPipelines` are not reintroduced in these ownership points.
- Add at least one behavior test around pipeline dispatch/preflight parity so the lookup refactor is proven to be observationally neutral.

## Files to Touch

- `packages/engine/src/kernel/action-pipeline-lookup.ts` (new)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/apply-move-pipeline.ts` (modify)
- `packages/engine/test/unit/kernel/action-pipeline-lookup.test.ts` (new)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move-pipeline.test.ts` (modify)

## Out of Scope

- Changing `GameDef`, `GameDefRuntime`, or schema artifacts.
- Exporting private helpers solely for tests.
- Broad cleanup of non-hot-path `.filter()` uses in validator/annotator modules unless they become directly necessary to avoid duplication in the new lookup ownership model.
- Performance benchmarking or target percentages in this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Dedicated lookup tests prove correct grouping, empty lookup behavior, and cache identity.
2. Existing pipeline behavior tests continue to pass with no semantic changes.
3. Existing suite: `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

### Invariants

1. Pipeline candidate ordering for a given action remains the same as the source `def.actionPipelines` order.
2. No new fields are added to `GameDefRuntime`, `GameDef`, or `ActionPipelineDef`.
3. Hot-path callers do not rescan `def.actionPipelines` directly once the shared lookup is introduced.
4. The lookup remains generic and game-agnostic, derived only from `GameDef.actionPipelines`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/action-pipeline-lookup.test.ts` — proves grouping, empty lookup handling, and WeakMap cache semantics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — guards against reintroducing raw pipeline membership scans in legal-move enumeration.
3. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — proves selector-contract / applicability behavior is unchanged after lookup adoption.
4. `packages/engine/test/unit/kernel/apply-move-pipeline.test.ts` — proves dispatch order and matching behavior remain unchanged while candidates come from the shared lookup.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/action-pipeline-lookup.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/apply-move-pipeline.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`
8. `pnpm turbo test`
