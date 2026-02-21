# CONCPAR-001: Conceal error code + type/schema parity with reveal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — types-ast, schemas-ast, runtime-reasons
**Deps**: None

## Problem

The `conceal` effect type currently has a zone-only shape (`{ zone: ZoneRef }`) while `reveal` supports `zone`, `to` (PlayerSel), and `filter` (TokenFilterPredicate[]). This asymmetry prevents selective concealment (e.g. "hide cards from player 2 only") and means the conceal error path reuses the `revealRuntimeValidationFailed` reason code instead of having its own.

## Assumption Reassessment (2026-02-21)

1. **Conceal type shape**: Confirmed at `types-ast.ts:268` — `{ readonly conceal: { readonly zone: ZoneRef } }`. Reveal at lines 262-266 has `zone`, `to`, and optional `filter`. Parity gap confirmed.
2. **Conceal Zod schema**: Confirmed at `schemas-ast.ts:479` — `z.object({ conceal: z.object({ zone: ZoneRefSchema }).strict() }).strict()`. Missing `from` and `filter` fields.
3. **Runtime reason codes**: `runtime-reasons.ts:22` has `REVEAL_RUNTIME_VALIDATION_FAILED: 'revealRuntimeValidationFailed'` but no conceal-specific code. `applyConceal` at `effects-reveal.ts:21` reuses `'revealRuntimeValidationFailed'`.
4. **No `from` field conflict**: The `reveal` effect uses `to` (the recipient), so conceal should use `from` (whose grants to remove) to avoid confusion. This is a new field, not a rename.

## Architecture Check

1. **Parity over ad-hoc**: Mirroring reveal's structure for conceal keeps the hidden-information DSL symmetric and predictable for game designers. Alternative (ad-hoc conceal flags) would fragment the API surface.
2. **Game-agnostic**: `from` is a PlayerSel and `filter` is TokenFilterPredicate[] — both are generic kernel types with no game-specific semantics. No game-specific branching introduced.
3. **No shims**: This is additive — the new fields are optional, so existing `{ conceal: { zone } }` shapes remain valid.

## What to Change

### 1. Add `CONCEAL_RUNTIME_VALIDATION_FAILED` to runtime-reasons

- Add `CONCEAL_RUNTIME_VALIDATION_FAILED: 'concealRuntimeValidationFailed'` to `EFFECT_RUNTIME_REASONS` in `runtime-reasons.ts`
- Add the new reason to `KERNEL_RUNTIME_REASONS` array
- No message map change needed (effect reasons don't have human messages)

### 2. Extend conceal type in types-ast.ts

Replace the conceal union member:
```typescript
| {
    readonly conceal: {
      readonly zone: ZoneRef;
      readonly from?: 'all' | PlayerSel;
      readonly filter?: readonly TokenFilterPredicate[];
    };
  }
```

### 3. Extend conceal Zod schema in schemas-ast.ts

Update the conceal schema entry to include optional `from` (union of `z.literal('all')` and `PlayerSelSchema`) and optional `filter` (array of `TokenFilterPredicateSchema`).

### 4. Update applyConceal error code

In `effects-reveal.ts:21`, change `'revealRuntimeValidationFailed'` to `'concealRuntimeValidationFailed'` in the `applyConceal` function.

### 5. Regenerate JSON schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`.

## Files to Touch

- `packages/engine/src/kernel/runtime-reasons.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)

## Out of Scope

- Selective conceal runtime logic (CONCPAR-003)
- Compiler changes (CONCPAR-002)
- Trace emission (CONCPAR-004)
- Behavioral changes to `applyConceal` beyond error code swap

## Acceptance Criteria

### Tests That Must Pass

1. `effects-reveal.test.ts` conceal tests pass with new error code (update assertions for `concealRuntimeValidationFailed`)
2. `types-exhaustive.test.ts` continues to pass (exhaustive EffectAST coverage)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Existing conceal effects with zone-only shape remain valid (optional fields)
2. The `EffectRuntimeReason` type includes the new conceal reason
3. JSON schema artifacts are consistent with TypeScript types

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — update conceal error assertions from `revealRuntimeValidationFailed` to `concealRuntimeValidationFailed`

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "conceal"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo schema:artifacts`
