# LEGACTTOO-008: Engine Integration — describeAction Returns ActionTooltipPayload + RuleCard Caching

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — modify `condition-annotator.ts`, `gamedef-runtime.ts`, `kernel/index.ts`
**Deps**: LEGACTTOO-004, LEGACTTOO-005, LEGACTTOO-006, LEGACTTOO-007

## Problem

The normalizer, planner, realizer, and blocker extractor exist as standalone modules but are not wired into the engine's `describeAction()` public API. Currently `describeAction` returns `AnnotatedActionDescription` (DisplayNode trees). It needs to additionally return `ActionTooltipPayload` containing the English RuleCard (cached) and dynamic RuleState (computed per call).

## Assumption Reassessment (2026-03-07)

1. `describeAction` at `packages/engine/src/kernel/condition-annotator.ts:277` returns `AnnotatedActionDescription` with `{ sections, limitUsage }`. The runner's `useActionTooltip` and `game-worker-api.ts` both consume this type.
2. `AnnotatedActionDescription` is defined in `packages/engine/src/kernel/display-node.ts:82` (NOT in `condition-annotator.ts`).
3. `GameDefRuntime` at `packages/engine/src/kernel/gamedef-runtime.ts:15` is a simple struct with `adjacencyGraph`, `runtimeTableIndex`, `zobristTable`. Adding a mutable `Map` for RuleCard caching is acceptable — the cache is a lazy memo of a pure function of (GameDef, actionId), scoped to the runtime's lifetime.
4. `GameDef` already has `verbalization?: VerbalizationDef` at `types-core.ts:285` (added by LEGACTTOO-001/002).
5. The runner imports `describeAction` as `engineDescribeAction` at `packages/runner/src/worker/game-worker-api.ts:6`.

## Architecture Check

1. **Static/dynamic split**: RuleCard is deterministic per (GameDef, actionId) pair — compute once, cache in runtime. RuleState depends on current GameState — compute every call.
2. RuleCard cache uses a `Map<string, RuleCard>` on GameDefRuntime. Since GameDefRuntime is created once per GameDef load, the cache lifetime matches the GameDef lifetime.
3. The return type change is additive: `AnnotatedActionDescription` gains an optional `tooltipPayload?: ActionTooltipPayload` field. Optionality is for **error resilience** — if the tooltip pipeline throws, the existing DisplayNode output is still returned with `tooltipPayload: undefined`.
4. **Modifier condition propagation**: `ModifierMessage` and `ContentModifier` gain `conditionAST?: ConditionAST` so `describeAction` can evaluate modifier conditions at runtime to populate `RuleState.activeModifierIndices`.

## What to Change

### 1. Extend `AnnotatedActionDescription` in `display-node.ts`

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

- `packages/engine/src/kernel/display-node.ts` (modify — add `tooltipPayload` to `AnnotatedActionDescription`)
- `packages/engine/src/kernel/condition-annotator.ts` (modify — wire tooltip pipeline into `describeAction`)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add ruleCardCache)
- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `conditionAST` to `ModifierMessage`)
- `packages/engine/src/kernel/tooltip-rule-card.ts` (modify — add `conditionAST` to `ContentModifier`)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — propagate `conditionAST` in `normalizeIf`)
- `packages/engine/src/kernel/kernel/index.ts` (verify — exports already present)
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
2. `describeAction` returns `tooltipPayload` even when GameDef has no verbalization (auto-humanization fallback).
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

## Outcome

**Completed**: 2026-03-07

### What Changed

1. **`display-node.ts`**: Added optional `tooltipPayload?: ActionTooltipPayload` to `AnnotatedActionDescription`.
2. **`gamedef-runtime.ts`**: Added `ruleCardCache: Map<string, RuleCard>` to `GameDefRuntime` interface and factory.
3. **`condition-annotator.ts`**: Wired tooltip pipeline into `describeAction` via three new helper functions: `buildRuleCard` (with lazy memoization), `buildRuleState` (blocker extraction + active modifier detection), and `buildTooltipPayload` (error-resilient wrapper). `AnnotationContext` gained `runtime: GameDefRuntime`.
4. **`tooltip-ir.ts`**: Added `conditionAST?: ConditionAST` to `ModifierMessage`.
5. **`tooltip-rule-card.ts`**: Added `conditionAST?: ConditionAST` to `ContentModifier`.
6. **`tooltip-normalizer-compound.ts`**: Propagated `conditionAST` through `normalizeIf`.
7. **`tooltip-template-realizer.ts`**: Propagated `conditionAST` through `realizeModifiers`.

### Tests Added

- **Unit** (`condition-annotator.test.ts`): 9 new tests (#17–#25) covering tooltipPayload presence, caching, RuleState variation, activeModifierIndices, verbalization labels, structuredClone safety, and no-regression on existing fields.
- **Integration** (`tooltip-pipeline-integration.test.ts`): 5 new tests — full FITL/Texas pipeline (compile → runtime → describeAction → verify tooltipPayload), RuleCard caching across calls, verbalization label appearance in synopsis, structuredClone safety.

### Deviations from Original Plan

- **conditionAST propagation** was not in the original ticket scope but was required for `activeModifierIndices` to work. Added to `ModifierMessage`, `ContentModifier`, `normalizeIf`, and `realizeModifiers`.
- **Ticket corrected**: Original ticket incorrectly stated `AnnotatedActionDescription` was in `condition-annotator.ts` (actually `display-node.ts`). Original acceptance criterion #2 said "tooltipPayload undefined when no verbalization" — corrected to "tooltipPayload present even without verbalization" since auto-humanization works as fallback.
- Integration test file named `tooltip-pipeline-integration.test.ts` (not `tooltip-integration.test.ts`).

### Verification

- 4073 engine tests pass (0 failures)
- Typecheck clean (3/3 packages)
- Lint clean (2/2 packages)
