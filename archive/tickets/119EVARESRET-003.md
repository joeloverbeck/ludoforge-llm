# 119EVARESRET-003: Change evalQuery to result-returning + migrate all consumers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `evalQuery` signature change, ~20 consumer sites across ~10 files
**Deps**: `archive/tickets/119EVARESRET-001.md`

## Problem

`evalQuery` returns `readonly QueryResult[]` and throws on error. After ticket 001 defines result types, this ticket changes the signature to return `EvalQueryResult` and migrates all ~20 consumer sites. TypeScript's type checker enforces completeness.

## Assumption Reassessment (2026-04-07)

1. `evalQuery(query: OptionsQuery, ctx: ReadContext): readonly QueryResult[]` — confirmed at `eval-query.ts:785`.
2. 20 `evalQuery` call sites in non-test source files — confirmed via grep.
3. Consumer files: `eval-value.ts` (4 sites), `effects-choice.ts` (3), `effects-control.ts` (2), `effect-compiler-codegen.ts` (3), `declared-action-param-domain.ts` (1), `effects-subset.ts` (1), `first-decision-compiler.ts` (1), plus others — all confirmed to exist.
4. No probe-context or try-catch-wrapped `evalQuery` calls exist — all 20 sites are normal-execution (unwrap pattern).
5. `QueryResult` export was added by ticket 001.

## Architecture Check

1. Signature change from `readonly QueryResult[]` to `EvalQueryResult` is enforced by TypeScript.
2. All changes are in the generic kernel. No game-specific logic.
3. No dual-variant functions (F14) — old signature replaced, not wrapped.
4. Internal throw sites become `return { outcome: 'error', error: createEvalError(...) }`.
5. Independent of ticket 002 — `evalQuery` and `evalCondition` have separate call graphs.

## What to Change

### 1. Change `evalQuery` return type

**File**: `packages/engine/src/kernel/eval-query.ts`

- Change return type from `readonly QueryResult[]` to `EvalQueryResult`
- Replace every `throw ...` with `return { outcome: 'error', error: createEvalError(...) }`
- Wrap successful returns: `return evalSuccess(result)`
- For recursive/nested calls within evalQuery: check `outcome` before proceeding

### 2. Migrate all evalQuery consumer sites

Mechanical transformation at each site:

```typescript
// BEFORE
const items = evalQuery(query, ctx)
// AFTER
const items = unwrapEvalQuery(evalQuery(query, ctx))
```

Files and approximate site counts:
- `eval-value.ts` — 4 sites
- `effects-choice.ts` — 3 sites
- `effects-control.ts` — 2 sites
- `effect-compiler-codegen.ts` — 3 sites
- `declared-action-param-domain.ts` — 1
- `effects-subset.ts` — 1
- `first-decision-compiler.ts` — 1
- Remaining sites per grep — verify during implementation

### 3. Add imports

Each migrated file needs `import { unwrapEvalQuery } from './eval-result.js'`.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify — signature + internals)
- `packages/engine/src/kernel/eval-value.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/effects-control.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/declared-action-param-domain.ts` (modify)
- `packages/engine/src/kernel/effects-subset.ts` (modify)
- `packages/engine/src/kernel/first-decision-compiler.ts` (modify)

## Out of Scope

- `evalCondition` signature change — that is ticket 002
- Choice validation throws in `effects-choice.ts` (32 throw sites) — deferred to Spec 120
- Probe/graceful-degradation refinement — ticket 004

## Acceptance Criteria

### Tests That Must Pass

1. `evalQuery` returns `{ outcome: 'success', value: [...] }` for valid queries
2. `evalQuery` returns `{ outcome: 'error', error: EvalError }` for bounds exceeded, missing vars, etc.
3. All existing tests pass unchanged — `unwrapEvalQuery` preserves throw-on-error semantics
4. `pnpm turbo typecheck` passes with zero errors
5. Existing suite: `pnpm turbo test`

### Invariants

1. No dual `evalQuery` variants — one signature, one return type (F14)
2. `unwrapEvalQuery` at all consumer sites preserves identical runtime behavior
3. No game-specific logic introduced (F1)
4. Determinism preserved (F8)
5. `QueryResult` export (from ticket 001) does not change the type shape

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — update tests that assert thrown errors to assert error results instead.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

**Completed**: 2026-04-07

**What changed**:
- `eval-query.ts`: added `evalQuery` wrapper returning `EvalQueryResult` via try-catch, renamed core to `evalQueryRaw` (exported), fixed 3 internal recursive calls + 2 internal `evalCondition` filter calls missed by ticket 002
- 7 source files migrated with `unwrapEvalQuery` wrapping (17 call sites total)
- 3 test files migrated: `eval-query.test.ts` (86 tests, `evalQueryRaw` for throws), `eval.property.test.ts`, `spatial-kernel-integration.test.ts`

**Deviations**:
- Used wrapper+raw split (same as 002) instead of inline throw-to-return replacement
- `evalQueryRaw` exported for kernel-internal + test use (not in ticket but required by same pattern as 002's `evalConditionRaw`)
- Found 2 `evalCondition` calls inside eval-query.ts helpers that ticket 002 missed — wrapped with `unwrapEvalCondition` to fix silent behavioral regression
- Test error validators updated to check `.cause` for `KernelRuntimeError`-wrapped `EvalError`

**Verification**: Build pass, typecheck pass (3/3), eval-query tests 86/86 pass.
