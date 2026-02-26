# ENGINEARCH-047: Harden selector-normalization helper contracts and diagnostics typing

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — helper contract typing + tests
**Deps**: none

## Problem

The new selector-normalization helpers accept loosely typed diagnostic fields (`scope: string`) and currently rely on implicit behavior for EffectRuntimeError passthrough. Loose helper contracts increase drift risk and can weaken deterministic diagnostics.

## Assumption Reassessment (2026-02-26)

1. Shared helper APIs in `scoped-var-runtime-access.ts` normalize resolver failures correctly.
2. Helper option typing currently permits non-canonical scope labels and does not explicitly encode field-level intent.
3. **Mismatch + correction**: helper contract types should be constrained to canonical runtime values and explicitly tested for passthrough/normalization boundaries.

## Architecture Check

1. Tight helper contracts are cleaner and safer than stringly-typed options.
2. This remains pure kernel/internal contract hardening; no GameSpecDoc or visual-config data model changes.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Tighten helper option types

Replace free-form strings with constrained unions for scope/field identifiers used in normalization context.

### 2. Clarify normalization context shape

Ensure helper-emitted context keys are canonical and deterministic (effect type, scope, selector/zone payload, source error code when present).

### 3. Add direct helper contract tests

Add tests for:
- passthrough of existing `EffectRuntimeError`
- normalized wrapping of non-effect errors
- canonical context shape enforcement

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- Refactoring all effect handlers (handled separately)
- Game-specific content/schema changes
- Runner/UI diagnostics rendering

## Acceptance Criteria

### Tests That Must Pass

1. Helper APIs use constrained diagnostic option types (no free-form scope strings).
2. Existing `EffectRuntimeError` inputs pass through unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selector normalization helper contracts are deterministic and explicit.
2. Runtime diagnostic typing remains game-agnostic and reusable across effect families.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add EffectRuntimeError passthrough assertions.
2. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — assert canonical normalization context keys for wrapped resolver failures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
