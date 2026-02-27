# ACTTOOSYS-003: Live Condition Annotator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new module in `packages/engine/src/kernel/`
**Deps**: ACTTOOSYS-001, ACTTOOSYS-002

## Problem

The tooltip needs to show live pass/fail status for each precondition and current limit usage counts. This requires evaluating conditions against the current `GameState` and annotating the static display tree with `DisplayAnnotationNode` entries. The annotator bridges the static display tree (from ACTTOOSYS-002) with the kernel's existing `evalCondition` and `evalValue` functions.

## Assumption Reassessment (2026-02-27)

1. `evalCondition(cond: ConditionAST, ctx: EvalContext): boolean` exists in `packages/engine/src/kernel/eval-condition.ts`. Confirmed.
2. `evalValue(expr: ValueExpr, ctx: EvalContext): number | boolean | string` exists in `packages/engine/src/kernel/eval-value.ts`. Confirmed.
3. `EvalContext` (from `eval-context.ts:14-26`) requires: `def`, `adjacencyGraph`, `state`, `activePlayer`, `actorPlayer`, `bindings`, `runtimeTableIndex`, `collector`. The `bindings` field is `Readonly<Record<string, unknown>>` — empty object `{}` is valid for actions without move params.
4. `GameDefRuntime` (from `gamedef-runtime.ts`) provides `adjacencyGraph` and `runtimeTableIndex`. Confirmed.
5. `createCollector(options?: ExecutionOptions): ExecutionCollector` from `execution-collector.ts` — passing `{ trace: false }` creates a lightweight collector suitable for read-only evaluation. Confirmed.
6. `ActionDef.limits` is `readonly LimitDef[]`. `LimitDef` has `scope: 'turn' | 'phase' | 'game'` and `max: number`. Action usage is tracked in `GameState.actionUsage` (a map of action ID → usage counts by scope).
7. `AnnotatedActionDescription` and `LimitUsageInfo` types are defined in ACTTOOSYS-001's `display-node.ts`.

## Architecture Check

1. The annotator takes the static display tree and mutates nothing — it produces a new tree with annotation nodes appended to condition lines. This follows the kernel's immutability convention.
2. All evaluation uses existing kernel functions (`evalCondition`, `evalValue`) — no duplicated evaluation logic.
3. Game-agnostic: the annotator works with any `ActionDef` regardless of which game compiled it.
4. When `evalCondition` throws (e.g., unbound move parameter), the annotator catches and produces a `'fail'` annotation with text `"depends on choice"` rather than propagating the error.

## What to Change

### 1. Create `packages/engine/src/kernel/condition-annotator.ts`

Define and export:

```typescript
interface AnnotationContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly runtime: GameDefRuntime;
}

function describeAction(action: ActionDef, ctx: AnnotationContext): AnnotatedActionDescription;
```

Implementation of `describeAction`:
1. Call `actionDefToDisplayTree(action)` to get the static `DisplayGroupNode[]`.
2. Build an `EvalContext` from `AnnotationContext`:
   - `def: ctx.def`
   - `adjacencyGraph: ctx.runtime.adjacencyGraph`
   - `state: ctx.state`
   - `activePlayer: ctx.activePlayer`
   - `actorPlayer: ctx.activePlayer` (use activePlayer as actor — tooltip evaluates from the acting player's perspective)
   - `bindings: {}` (empty — no move params bound yet)
   - `runtimeTableIndex: ctx.runtime.runtimeTableIndex`
   - `collector: createCollector({ trace: false })`
3. Find the "Preconditions" group in sections. Walk it recursively:
   - For each condition, call `evalCondition(cond, evalCtx)` inside try/catch.
   - If succeeds: append `DisplayAnnotationNode` with `annotationType: 'pass'`, `text: '✓'`
   - If fails (returns false): append annotation with `annotationType: 'fail'`, `text: '✗'`
   - If throws: append annotation with `annotationType: 'fail'`, `text: 'depends on choice'`
   - For comparison conditions (`==`, `!=`, `<`, etc.): also try `evalValue` on left and right to show current values as `'value'` annotations.
4. Find the "Limits" group. For each limit on the action:
   - Look up `state.actionUsage` for this action's ID and the limit's scope.
   - Produce `LimitUsageInfo` entry: `{ scope, max, current }`.
   - Append `'usage'` annotation to the limit line: `"used N / max"`.
5. Return `{ sections: annotatedSections, limitUsage }`.

The annotator must not evaluate costs or effects — those show what *will* happen, not current state.

**Internal helper (not exported):**
- `annotateConditionGroup(group: DisplayGroupNode, cond: ConditionAST, evalCtx: EvalContext): DisplayGroupNode` — recursively annotates condition nodes.

To correlate display nodes with their source AST nodes, the annotator needs to walk the `ConditionAST` in parallel with the display tree. The `actionDefToDisplayTree` call and the original `action.pre` AST are both available, so the annotator walks them in lockstep.

### 2. Export from `packages/engine/src/kernel/runtime.ts`

Append one line:
```typescript
export * from './condition-annotator.js';
```

## Files to Touch

- `packages/engine/src/kernel/condition-annotator.ts` (new)
- `packages/engine/src/kernel/runtime.ts` (modify — add one export line)

## Out of Scope

- Modifying `evalCondition`, `evalValue`, or any existing kernel evaluation code
- Annotating costs or effects (they remain static display)
- Worker API integration (ACTTOOSYS-004)
- Any runner/UI code
- Handling move parameters (bindings are empty — conditions depending on params get "depends on choice")

## Acceptance Criteria

### Tests That Must Pass

1. **Pass annotation**: Given a `GameState` where a precondition is met, `describeAction` produces a `'pass'` annotation on the corresponding condition line.
2. **Fail annotation**: Given a `GameState` where a precondition fails, `describeAction` produces a `'fail'` annotation.
3. **Value annotation on comparisons**: For a comparison condition like `gvar('gold') >= 5`, when gold is 3, the annotation includes current value text (e.g., `"current: 3"`).
4. **Error-safe annotation**: A condition referencing an unbound binding produces `annotationType: 'fail'` with `text: 'depends on choice'` instead of throwing.
5. **Limit usage**: Given an action with `limits: [{ scope: 'turn', max: 2 }]` and `actionUsage` showing 1 use this turn, `limitUsage` contains `{ scope: 'turn', max: 2, current: 1 }`.
6. **No cost/effect annotations**: Costs and Effects groups have no annotation nodes.
7. **Null precondition**: Action with `pre: null` produces no Preconditions group and returns empty limitUsage if no limits.
8. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
9. Build: `pnpm -F @ludoforge/engine build` — no errors.

### Invariants

1. `describeAction` never throws — all evaluation errors are caught and converted to annotations.
2. The returned `AnnotatedActionDescription` is structured-clone-safe (same constraint as DisplayNode).
3. No mutation of the input `ActionDef`, `GameState`, or `GameDef`.
4. The `EvalContext.collector` uses `trace: false` — no side effects from annotation.
5. No game-specific logic in the annotator.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — tests using minimal `GameDef`/`GameState` fixtures from test helpers. Use `effect-context-test-helpers.ts` or `gamedef-fixtures.ts` to construct minimal contexts.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
