# LEGACTTOO-008: Engine Integration — describeAction Returns ActionTooltipPayload + RuleCard Caching

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — modify `condition-annotator.ts`, `gamedef-runtime.ts`, `kernel/index.ts`
**Deps**: LEGACTTOO-004, LEGACTTOO-005, LEGACTTOO-006, LEGACTTOO-007

## Problem

The normalizer, planner, realizer, and blocker extractor exist as standalone modules but are not wired into the engine's `describeAction()` public API. Currently `describeAction` returns `AnnotatedActionDescription` (DisplayNode trees). It needs to additionally return `ActionTooltipPayload` containing the English RuleCard (cached) and dynamic RuleState (computed per call).

## Assumption Reassessment (2026-03-06)

1. `describeAction` at `packages/engine/src/kernel/condition-annotator.ts:277` returns `AnnotatedActionDescription` with `{ sections, limitUsage }`. The runner's `useActionTooltip` and `game-worker-api.ts` both consume this type.
2. `GameDefRuntime` at `packages/engine/src/kernel/gamedef-runtime.ts:15` is a simple struct with `adjacencyGraph`, `runtimeTableIndex`, `zobristTable`. It has no mutable caches currently — adding a RuleCard cache requires either a mutable Map or a new lazy-init pattern.
3. The runner imports `describeAction` as `engineDescribeAction` at `packages/runner/src/worker/game-worker-api.ts:6`.

## Architecture Check

1. **Static/dynamic split**: RuleCard is deterministic per (GameDef, actionId) pair — compute once, cache in runtime. RuleState depends on current GameState — compute every call.
2. RuleCard cache uses a `Map<string, RuleCard>` on GameDefRuntime. Since GameDefRuntime is created once per GameDef load, the cache lifetime matches the GameDef lifetime.
3. The return type change is additive: `AnnotatedActionDescription` gains an optional `tooltipPayload?: ActionTooltipPayload` field. This preserves backwards compatibility — existing consumers that don't read `tooltipPayload` are unaffected.

## What to Change

### 1. Extend `AnnotatedActionDescription` in `condition-annotator.ts`

Add optional field:
```typescript
export interface AnnotatedActionDescription {
  readonly sections: readonly DisplayGroupNode[];
  readonly limitUsage: readonly LimitUsageInfo[];
  readonly tooltipPayload?: ActionTooltipPayload;
}
```

### 2. Add RuleCard cache to `GameDefRuntime`

In `packages/engine/src/kernel/gamedef-runtime.ts`:
- Add `readonly ruleCardCache: Map<string, RuleCard>` to `GameDefRuntime` (mutable Map for lazy population, but the RuleCards themselves are immutable).
- Initialize as empty Map in `createGameDefRuntime`.

### 3. Wire tooltip pipeline into `describeAction`

In the `describeAction` function body, after existing annotation logic:
1. Check `runtime.ruleCardCache` for cached RuleCard for this action id.
2. If miss: normalize action → plan content → realize → store in cache.
3. Compute RuleState: run blocker extractor on preconditions with current eval context, determine active modifiers from current state, read limit usage from existing `limitUsage` computation.
4. Attach `{ ruleCard, ruleState }` as `tooltipPayload` on the return value.
5. Wrap in try/catch — if tooltip pipeline throws, omit `tooltipPayload` (graceful degradation).

### 4. Update `kernel/index.ts` exports

Ensure `ActionTooltipPayload` and related types are exported.

## Files to Touch

- `packages/engine/src/kernel/condition-annotator.ts` (modify — add tooltip pipeline, extend return type)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add ruleCardCache)
- `packages/engine/src/kernel/index.ts` (modify — verify exports)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — add tests for tooltipPayload)
- `packages/engine/test/integration/tooltip-integration.test.ts` (new)

## Out of Scope

- Runner-side consumption of `tooltipPayload` (LEGACTTOO-009)
- Worker API changes (LEGACTTOO-009)
- Verbalization content authoring (LEGACTTOO-010, LEGACTTOO-011)
- Modifying `AnnotatedActionDescription` consumers other than adding the optional field
- DisplayNode tree generation (unchanged — existing logic preserved)

## Acceptance Criteria

### Tests That Must Pass

1. `describeAction` returns `tooltipPayload` with defined `ruleCard` and `ruleState` when GameDef has verbalization.
2. `describeAction` returns `tooltipPayload: undefined` when GameDef has no verbalization (graceful fallback).
3. RuleCard caching: calling `describeAction` twice for same action id returns the same RuleCard object (reference equality).
4. RuleState varies: calling `describeAction` with different GameState produces different `ruleState.available` values.
5. Existing `sections` and `limitUsage` fields unchanged — no regression in DisplayNode output.
6. Error resilience: if normalizer throws on a malformed action, `describeAction` still returns valid `sections`/`limitUsage` with `tooltipPayload: undefined`.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `describeAction` never throws — existing safety net preserved. Tooltip pipeline errors are caught and result in `tooltipPayload: undefined`.
2. RuleCard cache is keyed by action id — no stale RuleCards across different GameDefs (cache is scoped to GameDefRuntime instance).
3. Existing `AnnotatedActionDescription` consumers are unaffected (field is optional).
4. `sections` and `limitUsage` output is identical to pre-change behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — add tests for `tooltipPayload` presence/absence, caching behavior, error resilience.
2. `packages/engine/test/integration/tooltip-integration.test.ts` — full pipeline: compile game spec → create runtime → describeAction → verify tooltipPayload contains English RuleCard.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
