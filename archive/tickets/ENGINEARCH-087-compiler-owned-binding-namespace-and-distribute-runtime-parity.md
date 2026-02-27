# ENGINEARCH-087: Compiler-Owned Binding Namespace Guardrails + `distributeTokens` Runtime Parity Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL binding contract/validation and integration-level choice-flow coverage
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

Compiler-generated synthetic bindings currently use a reserved-looking namespace (for example `$__...`) without an explicit authored-input contract, which risks hidden collisions. In addition, `distributeTokens` currently has compile-level tests but lacks end-to-end runtime/discovery parity coverage for iterative decision flow.

## Assumption Reassessment (2026-02-27)

1. Confirmed: synthetic lowering binds are generated in a `$__*` namespace and authored binders are not currently rejected for this prefix.
2. Corrected: `distributeTokens` is already covered by compile-level lowering tests and raw effect-runtime parity tests (`applyEffects` vs manual primitives), but not by `legalChoicesDiscover` -> `applyMove` move-surface parity tests.
3. Revised mismatch: compiler-owned namespace and move-surface parity remain implicit rather than contractually enforced.

## Architecture Check

1. Explicit compiler-owned namespace contracts reduce accidental collisions and preserve deterministic compiler ownership boundaries.
2. Move-surface parity tests ensure lowered compiler abstractions remain faithful to generic kernel discovery/apply semantics.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Reserve compiler-owned binding namespace

Add contract-driven validation that authored binder declarations cannot use compiler-owned prefixes (for example `$__`), without hardcoding per-effect branches.

### 2. Add end-to-end `distributeTokens` decision-flow tests

Add tests that execute `legalChoicesDiscover` -> decision binding -> `applyMove` flow and assert expected token movement and legality behavior.

### 3. Keep diagnostics explicit

When authored bindings violate reserved namespace policy, emit clear compiler diagnostics with remediation guidance.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify if needed)
- `packages/engine/src/cnl/cross-validate.ts` (modify if needed)
- `packages/engine/test/unit/compile-effects.test.ts` (modify/add)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add)
- `packages/engine/test/integration/effects-complex.test.ts` (modify/add)

## Out of Scope

- Changing runtime binding resolution semantics.
- Introducing game-specific reserved names.

## Acceptance Criteria

### Tests That Must Pass

1. Authored compiler-reserved binding identifiers are rejected with targeted diagnostics.
2. `distributeTokens` move-surface discovery/apply flow is covered end-to-end and deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler-owned metadata/binding namespaces are never user-authored.
2. GameDef/runtime remains game-agnostic and behaviorally unchanged aside from validated correctness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — reserved namespace rejection for authored binders.
2. `packages/engine/test/unit/legal-moves.test.ts` — legality/discovery parity coverage for `distributeTokens`-style staged decisions.
3. `packages/engine/test/integration/effects-complex.test.ts` — end-to-end `legalChoicesDiscover` + `applyMove` coverage for token distribution across selected destinations.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Actually Changed**:
  - Added authored-binder guardrails in `compile-effects.ts` to reject compiler-owned `$__` namespace bindings via a shared binder-surface contract path.
  - Added diagnostic `CNL_COMPILER_RESERVED_BINDING_NAMESPACE_FORBIDDEN` for explicit namespace violations.
  - Added `distributeTokens` move-surface parity coverage through `legalChoicesDiscover` -> `applyMove` in both unit and integration tests.
- **Deviations from Original Plan**:
  - `validate-actions.ts` and `cross-validate.ts` were not modified because `compile-effects.ts` is the canonical binding declaration surface and supports contract-local diagnostics without duplicating validation layers.
  - Guardrail logic was refined to avoid false positives on trusted compiler/macro-generated binders while still rejecting authored declarations in reserved namespace.
- **Verification Results**:
  - `pnpm turbo lint` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
