# 120WIDCOMEXP-006: Widen application sites — action pre, triggers, terminal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/` (multiple files)
**Deps**: `tickets/120WIDCOMEXP-005.md`

## Problem

Compiled condition predicates are currently applied only at pipeline legality/cost sites (`pipeline-viability-policy.ts`). All other `evalCondition` call sites — action `pre` conditions (7 sites across 4 files), trigger `match`/`when` (2 sites), terminal conditions (3 sites), and enumeration snapshot conditions — use the interpreter unconditionally. These sites account for a significant share of the ~19% CPU spent on interpretive evaluation. Integrating compiled predicate lookup at these sites completes the compilation pipeline.

## Assumption Reassessment (2026-04-09)

1. Action `pre` `evalCondition` calls confirmed at:
   - `legal-moves.ts:482,486` (2 sites)
   - `legal-choices.ts:897,905` (2 sites)
   - `apply-move.ts:883,1845` (2 sites)
   - `free-operation-viability.ts:423` (1 site)
2. Trigger `evalConditionTraced` calls confirmed at `trigger-dispatch.ts:116,120` — for `match` and `when`.
3. Terminal `evalCondition` calls confirmed at `terminal.ts:149,177,217` — for checkpoint and end conditions.
4. `evalConditionTraced` (line 230 in `eval-condition.ts`) wraps `evalCondition` and emits a trace event via `emitConditionTrace`. Compiled path must still emit traces (Foundation 9).
5. Compiled predicate signature `(state, activePlayer, bindings, snapshot?)` matches the data available at all call sites — `ReadContext` provides all four values.

## Architecture Check

1. Each call site follows the same integration pattern: look up compiled predicate from the per-expression cache (ticket 005), if non-null call it directly, otherwise fall back to `evalCondition`/`evalConditionTraced`. No new abstractions needed.
2. For trigger sites using `evalConditionTraced`, the compiled path must call `emitConditionTrace` directly after evaluation to preserve replay/auditability (Foundation 9). The trace event should include the same `context` and `provenance` as the interpreter path.
3. No game-specific logic — the integration is purely mechanical: cache lookup + fallback at each call site.
4. V8 JIT safety: no fields added to `ReadContext`, `EffectCursor`, `GameDefRuntime`, or `MoveEnumerationState`. Cache access uses module-level WeakMap via the imported accessor function.

## What to Change

### 1. Integrate at action `pre` sites (4 files, 7 call sites)

At each `evalCondition(action.pre, ctx)` call site in `legal-moves.ts`, `legal-choices.ts`, `apply-move.ts`, and `free-operation-viability.ts`:

```typescript
const compiled = getCompiledCondition(action.pre);
if (compiled !== null) {
  const result = compiled(ctx.state, ctx.activePlayer, ctx.bindings, undefined);
  if (!result) { /* same branch as existing !evalCondition(...) */ }
} else {
  // existing evalCondition path
}
```

Extract a shared helper if the pattern is repeated >3 times to avoid DRY violations.

### 2. Integrate at trigger sites (2 call sites)

At `trigger-dispatch.ts:116` (match) and `:120` (when):

```typescript
const compiled = getCompiledCondition(trigger.match);
let matchResult: boolean;
if (compiled !== null) {
  matchResult = compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings, undefined);
  emitConditionTrace(evalCtx.collector, {
    kind: 'conditionEval',
    condition: trigger.match,
    result: matchResult,
    context: 'triggerMatch',
    provenance: triggerProvenance,
  });
} else {
  matchResult = evalConditionTraced(trigger.match, evalCtx, 'triggerMatch', triggerProvenance);
}
```

Same pattern for `trigger.when`. The key requirement is that `emitConditionTrace` is always called regardless of path (Foundation 9).

### 3. Integrate at terminal sites (3 call sites)

At `terminal.ts:149,177,217`:

```typescript
const compiled = getCompiledCondition(checkpoint.when);
const result = compiled !== null
  ? compiled(baseCtx.state, baseCtx.activePlayer, baseCtx.bindings, undefined)
  : evalCondition(checkpoint.when, baseCtx);
```

Terminal conditions are evaluated infrequently (only at potential terminal states), so this is lower priority but completes coverage.

### 4. Integrate at enumeration snapshot sites

In the `legal-moves.ts` enumeration discovery path, where snapshot conditions are evaluated, apply the same lookup pattern passing the enumeration snapshot as the 4th argument.

### 5. Import and wiring

Add `import { getCompiledCondition } from './compiled-condition-expr-cache.js'` to each modified file. Add `import { emitConditionTrace } from './eval-condition.js'` to `trigger-dispatch.ts` if not already imported.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/terminal.ts` (modify)
- `packages/engine/test/kernel/compiled-application-sites.test.ts` (new — integration tests)

## Out of Scope

- Widening `tryCompileCondition` or `tryCompileValueExpr` coverage (tickets 001-003)
- Token filter compiler changes (ticket 004)
- Cache implementation (ticket 005 — prerequisite)
- Remaining 10+ `evalCondition` call sites in other kernel files (lower frequency — follow-up if profiling warrants)

## Acceptance Criteria

### Tests That Must Pass

1. Integration test: action `pre` condition with compilable expression uses compiled path and produces correct legality result
2. Integration test: action `pre` condition with non-compilable expression falls back to interpreter
3. Integration test: trigger `match` with compilable condition uses compiled path AND emits condition trace
4. Integration test: trigger `when` with compilable condition uses compiled path AND emits condition trace
5. Integration test: terminal condition with compilable expression uses compiled path
6. Determinism regression: existing simulation replay tests pass with compiled predicates active
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiled path produces identical results to interpreter path for all inputs (Foundation 8)
2. Trigger call sites always emit condition trace events regardless of compiled/interpreter path (Foundation 9)
3. No fields added to `ReadContext`, `EffectCursor`, `GameDefRuntime`, or `MoveEnumerationState` (V8 JIT safety)
4. Fallback to interpreter is always available — never crashes on non-compilable expressions

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/compiled-application-sites.test.ts` — integration tests for each call site category (action pre, trigger, terminal) with both compiled and fallback paths

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="compiled-application-sites"`
2. `pnpm turbo test`
