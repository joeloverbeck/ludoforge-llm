# 85COMEFFCONMIG-001: Widen scoped-var-runtime-access.ts signatures from EffectContext to ReadContext

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/scoped-var-runtime-access.ts
**Deps**: `archive/specs/77-effect-context-static-dynamic-split.md`, `archive/specs/85-complete-effect-context-migration.md`

## Problem

Functions in `scoped-var-runtime-access.ts` accept `EffectContext` but only use `ReadContext`-level fields (plus `mode` in endpoint resolution). This forces callers to construct a full `EffectContext` via `fromEnvAndCursor` even though a cheaper `ReadContext` would suffice. Widening signatures is a prerequisite for replacing `fromEnvAndCursor` in downstream handler files.

## Assumption Reassessment (2026-03-26)

1. `resolveRuntimeScopedEndpointImpl` uses `evalCtx.bindings`, `evalCtx.freeOperationOverlay`, and selector helpers that already accept `ReadContext`; only `mode` sits outside `ReadContext` and must be threaded explicitly
2. `resolveScopedVarDef` and `resolveScopedIntVarDef` use only `ctx.def` — confirmed, can narrow to `Pick<ReadContext, 'def'>`
3. `readScopedVarValue` and `readScopedIntVarValue` use only `ctx.state` — the original ticket treated them as out of scope because there is no `fromEnvAndCursor` allocation win, but that assumption is architecturally weaker than the code warrants; these helpers should still narrow to `Pick<ReadContext, 'state'>` to remove needless coupling to `EffectContext`
4. `availableZoneVarNames` uses only `ctx.def.zoneVars` — internal helper, narrowed alongside its callers
5. The original out-of-scope list was incomplete: once `resolveRuntimeScopedEndpoint*` adds an explicit `mode` parameter, all direct callers must be updated in the same change (`effects-var.ts`, `effects-resource.ts`, `effect-compiler-codegen.ts`, and focused unit tests)

## Architecture Check

1. Type narrowing/widening here is a contract cleanup, not a runtime shape change — V8 hidden class shapes are identical at runtime because the same objects still flow through the call graph
2. No game-specific logic touched (Foundation 1)
3. The architectural value is broader than allocation savings: helpers in `scoped-var-runtime-access.ts` are read-only utilities and should depend on the smallest stable surface (`ReadContext` fragments plus explicit `mode`) rather than on the effect execution supertype
4. No backwards-compatibility shims — callers passing `EffectContext` or `ExecutionEffectContext` continue to satisfy the narrower contracts, but all exported signature changes are updated atomically in the same change (Foundation 9)

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

### 3. Narrow state-only scoped-var readers

Change `readScopedVarValue` and `readScopedIntVarValue`:

- Parameter: `ctx: EffectContext` -> `ctx: Pick<ReadContext, 'state'>`
- This does not change behavior, but it removes accidental coupling between plain state readers and the larger effect execution context

### 4. Widen internal helpers

- `availableZoneVarNames`: `ctx: EffectContext` -> `ctx: Pick<ReadContext, 'def'>`
- `resolveScopedVarName`: `evalCtx: EffectContext` -> `evalCtx: ReadContext`

### 5. Update callers within and across files

Any internal call chains that pass the context between these functions must be updated to thread the new `mode` parameter where needed.

Direct external callers of `resolveRuntimeScopedEndpoint*` must be updated in the same ticket:

- `packages/engine/src/kernel/effects-var.ts`
- `packages/engine/src/kernel/effects-resource.ts`
- `packages/engine/src/kernel/effect-compiler-codegen.ts`

Focused unit tests that call these helpers directly must also be updated to match the new signature.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)

## Out of Scope

- `writeScopedVarsToState` — already takes `GameState`, not `EffectContext`
- Any changes to `effect-context.ts` types
- Any removal of `fromEnvAndCursor` call sites outside the direct scoped-var resolver callers touched above

## Acceptance Criteria

### Tests That Must Pass

1. Focused scoped-var/kernel unit tests cover the narrowed contracts and still pass
2. Engine tests exercising `setVar`, `addVar`, and `transferVar` still pass
3. TypeScript strict mode catches any caller passing an object missing required `ReadContext` fragments or `mode`

### Invariants

1. V8 hidden class shapes unchanged — same runtime objects flow through widened signatures
2. All updated callers continue to compile — `EffectContext` satisfies the narrower context fragments, with explicit `mode` threaded where required
3. Determinism parity — same seed + same actions = identical stateHash
4. No new exports or public API surface added

## Test Plan

### New/Modified Tests

1. Strengthen `packages/engine/test/unit/scoped-var-runtime-access.test.ts` so the exported helper signatures are exercised through the narrowed context shapes rather than only through full `EffectContext`
2. Keep the existing resolver/reader behavior assertions intact to prove runtime parity while the contracts narrow

### Commands

1. `pnpm turbo typecheck` — verify all callers satisfy narrowed signatures
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions

## Outcome

- **Completion date**: 2026-03-26
- **What actually changed**: Narrowed `scoped-var-runtime-access.ts` helper contracts to `ReadContext` fragments plus explicit `mode`, updated the direct resolver callers in `effects-var.ts`, `effects-resource.ts`, and `effect-compiler-codegen.ts`, strengthened `packages/engine/test/unit/scoped-var-runtime-access.test.ts` to exercise the narrower contracts directly, and updated `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` so the architecture guard accepts the cleaner explicit-`mode` threading pattern.
- **Deviations from original plan**: The original ticket understated scope. `readScopedVarValue` and `readScopedIntVarValue` were narrowed to `Pick<ReadContext, 'state'>` for cleaner architecture even without an allocation win, direct external callers of `resolveRuntimeScopedEndpoint*` had to be updated in the same ticket because the exported signature changed, and active ticket dependency metadata in `85COMEFFCONMIG-001` plus preexisting `85COMEFFCONMIG-002` had to be corrected to satisfy the repo's ticket-integrity guard before full tests could run.
- **Verification results**: `pnpm exec turbo typecheck` passed; targeted `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed; targeted `node --test packages/engine/dist/test/unit/kernel/effect-resolver-normalization-guard.test.js` passed after updating the architecture guard; `pnpm exec turbo lint` passed; `pnpm run test` passed.
