# 88PHAAWAACTFIL-004: Introduce shared action-pipeline lookup for hot-path kernel callers

**Status**: ✅ COMPLETED
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

1. The remaining active tickets in `tickets/` are `88PHAAWAACTFIL-002.md`, `88PHAAWAACTFIL-003.md`, and this ticket. `002` and `003` are stale leftovers from the earlier phase-index split and are already superseded by archived `88PHAAWAACTFIL-001.md`; they do not own the current action-pipeline lookup work.
2. `GameDef.actionPipelines` is an optional stable `readonly ActionPipelineDef[]` reference, suitable for a module-level WeakMap cache keyed on the array reference, matching the existing lookup-cache pattern already used by `def-lookup.ts` and `phase-action-index.ts`.
3. The repeated scans are real and broader than the original ticket text claimed:
   - `packages/engine/src/kernel/legal-moves.ts` uses direct `(def.actionPipelines ?? []).some(...)` membership checks in the free-operation path, the early-exit trivial-action pass, and the main phase-aware enumeration pass.
   - `packages/engine/src/kernel/action-applicability-preflight.ts` uses `.some()` for selector-contract `hasPipeline` evaluation.
   - `packages/engine/src/kernel/apply-move-pipeline.ts` uses `.filter()` to gather per-action pipeline candidates for dispatch.
4. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts`, `packages/engine/test/unit/kernel/apply-move-pipeline.test.ts`, and `packages/engine/test/unit/kernel/legal-moves.test.ts` already exist and are the correct ownership points for this refactor. The file list in the original ticket was stale.
5. `legal-moves.ts` already uses the dedicated phase index from archived `88PHAAWAACTFIL-001`; this ticket should complement that architecture, not introduce a parallel or overlapping indexing story.
6. `docs/FOUNDATIONS.md` requires generic schema ownership, no backwards-compatibility shims, and architecturally complete fixes. A shared generic runtime lookup aligns with those constraints better than leaving each caller to rescan the raw array.

## Architecture Check

1. A dedicated action-pipeline lookup module is cleaner than scattering `.some()` and `.filter()` calls across runtime callers. It establishes one ownership point for pipeline indexing and keeps callers declarative.
2. The lookup is derived entirely from generic `GameDef.actionPipelines` data. It preserves engine agnosticism and does not introduce any game-specific branching or per-game schema.
3. The more robust architecture is to make `apply-move-pipeline.ts` the canonical owner of per-action pipeline candidate retrieval via the new shared lookup, then have other runtime callers read the same lookup for membership checks. This is better than optimizing only `legal-moves.ts`, because `resolveActionPipelineDispatch()` is also used from `apply-move.ts`.
4. The correct architecture is a shared lookup module, not incremental aliases, caller-local caches, or test-only exports. No backwards-compatibility shims, alternate APIs, or duplicate fallback paths should be introduced.
5. Scope should stay focused on runtime ownership points that currently duplicate the work. Broader non-hot-path cleanup in annotators/validators can be a separate follow-up if desired.

## What to Change

### 1. Create `packages/engine/src/kernel/action-pipeline-lookup.ts`

- Export a lookup shape that answers both questions current callers need:
  - whether an action has any pipeline
  - which pipeline profiles belong to one action
- Cache the lookup in a module-level `WeakMap` keyed by `def.actionPipelines`.
- Recommended surface:
  - `getActionPipelineLookup(def: GameDef): ActionPipelineLookup`
  - `ActionPipelineLookup` includes `byActionId: ReadonlyMap<ActionId, readonly ActionPipelineDef[]>`
  - export convenience helpers for canonical usage rather than having callers inspect the map ad hoc:
    - `hasActionPipeline(def: GameDef, actionId: ActionId): boolean`
    - `getActionPipelinesForAction(def: GameDef, actionId: ActionId): readonly ActionPipelineDef[]`
- When `def.actionPipelines` is `undefined` or empty, return a stable empty lookup rather than allocating per call.

### 2. Replace hot-path raw scans with lookup reads

- Update `packages/engine/src/kernel/legal-moves.ts` to replace the current `.some()` checks with canonical lookup helpers.
- Update `packages/engine/src/kernel/action-applicability-preflight.ts` to replace selector-contract `hasPipeline` scanning with the shared lookup helper.
- Update `packages/engine/src/kernel/apply-move-pipeline.ts` so `resolveActionPipelineDispatch()` reads pre-grouped candidates from the shared lookup instead of filtering the full array. Because `resolveActionPipelineDispatch()` is reused by `apply-move.ts`, this gives the cleaner runtime architecture than optimizing only legal-move enumeration.
- Preserve current behavior exactly:
  - selector-contract evaluation still sees the same `hasPipeline` truth value
  - pipeline dispatch still preserves current applicability ordering
  - empty/no-pipeline cases still resolve to `noneConfigured`

### 3. Add tests that prove both lookup behavior and caller adoption

- Add focused lookup tests for grouping, empty lookup behavior, and cache identity.
- Extend existing unit tests for `action-applicability-preflight`, `apply-move-pipeline`, and `legal-moves` rather than creating parallel stale file names.
- Add source-guard tests for the runtime ownership points so raw `.some()` / `.filter()` scans over `def.actionPipelines` are not reintroduced in these modules.
- Add behavior tests around pipeline dispatch/preflight parity so the lookup refactor is proven to be observationally neutral.

## Files to Touch

- `packages/engine/src/kernel/action-pipeline-lookup.ts` (new)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/apply-move-pipeline.ts` (modify)
- `packages/engine/test/unit/kernel/action-pipeline-lookup.test.ts` (new)
- `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move-pipeline.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Changing `GameDef`, `GameDefRuntime`, or schema artifacts.
- Exporting private helpers solely for tests.
- Broad cleanup of non-runtime `.filter()` uses in validator/annotator modules unless they become directly necessary to avoid duplication in the new lookup ownership model.
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
3. Runtime ownership points (`legal-moves.ts`, `action-applicability-preflight.ts`, and `apply-move-pipeline.ts`) do not rescan `def.actionPipelines` directly once the shared lookup is introduced.
4. The lookup remains generic and game-agnostic, derived only from `GameDef.actionPipelines`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/action-pipeline-lookup.test.ts` — proves grouping, empty lookup handling, and WeakMap cache semantics.
2. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — proves selector-contract / applicability behavior is unchanged after lookup adoption.
3. `packages/engine/test/unit/kernel/apply-move-pipeline.test.ts` — proves dispatch order and matching behavior remain unchanged while candidates come from the shared lookup.
4. `packages/engine/test/unit/kernel/legal-moves.test.ts` — guards against reintroducing raw pipeline membership scans in legal-move enumeration.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/action-pipeline-lookup.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/apply-move-pipeline.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`
8. `pnpm turbo test`

## Outcome

Completed: 2026-03-28

What actually changed:
- Added `packages/engine/src/kernel/action-pipeline-lookup.ts` as the canonical WeakMap-cached runtime lookup for `GameDef.actionPipelines`, with shared helpers for membership and per-action candidate retrieval.
- Replaced direct runtime scans in `packages/engine/src/kernel/legal-moves.ts` and `packages/engine/src/kernel/action-applicability-preflight.ts` with lookup-based reads.
- Updated `packages/engine/src/kernel/apply-move-pipeline.ts` so pipeline dispatch reads grouped candidates from the shared lookup, which also improves the `apply-move.ts` call path indirectly through the existing dispatch API.
- Added focused lookup tests and source-guard coverage in the existing kernel unit tests so raw runtime scans are not reintroduced at these ownership points.

Deviations from original plan:
- The corrected ticket broadened the architectural framing slightly from "hot-path callers" to the actual runtime ownership points. This was the cleaner design because `resolveActionPipelineDispatch()` is already shared by `legal-moves.ts` and `apply-move.ts`.
- The implementation used canonical helper exports (`hasActionPipeline`, `getActionPipelinesForAction`) rather than making each caller access the lookup map directly.

Verification results:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/action-pipeline-lookup.test.js`
- `node --test packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js`
- `node --test packages/engine/dist/test/unit/kernel/apply-move-pipeline.test.js`
- `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
