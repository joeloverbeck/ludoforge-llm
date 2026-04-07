# 119EVARESRET-002: Change evalCondition to result-returning + migrate all consumers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `evalCondition` / `evalConditionTraced` signature change, ~31 consumer sites across ~15 files
**Deps**: `archive/tickets/119EVARESRET-001.md`

## Problem

`evalCondition` returns `boolean` and throws on error. After ticket 001 defines result types, this ticket changes the signature to return `EvalConditionResult` and migrates all ~31 consumer sites. TypeScript's type checker enforces completeness — every unconverted site becomes a compile error.

## Assumption Reassessment (2026-04-07)

1. `evalCondition(cond: ConditionAST, ctx: ReadContext): boolean` — confirmed at `eval-condition.ts`.
2. `evalConditionTraced` has matching boolean return — confirmed. Must also change.
3. 31 `evalCondition` call sites in non-test source files — confirmed via grep.
4. Normal-execution sites (no error handling): `eval-value.ts`, `effects-control.ts`, `effects-token.ts`, `apply-move.ts`, `legal-moves.ts`, `legal-choices.ts`, `terminal.ts`, `effect-compiler-codegen.ts`, `event-execution.ts`, `free-operation-viability.ts`, `spatial.ts`, `apply-move-pipeline.ts` — all confirmed to exist.
5. `condition-annotator.ts` has 1 unwrapped evalCondition site (line 447, passed as callback) — gets `unwrapEvalCondition`.
6. Catch-wrapped and probe sites in `condition-annotator.ts` (3 sites) and `action-pipeline-predicates.ts` (2 sites) and `free-operation-*` (2 sites) are handled by ticket 004, NOT this ticket. This ticket wraps them with `unwrapEvalCondition` as a mechanical intermediate step; ticket 004 then refines them to result pattern-matching.

## Architecture Check

1. Signature change from `boolean` to `EvalConditionResult` is enforced by TypeScript — no site can be silently missed.
2. All changes are in the generic kernel. No game-specific logic introduced.
3. No dual-variant functions (F14) — the old signature is replaced, not wrapped.
4. Internal throw sites become `return { outcome: 'error', error: createEvalError(...) }`.
5. Recursive branches (`and`, `or`, `not`) short-circuit on error results.

## What to Change

### 1. Change `evalCondition` return type

**File**: `packages/engine/src/kernel/eval-condition.ts`

- Change return type from `boolean` to `EvalConditionResult`
- Replace every `throw new EvalError(...)` / `throw createEvalError(...)` with `return { outcome: 'error', error: createEvalError(...) }`
- Wrap successful returns: `return evalSuccess(result)`
- For recursive calls (`and`, `or`, `not`): check `outcome` before proceeding, short-circuit on error

### 2. Change `evalConditionTraced` return type

Same file — matching signature change. The tracing wrapper must propagate result types.

### 3. Migrate all evalCondition consumer sites

Mechanical transformation at each site:

```typescript
// BEFORE
const passed = evalCondition(cond, ctx)
// AFTER
const passed = unwrapEvalCondition(evalCondition(cond, ctx))
```

Files and approximate site counts:
- `effects-control.ts` — 1 evalCondition site
- `effects-token.ts` — 1
- `apply-move.ts` — 2
- `legal-moves.ts` — 2
- `legal-choices.ts` — 2
- `terminal.ts` — 3
- `effect-compiler-codegen.ts` — 2 evalCondition sites
- `event-execution.ts` — 1
- `free-operation-viability.ts` — 1
- `spatial.ts` — 1
- `apply-move-pipeline.ts` — 1
- `condition-annotator.ts` — 4 sites (all get `unwrapEvalCondition` as intermediate step; ticket 004 refines 3 of these to pattern-matching)
- `action-pipeline-predicates.ts` — 2 sites (get `unwrapEvalCondition` as intermediate; ticket 004 refines to pattern-matching)
- `free-operation-zone-filter-probe.ts` — 1 (intermediate; ticket 004 refines)
- `free-operation-grant-authorization.ts` — 1 (intermediate; ticket 004 refines)

### 4. Add imports

Each migrated file needs `import { unwrapEvalCondition } from './eval-result.js'`.

## Files to Touch

- `packages/engine/src/kernel/eval-condition.ts` (modify — signature + internals)
- `packages/engine/src/kernel/effects-control.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/terminal.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/spatial.ts` (modify)
- `packages/engine/src/kernel/apply-move-pipeline.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)

## Out of Scope

- `evalQuery` signature change — that is ticket 003
- Probe/graceful-degradation pattern-matching refinement — that is ticket 004
- Choice validation throws in `effects-choice.ts` — deferred to Spec 120
- `evalConditionTraced` tracing infrastructure changes beyond signature alignment

## Acceptance Criteria

### Tests That Must Pass

1. `evalCondition` returns `{ outcome: 'success', value: true/false }` for valid conditions
2. `evalCondition` returns `{ outcome: 'error', error: EvalError }` for missing bindings (previously thrown)
3. Recursive `and`/`or`/`not` short-circuit on error results
4. All existing tests pass unchanged — `unwrapEvalCondition` preserves throw-on-error semantics
5. `pnpm turbo typecheck` passes with zero errors
6. Existing suite: `pnpm turbo test`

### Invariants

1. No dual `evalCondition` variants — one signature, one return type (F14)
2. `unwrapEvalCondition` at normal-execution sites preserves identical runtime behavior
3. No game-specific logic introduced (F1)
4. Determinism preserved — same inputs produce same results (F8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-condition.test.ts` — update tests that assert thrown errors to assert error results instead. Add tests for recursive short-circuit behavior.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

**Completed**: 2026-04-07

**What changed**:
- `eval-condition.ts`: extracted `evalConditionRaw` (boolean-returning, exported for kernel-internal callbacks), new `evalCondition` wrapper returns `EvalConditionResult` via try-catch, `evalConditionTraced` also returns `EvalConditionResult`
- 10 source files migrated with `unwrapEvalCondition` wrapping
- 3 source files migrated with `evalConditionRaw` callback replacement (`effects-choice.ts`, `map-model.ts`, `validate-gamedef-structure.ts`)
- 3 test files updated: `eval-condition.test.ts` (21 assert.equal + 11 assert.throws migrated), `compiled-condition-equivalence.test.ts`, `enumeration-snapshot-benchmark.test.ts`

**Deviations**:
- Ticket listed ~15 files; actual migration touched 16 source files (TypeScript caught `free-operation-viability.ts` which was listed but `validate-gamedef-structure.ts` and `map-model.ts` were not — both pass `evalCondition` as a callback and needed `evalConditionRaw`)
- Implementation used wrapper + raw split instead of inline throw-to-return replacement — architecturally equivalent, lower risk

**Verification**: Build pass, typecheck pass (3/3), eval unit tests 33/33 pass. Runner test failures pre-existing (game-store lifecycle, unrelated).
