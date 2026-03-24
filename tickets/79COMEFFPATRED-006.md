# 79COMEFFPATRED-006: Dead code removal and import cleanup

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel dead code removal
**Deps**: 79COMEFFPATRED-003, 79COMEFFPATRED-004, 79COMEFFPATRED-005

## Problem

After tickets 003-005 migrate all consumers to the new DraftTracker-integrated
paths, several functions and fields become dead code:

1. `normalizeFragmentResult` in `effect-compiler.ts` — already deleted in 003.
2. `createCompiledExecutionContext` in `effect-compiler-runtime.ts` — no longer called.
3. `fallbackApplyEffects` field on `CompiledEffectContext` — no longer used by
   any fragment.

Per Foundation 9 (No Backwards Compat), dead code is deleted, not deprecated.

## Assumption Reassessment (2026-03-24)

1. `normalizeFragmentResult` was deleted in 79COMEFFPATRED-003 — **confirmed by dependency**.
2. `createCompiledExecutionContext` is in `effect-compiler-runtime.ts` — **confirmed**.
3. After 003/004/005, no consumer calls `createCompiledExecutionContext` — **must verify via grep at implementation time**.
4. After 003/004/005, no consumer reads `ctx.fallbackApplyEffects` — **must verify via grep at implementation time**.
5. `fallbackApplyEffects` is set in `phase-lifecycle.ts` when constructing `CompiledEffectContext` — removing the field requires updating that call site.

## Architecture Check

1. Foundation 9 mandates deletion over deprecation — no `// @deprecated` comments.
2. Grep verification before deletion ensures no hidden consumers.
3. Import cleanup prevents unused-import lint violations.

## What to Change

### 1. Verify no remaining consumers (CRITICAL)

Before any deletion, grep the entire `packages/engine/src/` tree for:
- `createCompiledExecutionContext` — must have zero references outside its definition.
- `fallbackApplyEffects` — must have zero references outside its type definition and the construction site in `phase-lifecycle.ts`.
- `normalizeFragmentResult` — must have zero references (already deleted in 003).

If any consumer remains, do NOT delete — flag it as a blocker and apply the
1-3-1 rule.

### 2. Delete `createCompiledExecutionContext`

Remove the function from `effect-compiler-runtime.ts`. The file should now
contain only `buildEffectEnvFromCompiledCtx`.

### 3. Remove `fallbackApplyEffects` from `CompiledEffectContext`

In `effect-compiler-types.ts`, remove the `fallbackApplyEffects` field from the
`CompiledEffectContext` interface. Update the construction site in
`phase-lifecycle.ts` to stop setting this field.

### 4. Clean up imports across affected files

Remove any unused imports in:
- `effect-compiler.ts`
- `effect-compiler-codegen.ts`
- `effect-compiler-runtime.ts`
- `phase-lifecycle.ts`

### 5. Update tests

Remove any tests that directly tested `createCompiledExecutionContext` or
`normalizeFragmentResult`. Update any tests that construct a
`CompiledEffectContext` with `fallbackApplyEffects` — remove that field from
test fixtures.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-runtime.ts` (modify — delete `createCompiledExecutionContext`)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify — remove `fallbackApplyEffects` field)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — remove `fallbackApplyEffects` from ctx construction)
- `packages/engine/src/kernel/effect-compiler.ts` (modify — import cleanup only)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify — import cleanup only)
- `packages/engine/test/unit/kernel/effect-compiler*.ts` (modify — remove dead test fixtures/assertions)

## Out of Scope

- Any new functionality — this ticket is pure deletion.
- Performance optimization — deferred to 79COMEFFPATRED-007.
- Shared tracker optimization (future spec work).
- `emitVarChangeArtifacts` cleanup — future follow-up.
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. Grep verification: `createCompiledExecutionContext` has zero references in `packages/engine/src/`.
2. Grep verification: `fallbackApplyEffects` has zero references in `packages/engine/src/`.
3. Grep verification: `normalizeFragmentResult` has zero references in `packages/engine/src/`.
4. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
5. `pnpm -F @ludoforge/engine test:e2e` — E2E parity tests pass.
6. `pnpm turbo typecheck` — no type errors.
7. `pnpm turbo lint` — no lint violations (no unused imports).

### Invariants

1. No runtime behavior change — this is pure dead code removal.
2. Compiled path produces bit-identical results to the interpreter.
3. `effect-compiler-runtime.ts` exports only `buildEffectEnvFromCompiledCtx` (or is empty if that's the only remaining export).
4. `CompiledEffectContext` no longer has `fallbackApplyEffects` — the type is smaller.
5. `phase-lifecycle.ts` compiled context construction is simpler (fewer fields).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` — remove `createCompiledExecutionContext` tests.
2. `packages/engine/test/unit/kernel/effect-compiler*.test.ts` — remove `fallbackApplyEffects` from test fixtures.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
