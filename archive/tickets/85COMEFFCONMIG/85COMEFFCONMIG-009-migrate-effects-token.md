# 85COMEFFCONMIG-009: Replace fromEnvAndCursor in effects-token.ts (10 call sites + helper narrowing)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-token.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-token.ts` has 10 `fromEnvAndCursor` call sites — the most of any handler file. These span token movement, creation, destruction, and property modification handlers. Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext` or small pick objects for trace provenance.

## Assumption Reassessment (2026-03-26)

1. 10 `fromEnvAndCursor` call sites remain in `effects-token.ts` — confirmed
2. These contexts flow into selector resolution, `evalValue`, `evalCondition`, file-local helpers that only read `def` and/or `state`, and `resolveTraceProvenance` — confirmed
3. This file does not call `resolveRuntimeScopedEndpoint`, `resolveRef`, `resolveTokenSel`, `resolveZoneSel`, or `emitVarChangeTraceIfChanged`; those were over-broad assumptions and are not part of this ticket
4. `effects-token.ts` still has three file-local helpers typed to `EffectContext` that should be narrowed while the file is open:
   - `enforceStacking` only needs `Pick<ReadContext, 'def'>`
   - `resolveZoneTokens` only needs `Pick<ReadContext, 'state'>`
   - `resolveTokenOccurrence` only needs `Pick<ReadContext, 'state'>`
5. Existing tests cover token lifecycle, move/draw, zone ops, execution trace, determinism-sensitive token flows, and FITL/Texas Hold'em integrations, but they do not fully pin every trace/provenance path touched by this migration

## Architecture Check

1. `mergeToReadContext` is the primary replacement needed here because this file already computes resolved-binding cursors explicitly where required
2. Inline provenance pick objects remain cheaper and clearer for trace calls because `resolveTraceProvenance` needs only `state`, `traceContext`, and `effectPath`
3. Narrowing local helper signatures in the same file is architecturally beneficial because it removes unnecessary `EffectContext` coupling instead of preserving it
4. No game-specific logic (Foundation 1)
5. No shims (Foundation 9)
6. This file remains the largest single-file `fromEnvAndCursor` concentration, so a local comprehensive cleanup is worthwhile

## What to Change

### 1. Replace 10 `fromEnvAndCursor` call sites

For each call site, determine the pattern:
- **Eval pattern**: Where context is passed to selector resolution, `evalValue`, `evalCondition`, or file-local helpers — replace with `mergeToReadContext(env, evalCursor)` or `mergeToReadContext(env, cursor)` as appropriate
- **Trace pattern**: Where context is passed to `resolveTraceProvenance` — construct inline pick: `{ state: cursor.state, traceContext: env.traceContext, effectPath: cursor.effectPath }` or the equivalent `evalCursor`-based object
- **Mixed pattern**: Some handlers use context for both eval and trace — create the `ReadContext` for eval, and a separate inline pick for trace

### 2. Narrow local helper signatures in the same file

Because this file still exposes helper signatures in terms of `EffectContext`, narrow them during the migration rather than preserving the broader dependency surface.

### 3. Handler functions to update (10 call sites across these handlers)

Verify the exact handler function names at implementation time. Expected handlers include: `applyMoveToken`, `applyCreateToken`, `applyDestroyToken`, `applySetTokenProp`, `applyMoveAllTokens`, `applyMoveTokenAdjacent`, and related helpers.

### 4. Update imports

- Remove `fromEnvAndCursor`
- Add `mergeToReadContext`
- Remove `EffectContext` from imports once helper signatures are narrowed
- Add `ReadContext` type import if needed for the narrowed helpers

### Note

Because this is the largest migration file, it should absorb helper-signature cleanup as part of the same change. If helpers such as stacking/state lookup/provenance support can be expressed in terms of `{ def }`, `{ state }`, or tiny explicit picks, prefer that over leaving `EffectContext` in place after the call-site migration.

Do not turn this ticket into a cross-file helper-extraction pass. Keep provenance construction local here, then let `85COMEFFCONMIG-010` decide whether the repeated env/cursor trace helper should be centralized once all migrated files are visible together.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/test/unit/effects-lifecycle.test.ts` (modify)
- `packages/engine/test/unit/effects-zone-ops.test.ts` and/or `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify if trace coverage needs tightening)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Changes to `resolveTokenSel`, `resolveZoneSel`, or eval function signatures
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. Relevant engine token tests pass, including lifecycle, move/draw, zone ops, and execution trace coverage
2. `pnpm -F @ludoforge/engine test` passes
3. `pnpm turbo typecheck` passes
4. `pnpm turbo lint` passes
5. Existing FITL and Texas Hold'em coverage still passes as part of the engine suite
6. Trace output includes correct provenance for the token operations touched by this file

### Invariants

1. All downstream eval calls receive objects with required `ReadContext` fields
2. All trace calls receive provenance objects built from only the required fields
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file
5. Token operations produce identical results for same seed + same actions
6. File-local helpers no longer require `EffectContext` when they only read `def` or `state`

## Test Plan

### New/Modified Tests

1. Strengthen trace/provenance coverage for token lifecycle and zone-op handlers touched by the migration
2. Keep test additions narrow and behavior-focused; do not broaden this into a trace framework change

### Commands

1. `pnpm turbo typecheck` — verify type compatibility across all 10 sites and the narrowed helpers
2. `pnpm -F @ludoforge/engine test` — full engine suite passes
3. `pnpm turbo lint` — no lint regressions

## Outcome

- Completion date: 2026-03-27
- What actually changed: `effects-token.ts` no longer uses `fromEnvAndCursor`; all 10 call sites now use `mergeToReadContext` plus minimal provenance picks, and the three local helpers were narrowed away from `EffectContext`
- Deviations from original plan: the reassessment removed unused assumptions about `resolveRef`, selector helpers not used by this file, `emitVarChangeTraceIfChanged`, and `mergeToEvalContext`; the implementation stayed file-local and did not extract a shared provenance helper
- Verification results:
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
  - `node --test packages/engine/dist/test/unit/effects-lifecycle.test.js packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-zone-ops.test.js packages/engine/dist/test/unit/execution-trace.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
