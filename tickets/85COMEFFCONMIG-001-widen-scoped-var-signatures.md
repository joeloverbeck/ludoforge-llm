# 85COMEFFCONMIG-001: Widen scoped-var-runtime-access.ts signatures from EffectContext to ReadContext

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/scoped-var-runtime-access.ts
**Deps**: Spec 77 (completed), Spec 85

## Problem

Functions in `scoped-var-runtime-access.ts` accept `EffectContext` but only use `ReadContext`-level fields (plus `mode` in endpoint resolution). This forces callers to construct a full `EffectContext` via `fromEnvAndCursor` even though a cheaper `ReadContext` would suffice. Widening signatures is a prerequisite for replacing `fromEnvAndCursor` in downstream handler files.

## Assumption Reassessment (2026-03-26)

1. `resolveRuntimeScopedEndpointImpl` uses `evalCtx.mode` and `evalCtx.bindings` and `evalCtx.freeOperationOverlay` — confirmed these are all on `ReadContext` except `mode` which is on `EffectContextBase`
2. `resolveScopedVarDef` uses only `ctx.def` — confirmed, can narrow to `Pick<ReadContext, 'def'>`
3. `readScopedVarValue` and `readScopedIntVarValue` use `ctx.state` — confirmed, but these are not widened in this ticket because callers always have full context and no `fromEnvAndCursor` savings result
4. `availableZoneVarNames` uses `ctx.def.zoneVars` — internal helper, narrowed alongside its callers

## Architecture Check

1. Type widening is a compile-time-only change — V8 hidden class shapes are identical at runtime (proven in FITL perf campaign, HIGH CONFIDENCE 0.98)
2. No game-specific logic touched (Foundation 1)
3. No backwards-compatibility shims — callers passing `EffectContext` already satisfy `ReadContext` (Foundation 9)

## What to Change

### 1. Widen endpoint resolution functions

Change `resolveRuntimeScopedEndpointImpl`, `resolveRuntimeScopedEndpoint`, and `resolveRuntimeScopedEndpointWithMalformedSupport` signatures:

- Parameter: `evalCtx: EffectContext` -> `evalCtx: ReadContext`
- Add explicit `mode: EffectContext['mode']` parameter (since `mode` is not on `ReadContext`)
- Update internal reads from `evalCtx.mode` to use the new `mode` parameter

### 2. Widen variable definition lookup

Change `resolveScopedVarDef` and `resolveScopedIntVarDef`:

- Parameter: `ctx: EffectContext` -> `ctx: Pick<ReadContext, 'def'>`
- These only access `ctx.def.globalVars`, `ctx.def.perPlayerVars`, `ctx.def.zoneVars`

### 3. Widen internal helpers

- `availableZoneVarNames`: `ctx: EffectContext` -> `ctx: Pick<ReadContext, 'def'>`
- `resolveScopedVarName`: `evalCtx: EffectContext` -> `evalCtx: ReadContext`

### 4. Update callers within the same file

Any internal call chains that pass the context between these functions must be updated to thread the new `mode` parameter where needed.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)

## Out of Scope

- Callers in other files (`effects-var.ts`, `effects-resource.ts`, `effect-compiler-codegen.ts`) — these still pass `EffectContext` which satisfies `ReadContext`; they are updated in tickets -006 and -007
- `readScopedVarValue`, `readScopedIntVarValue` — no `fromEnvAndCursor` savings from widening these
- `writeScopedVarsToState` — already takes `GameState`, not `EffectContext`
- Any changes to `effect-context.ts` types
- Any changes to effect handler files

## Acceptance Criteria

### Tests That Must Pass

1. All existing scoped var tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests that exercise scoped variables (setVar, addVar, transferVar)
3. TypeScript strict mode catches any caller passing an object missing required fields

### Invariants

1. V8 hidden class shapes unchanged — same runtime objects flow through widened signatures
2. All existing callers continue to compile — `EffectContext` satisfies `ReadContext`
3. Determinism parity — same seed + same actions = identical stateHash
4. No new exports or public API surface added

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a type-level-only change with identical runtime behavior

### Commands

1. `pnpm turbo typecheck` — verify all callers satisfy widened signatures
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
