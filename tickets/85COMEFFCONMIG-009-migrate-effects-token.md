# 85COMEFFCONMIG-009: Replace fromEnvAndCursor in effects-token.ts (10 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-token.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-token.ts` has 10 `fromEnvAndCursor` call sites — the most of any handler file. These span token movement, creation, destruction, and property modification handlers. Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext` or small pick objects for trace provenance.

## Assumption Reassessment (2026-03-26)

1. 10 `fromEnvAndCursor` call sites at lines ~325, 453, 497, 576, 626, 662, 731, 933, 966, 1068 — confirmed
2. Results are passed to: `evalValue`, `evalCondition`, `resolveRef`, `resolveTokenSel`, `resolveZoneSel`, and trace functions — confirmed
3. Token handlers are performance-critical — FITL benchmarks show high token movement frequency
4. Some handlers call `resolveTraceProvenance` / `emitVarChangeTraceIfChanged` — these need inline pick objects
5. No calls to `resolveRuntimeScopedEndpoint` in this file — no `mode` param threading needed
6. `effects-token.ts` also contains several file-local helpers typed to `EffectContext` that appear to read only `def` and/or `state`; this ticket should reassess and narrow those helpers while the file is open instead of preserving broad context coupling

## Architecture Check

1. `mergeToReadContext`/`mergeToEvalContext` proven V8-safe in `effects-control.ts`
2. Inline pick objects for trace calls (~4 fields) are cheaper than `mergeToReadContext` (~13 fields)
3. No game-specific logic (Foundation 1)
4. No shims (Foundation 9)
5. This file accounts for ~33% of all `fromEnvAndCursor` call sites — largest single-file impact

## What to Change

### 1. Replace 10 fromEnvAndCursor call sites

For each call site, determine the pattern:
- **Eval pattern**: Where context is passed to `evalValue`, `evalCondition`, `resolveRef`, `resolveTokenSel`, `resolveZoneSel` — replace with `mergeToReadContext(env, evalCursor)` or `mergeToEvalContext(env, cursor)`
- **Trace pattern**: Where context is passed to `resolveTraceProvenance` or `emitVarChangeTraceIfChanged` — construct inline pick: `{ collector: env.collector, state: cursor.state, traceContext: env.traceContext, effectPath: cursor.effectPath }`
- **Mixed pattern**: Some handlers use context for both eval and trace — create the `ReadContext` for eval, and a separate inline pick for trace

### 2. Handler functions to update (10 call sites across these handlers)

Verify the exact handler function names at implementation time. Expected handlers include: `applyMoveToken`, `applyCreateToken`, `applyDestroyToken`, `applySetTokenProp`, `applyMoveAllTokens`, `applyMoveTokenAdjacent`, and related helpers.

### 3. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used

### Note

Because this is the largest migration file, it should absorb helper-signature cleanup as part of the same change. If helpers such as stacking/state lookup/provenance support can be expressed in terms of `{ def }`, `{ state }`, or tiny explicit picks, prefer that over leaving `EffectContext` in place after the call-site migration.

Do not turn this ticket into a cross-file helper-extraction pass. Keep provenance construction local here, then let `85COMEFFCONMIG-010` decide whether the repeated env/cursor trace helper should be centralized once all migrated files are visible together.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Changes to `resolveTokenSel`, `resolveZoneSel`, or eval function signatures
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing token effect tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising token movement (sweep, rally, march, garrison, etc.)
3. Texas Hold'em tests exercising card (token) dealing and movement
4. Determinism tests pass
5. Trace output includes correct provenance for token operations

### Invariants

1. All downstream eval calls receive objects with required `ReadContext` fields
2. All trace calls receive inline pick objects with required 4 fields
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file
5. Token operations produce identical results for same seed + same actions

## Test Plan

### New/Modified Tests

1. No new tests needed — identical observable behavior

### Commands

1. `pnpm turbo typecheck` — verify type compatibility across all 10 sites
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions
