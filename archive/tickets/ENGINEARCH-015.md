# ENGINEARCH-015: Discriminate Selector-Cardinality EvalError Context by Selector Kind

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-error context contracts + selector-cardinality emitters + type/runtime tests
**Deps**: None (ENGINEARCH-014 completed in `archive/tickets/ENGINEARCH-014.md`)

## Problem

`SELECTOR_CARDINALITY` context typing still allows semantically invalid context combinations at compile time. The union is currently structural, and `ZoneSel` is `string`, so player-selector literals (for example `'all'`) can accidentally satisfy zone-context branches.

## Assumption Reassessment (2026-02-25)

1. `SELECTOR_CARDINALITY` maps to `TypedSelectorCardinalityEvalErrorContext` in `packages/engine/src/kernel/eval-error.ts`, but it is not explicitly discriminated by selector kind.
2. `ZoneSel` is currently `string` (exported via `types.ts` from `types-ast.ts`), so string player selectors can be assignable to zone-context branches.
3. Selector-cardinality eval-error emitters are in `packages/engine/src/kernel/resolve-selectors.ts` (zone + player cardinality errors).
4. Existing tests validate required fields and defer-class literals, but they do not fully prevent cross-branch misuse without an explicit discriminator:
   - `packages/engine/test/unit/types-foundation.test.ts`
   - `packages/engine/test/unit/eval-error-classification.test.ts`
   - `packages/engine/test/unit/kernel/missing-binding-policy.test.ts`

## Architecture Reassessment

1. Adding an explicit discriminator (`selectorKind`) produces a clearer and more durable contract than relying on overlapping primitive selector shapes.
2. This is a kernel-generic correctness improvement and does not encode game-specific logic.
3. Strict migration with no alias/backward-compat shims is preferable here: broken call-sites should fail fast at compile time and be fixed directly.
4. This change is architecturally beneficial over current behavior because it moves selector-cardinality context safety from convention to enforceable type contracts.

## Updated Scope

### 1. Introduce explicit selector-kind discrimination in `SELECTOR_CARDINALITY` context

Add `selectorKind: 'player' | 'zone'` and split payload requirements by selector kind.

### 2. Update selector-cardinality emitters to construct discriminated payloads

At minimum:
- `packages/engine/src/kernel/resolve-selectors.ts`

### 3. Strengthen compile-time guardrails

Add `@ts-expect-error` coverage that rejects:
- player selector + zone payload fields
- zone selector + player payload fields
- missing discriminator

### 4. Preserve defer-class behavior for zone unresolved-binding cardinality

No semantic change to deferral policy; only context typing/shape becomes explicit and unambiguous.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-error-classification.test.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/resolve-selectors.test.ts` (modify as needed)

## Out of Scope

- Selector runtime semantics changes
- GameSpecDoc schema or CNL grammar changes
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Type system rejects mixed selector-kind payloads for `SELECTOR_CARDINALITY`.
2. Runtime selector-cardinality behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Selector-cardinality metadata is compile-time unambiguous and branch-safe.
2. GameDef/simulator remain game-agnostic and policy-generic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — discriminator-focused compile-time rejection/acceptance coverage.
2. `packages/engine/test/unit/eval-error-classification.test.ts` — typed defer-class context with explicit zone selector kind.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — selector-cardinality defer metadata uses explicit zone selector kind.
4. `packages/engine/test/unit/resolve-selectors.test.ts` — assert emitted selector-cardinality contexts include correct selector kind.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Added explicit `selectorKind: 'player' | 'zone'` discrimination for `SELECTOR_CARDINALITY` context in `eval-error.ts`.
  - Updated selector-cardinality emitters in `resolve-selectors.ts` to emit the correct discriminator on player and zone branches.
  - Strengthened compile-time guardrails in `types-foundation.test.ts` for mixed-branch misuse and missing discriminator.
  - Updated runtime/typing tests that construct selector-cardinality contexts to include explicit zone discriminator (`eval-error-classification.test.ts`, `missing-binding-policy.test.ts`) and strengthened resolver assertions (`resolve-selectors.test.ts`).
- Deviations from original plan:
  - No additional production call-sites outside `resolve-selectors.ts` required changes for `EvalError('SELECTOR_CARDINALITY')`; ticket scope was narrowed accordingly during reassessment.
  - `eval-error.test.ts` did not require modification because it does not construct selector-cardinality context payloads.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (159/159).
  - `pnpm -F @ludoforge/engine lint` passed.
