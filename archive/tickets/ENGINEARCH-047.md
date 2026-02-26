# ENGINEARCH-047: Harden selector-normalization helper contracts and diagnostics typing

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — helper contract typing + tests
**Deps**: none

## Problem

Selector-normalization helpers currently accept loosely typed diagnostic fields (`scope: string`) and expose broad context plumbing that allows drift in diagnostic semantics across callsites. The runtime behavior is mostly correct (including EffectRuntimeError passthrough), but contract looseness weakens compile-time guarantees for deterministic diagnostics.

## Assumption Reassessment (2026-02-26)

1. **Confirmed**: resolver failure normalization and `EffectRuntimeError` passthrough behavior are implemented in `packages/engine/src/kernel/selector-resolution-normalization.ts`.
2. **Mismatch + correction**: the original ticket scoped the typing hardening to `scoped-var-runtime-access.ts`, but the loose contract source of truth is `selector-resolution-normalization.ts` (consumed by scoped-var/runtime/effect handlers).
3. **Confirmed**: tests currently verify wrapped resolver failures and discovery-mode passthrough in `scoped-var-runtime-access.test.ts`, but do not directly pin helper-level passthrough invariants and canonical helper context shape.
4. **Correction**: scope must include helper contract types in `selector-resolution-normalization.ts`, plus direct helper-level unit assertions (existing scoped-var tests can remain as integration-style coverage).

## Architecture Check

1. Constraining helper contracts to canonical scope labels is cleaner than stringly-typed options: compile-time enforcement prevents accidental context drift.
2. Explicit helper-level diagnostics shape (effect type, scope, payload field, source error code when available) is more robust and extensible than ad-hoc per-caller context conventions.
3. This is pure kernel/internal contract hardening; no GameSpecDoc/YAML schema or game-specific runtime branching changes.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Tighten normalization helper option types

In `selector-resolution-normalization.ts`, replace free-form `scope: string` with constrained canonical unions used by existing callsites.

### 2. Clarify canonical normalization context

Ensure helper normalization emits deterministic canonical context keys:
- `effectType`
- `scope`
- selector payload key (`selector` for player selection, `zone` for zone resolution)
- `sourceErrorCode` when wrapping eval errors

### 3. Add direct helper contract tests

Add/strengthen tests that directly assert:
- passthrough of existing `EffectRuntimeError` inside helper normalization path
- normalized wrapping of non-effect errors
- canonical context field presence for wrapped resolver failures

## Files to Touch

- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify only if typing ripple requires it)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/selector-resolution-normalization.test.ts` (add)

## Out of Scope

- Refactoring all effect handlers beyond required compile-time type alignment
- Game-specific content/schema changes
- Runner/UI diagnostics rendering

## Acceptance Criteria

### Tests That Must Pass

1. Selector-normalization helper APIs use constrained diagnostic option types (no free-form scope strings).
2. Existing `EffectRuntimeError` inputs passed to normalization helpers are rethrown unchanged.
3. Wrapped resolver failures include canonical helper context fields.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selector normalization helper contracts are deterministic and explicit.
2. Runtime diagnostic typing remains game-agnostic and reusable across effect families.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/selector-resolution-normalization.test.ts` — direct helper passthrough + normalization context assertions.
2. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — retain integration coverage for resolver normalization via scoped endpoint helper.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What was changed**:
  - Hardened selector-normalization helper typing in `packages/engine/src/kernel/selector-resolution-normalization.ts` by replacing free-form scope strings with a constrained `NormalizedResolverScope` union.
  - Made payload-key context explicit in normalization (`selector` vs `zone`) to enforce deterministic helper context shape.
  - Added direct helper contract tests in `packages/engine/test/unit/selector-resolution-normalization.test.ts` covering passthrough of existing `EffectRuntimeError`, eval-error wrapping with canonical context, and non-`Error` throwable normalization.
- **Deviations from original plan**:
  - Original ticket scope incorrectly centered `scoped-var-runtime-access.ts`; work was correctly redirected to `selector-resolution-normalization.ts` as the source of loose typing.
  - No functional changes were needed in `scoped-var-runtime-access.ts`; existing integration coverage remained valid.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (288/288).
  - `pnpm -F @ludoforge/engine lint` passed.
