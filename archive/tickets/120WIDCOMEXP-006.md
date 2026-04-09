# 120WIDCOMEXP-006: Widen application sites — action pre, triggers, terminal

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/` (multiple files)
**Deps**: `archive/tickets/120WIDCOMEXP-005.md`

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
5. Ticket 003 already widened compiled predicates to consume `ReadContext` directly, so all target call sites have the needed context in hand.
6. Snapshot-aware discovery predicate evaluation is already routed through `evaluateDiscoveryPipelinePredicateStatus(...)` in `pipeline-viability-policy.ts`; there is no separate non-pipeline `evalCondition` snapshot site left to migrate in `legal-moves.ts`.

## Architecture Check

1. The action-pre and terminal sites share the same cached-evaluation pattern, so a small helper in `compiled-condition-expr-cache.ts` is cleaner than duplicating the same lookup/fallback logic across six files.
2. For trigger sites using `evalConditionTraced`, the compiled path must call `emitConditionTrace` directly after evaluation to preserve replay/auditability (Foundation 9). The trace event should include the same `context` and `provenance` as the interpreter path.
3. No game-specific logic — the integration is purely mechanical: cache lookup + fallback at each call site.
4. V8 JIT safety: no fields added to `ReadContext`, `EffectCursor`, `GameDefRuntime`, or `MoveEnumerationState`. Cache access uses module-level WeakMap via the imported accessor function.

## What to Change

### 1. Integrate at action `pre` sites (4 files, 7 call sites)

At each action-pre call site in `legal-moves.ts`, `legal-choices.ts`, `apply-move.ts`, and `free-operation-viability.ts`, route evaluation through the shared cached helper:

```typescript
if (!evaluateConditionWithCache(action.pre, ctx)) {
  /* same branch as existing !evalCondition(...) */
}
```

### 2. Integrate at trigger sites (2 call sites)

At `trigger-dispatch.ts:116` (match) and `:120` (when):

```typescript
const matchResult = evaluateConditionWithCache(trigger.match, evalCtx);
emitConditionTrace(evalCtx.collector, {
  kind: 'conditionEval',
  condition: trigger.match,
  result: matchResult,
  context: 'triggerMatch',
  provenance: triggerProvenance,
});
```

Same pattern for `trigger.when`. The key requirement is that `emitConditionTrace` is always called regardless of path (Foundation 9).

### 3. Integrate at terminal sites (3 call sites)

At `terminal.ts:149,177,217`:

```typescript
const result = evaluateConditionWithCache(checkpoint.when, baseCtx);
```

Terminal conditions are evaluated infrequently (only at potential terminal states), so this is lower priority but completes coverage.

### 4. Integrate at enumeration snapshot sites

No additional code change is required here. Snapshot-aware condition evaluation already flows through `evaluateDiscoveryPipelinePredicateStatus(...)` and the compiled pipeline predicate path established by earlier tickets. This ticket should verify that no separate interpreter-only snapshot condition site remains outside that pipeline policy surface.

### 5. Import and wiring

Add the cached condition-evaluation helper from `compiled-condition-expr-cache.ts` to each modified file. Add `import { emitConditionTrace } from './execution-collector.js'` to `trigger-dispatch.ts` if not already imported.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/terminal.ts` (modify)
- `packages/engine/src/kernel/compiled-condition-expr-cache.ts` (modify — add shared cached-evaluation helper)
- `packages/engine/test/unit/kernel/compiled-application-sites.test.ts` (new — integration and source-guard tests)

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

1. `packages/engine/test/unit/kernel/compiled-application-sites.test.ts` — integration tests for each call site category (action pre, trigger, terminal) with both compiled and fallback paths, plus source guards for the remaining owned callsites

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compiled-application-sites.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

- Completed: 2026-04-09
- Added `evaluateConditionWithCache(...)` to `compiled-condition-expr-cache.ts` and routed the remaining explicit action-pre, trigger, and terminal condition application sites through that shared cached-evaluation helper.
- Updated `trigger-dispatch.ts` so compiled trigger `match` and `when` checks still emit `conditionTrace` entries with the same context/provenance as the interpreter path.
- Added `compiled-application-sites.test.ts` to prove compiled action-pre, trigger, and terminal behavior, interpreter fallback for non-compilable conditions, and the continued use of the cached helper at the owned callsites.
- Deviation from original plan: no separate enumeration-snapshot callsite edit was needed. Reassessment showed snapshot-aware discovery predicates were already routed through `evaluateDiscoveryPipelinePredicateStatus(...)` and the compiled pipeline predicate path landed by earlier tickets.
- Schema/artifact surfaces: checked via `pnpm -F @ludoforge/engine test` (`schema:artifacts:check`); no generated artifact changes were needed.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compiled-application-sites.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
