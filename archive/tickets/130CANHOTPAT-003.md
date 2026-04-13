# 130CANHOTPAT-003: PolicyEvaluationCoreResult — unify success/failure shapes

**Status**: COMPLETE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/policy-eval and consumer files
**Deps**: None

## Problem

`PolicyEvaluationCoreResult` is a discriminated union with structurally different success and failure variants. The success variant has `move`, `rng`, `metadata`; the failure variant has `failure`, `metadata`, and optional `fallbackMove?`, `fallbackStableMoveKey?`, `fallbackScore?`. Construction sites produce objects with different property sets depending on the variant, causing V8 hidden class polymorphism (~400 evaluations/game).

## Assumption Reassessment (2026-04-13)

1. `PolicyEvaluationCoreResult` defined in `packages/engine/src/agents/policy-eval.ts:156-170` — confirmed
2. Success variant: `kind`, `move`, `rng`, `metadata` (4 fields) — confirmed
3. Failure variant: `kind`, `failure`, `metadata`, `fallbackMove?`, `fallbackStableMoveKey?`, `fallbackScore?` (6 fields, 3 optional) — confirmed
4. ~16 construction sites in `policy-eval.ts` — confirmed
5. Additional consumers in `policy-agent.ts`, `policy-expr.ts`, `policy-diagnostics.ts`, `policy-evaluation-core.ts`, `prepare-playable-moves.ts` — confirmed

## Architecture Check

1. Unifying the union means both variants always have all properties. Success objects get `failure: undefined`, `fallbackMove: undefined`, etc. Failure objects get `move: undefined`, `rng: undefined`. The `kind` discriminant still distinguishes them at the type level.
2. The type remains a discriminated union for TypeScript narrowing — only the runtime object shape becomes consistent.
3. No game-specific logic — this is agent infrastructure.

## What to Change

### 1. Update PolicyEvaluationCoreResult type in `policy-eval.ts`

Unify both variants to include all properties:

```typescript
export type PolicyEvaluationCoreResult =
  | {
      readonly kind: 'success';
      readonly move: Move;
      readonly rng: Rng;
      readonly failure: undefined;
      readonly fallbackMove: undefined;
      readonly fallbackStableMoveKey: undefined;
      readonly fallbackScore: undefined;
      readonly metadata: PolicyEvaluationMetadata;
    }
  | {
      readonly kind: 'failure';
      readonly move: Move | undefined;
      readonly rng: Rng | undefined;
      readonly failure: PolicyEvaluationFailure;
      readonly fallbackMove: Move | undefined;
      readonly fallbackStableMoveKey: string | undefined;
      readonly fallbackScore: number | null | undefined;
      readonly metadata: PolicyEvaluationMetadata;
    };
```

### 2. Update all success construction sites

Every success return must now include the failure-variant fields:

```typescript
return {
  kind: 'success',
  move,
  rng,
  failure: undefined,
  fallbackMove: undefined,
  fallbackStableMoveKey: undefined,
  fallbackScore: undefined,
  metadata,
};
```

### 3. Update all failure construction sites

Every failure return must now include the success-variant fields and eliminate conditional spreads on fallback fields:

```typescript
return {
  kind: 'failure',
  move: undefined,
  rng: undefined,
  failure,
  fallbackMove: fallbackCandidate?.move,
  fallbackStableMoveKey: fallbackCandidate?.stableMoveKey,
  fallbackScore: fallbackCandidate?.score ?? null,
  metadata,
};
```

### 4. Update consumer sites

Consumer sites that branch on `kind` and access variant-specific properties may need minor adjustments. After TypeScript narrowing on `kind === 'success'`, the type system still guarantees `move` is `Move` (not `undefined`), so most consumers should be unaffected. Check for any `in` operator checks or `hasOwnProperty` patterns that rely on property absence.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify — if construction sites exist)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — if construction sites exist)
- `packages/engine/src/agents/policy-expr.ts` (modify — consumer patterns)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify — consumer patterns)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — consumer patterns)

## Out of Scope

- GameState optional fields — ticket 001
- EffectCursor/ClassifiedMove — ticket 002
- MoveViabilityProbeResult — ticket 004
- ESLint rule — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. All existing engine and agent tests pass unchanged
2. Policy evaluation produces identical move selections for the same inputs

### Invariants

1. Every PolicyEvaluationCoreResult object has all 8 properties as own properties
2. TypeScript discriminant narrowing on `kind` still works correctly
3. No `?` optional syntax on any PolicyEvaluationCoreResult field

## Test Plan

### New/Modified Tests

1. Test files constructing PolicyEvaluationCoreResult — add missing fields (guided by `tsc --noEmit`)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`

## Outcome (2026-04-13)

Implemented in `packages/engine/src/agents/policy-eval.ts`.

`PolicyEvaluationCoreResult` now materializes a single success/failure property set at runtime:
- success results always include `failure`, `fallbackMove`, `fallbackStableMoveKey`, and `fallbackScore` as own properties with `undefined`
- failure results always include `move`, `rng`, `fallbackMove`, `fallbackStableMoveKey`, and `fallbackScore` as own properties, with fallback metadata normalized to `undefined` when absent and `null` only for non-finite fallback scores

The live implementation boundary was narrower than the draft ticket predicted. Reassessment confirmed the type definition and construction sites were concentrated in `packages/engine/src/agents/policy-eval.ts`, and existing consumers already relied on `kind` discrimination rather than property absence, so no consumer-file edits were required.

No schema, generated-artifact, or serialization changes were required.

Verification completed with:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
- `pnpm turbo test`
