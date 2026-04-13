# 130CANHOTPAT-004: MoveViabilityProbeResult — unify 4 discriminated variant shapes

**Status**: COMPLETE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/apply-move and all consumer files
**Deps**: None

## Problem

`MoveViabilityProbeResult` is a 4-variant discriminated union where each variant has a different property set:

1. `{viable: true, complete: true}` — `move`, `warnings`
2. `{viable: true, complete: false}` — `move`, `warnings`, `nextDecision?`, `nextDecisionSet?`, `stochasticDecision?`
3. `{viable: false, code: 'ILLEGAL_MOVE'}` — `code`, `context`, `error`
4. `{viable: false, code: other}` — `code`, `context?`, `error`

Construction sites produce objects with different property sets (~6 sites in `apply-move.ts`), and consumer sites branch on `viable` and `complete` using property presence checks. This creates V8 hidden class polymorphism at ~3K accesses/game.

## Assumption Reassessment (2026-04-13)

1. `MoveViabilityProbeResult` defined in `packages/engine/src/kernel/apply-move.ts:569-597` — confirmed
2. 4 discriminated variants with different property sets — confirmed
3. Variant 2 has optional `nextDecision?`, `nextDecisionSet?`, `stochasticDecision?` — confirmed
4. Variant 4 has optional `context?` — confirmed
5. ~6 construction sites in `apply-move.ts`, plus 46 total conditional spreads in the file — confirmed

## Architecture Check

1. Unifying means all 4 variants always have all properties. Viable objects get `code: undefined`, `error: undefined`; non-viable objects get `move: undefined`, `warnings: undefined`. Discriminants (`viable`, `complete`, `code`) still distinguish at the type level.
2. Consumer sites that use `in` operator or property absence to branch between variants need updating to check discriminant values instead — this is a more robust pattern anyway.
3. Engine-internal type — no game-specific logic.

## What to Change

### 1. Update MoveViabilityProbeResult type in `apply-move.ts`

Unify all 4 variants so every variant includes every property:

```typescript
export type MoveViabilityProbeResult =
  | Readonly<{
      readonly viable: true;
      readonly complete: true;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: true;
      readonly complete: false;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: ChoicePendingRequest | undefined;
      readonly nextDecisionSet: readonly ChoicePendingRequest[] | undefined;
      readonly stochasticDecision: ChoiceStochasticPendingRequest | undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: 'ILLEGAL_MOVE';
      readonly context: IllegalMoveContext;
      readonly error: KernelRuntimeError<'ILLEGAL_MOVE'>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>;
      readonly context: KernelRuntimeErrorContext<...> | undefined;
      readonly error: KernelRuntimeError<...>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>;
```

### 2. Update all construction sites in `apply-move.ts`

Every return producing a MoveViabilityProbeResult must include all properties. Add `undefined` for properties not relevant to the variant.

### 3. Update consumer sites

Grep for all import sites of `MoveViabilityProbeResult`. Consumer sites that use `'nextDecision' in result` or similar `in` checks must switch to discriminant-based branching (`result.viable && !result.complete`). Consumer sites that branch on `result.viable` and then access variant-specific fields should work unchanged after TypeScript narrowing.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify — type + construction sites)
- `packages/engine/src/kernel/legal-moves.ts` (modify — consumer)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify — consumer)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — consumer)
- `packages/engine/src/agents/policy-eval.ts` (modify — consumer)
- Other consumer files identified by `tsc` errors

## Out of Scope

- GameState optional fields — ticket 001
- EffectCursor/ClassifiedMove — ticket 002
- PolicyEvaluationCoreResult — ticket 003
- ESLint rule — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. All existing engine tests pass unchanged
2. Move viability probing produces identical results for the same inputs
3. `stateHash` determinism preserved

### Invariants

1. Every MoveViabilityProbeResult object has all 10 properties as own properties
2. TypeScript discriminant narrowing on `viable`/`complete`/`code` still works correctly
3. No `in` operator checks for variant-specific property presence remain in consumer code
4. No `?` optional syntax on any MoveViabilityProbeResult field

## Test Plan

### New/Modified Tests

1. Test files constructing MoveViabilityProbeResult — add missing fields (guided by `tsc --noEmit`)
2. Test files using `in` operator on result objects — update to discriminant checks

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`

## Outcome (2026-04-13)

Implemented the canonical `MoveViabilityProbeResult` runtime shape in `packages/engine/src/kernel/apply-move.ts`.

All four variants now materialize the same property set at construction time:
- viable complete results always include `code`, `context`, `error`, `nextDecision`, `nextDecisionSet`, and `stochasticDecision` as own properties with `undefined`
- viable incomplete results always include `code`, `context`, and `error` as `undefined`, while `nextDecision`, `nextDecisionSet`, and `stochasticDecision` are always present as `T | undefined`
- non-viable results always include `complete`, `move`, `warnings`, `nextDecision`, `nextDecisionSet`, and `stochasticDecision` as own properties, and the non-ILLEGAL_MOVE branch now materializes `context: undefined` when absent

The live boundary was narrower than the draft ticket predicted. Reassessment confirmed that broad consumer rewrites were unnecessary: the actual manual constructor fallout was limited to `packages/engine/src/kernel/legal-moves.ts` plus direct test fixtures and helper literals in engine/runner tests that authored `MoveViabilityProbeResult` or `ClassifiedMove` inline.

No schema, generated-artifact, or serialization changes were required.

Verification completed with:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
- `pnpm turbo test`
