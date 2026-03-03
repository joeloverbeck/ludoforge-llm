# SEATRES-073: Require shared error symbol in redundant effect-runtime conjunction guard

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No runtime behavior changes — test guard precision tightening in test helper
**Deps**: archive/tickets/SEATRES/SEATRES-068-remove-redundant-effect-runtime-code-check-at-reason-guards.md, archive/tickets/SEATRES/SEATRES-072-add-unit-coverage-for-redundant-effect-runtime-conjunction-ast-guard.md

## Problem

The current redundant-conjunction AST detector matches `isEffectErrorCode(..., 'EFFECT_RUNTIME') && isEffectRuntimeReason(...)` by call shape, but does not require both calls to reference the same error expression. This can produce false positives in mixed-symbol conjunctions.

## Assumption Reassessment (2026-03-03)

1. `collectRedundantEffectRuntimeReasonConjunctions(...)` currently checks only call identity and runtime code literal shape.
2. The detector currently does not compare the first argument identity across the two calls.
3. `tickets/SEATRES-074-generalize-redundant-effect-runtime-conjunction-guard-kernel-wide.md` is active and depends on this precision tightening, but scopes kernel-wide policy expansion rather than helper matching semantics.

## Architecture Check

1. Requiring shared error-expression identity makes the guard semantically robust and reduces noisy failures from superficially similar but non-redundant code.
2. This is agnostic test-policy infrastructure; it does not introduce game-specific logic into GameDef/simulator/runtime.
3. No backwards-compatibility aliasing: tighten canonical guard semantics directly.

## What to Change

### 1. Tighten AST detector semantics

1. Update `collectRedundantEffectRuntimeReasonConjunctions(...)` to extract first-argument expressions from both calls.
2. Require canonical equivalence of those first-argument expressions before reporting a redundant conjunction.
3. Keep support for operand order (`A && B` and `B && A`).

### 2. Add precision regression coverage

1. Add tests proving mixed-symbol conjunctions do not match.
2. Keep tests proving true redundant conjunctions do match.

## Files to Touch

- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify)
- `packages/engine/test/unit/kernel-source-ast-guard.test.ts` (modify)

## Out of Scope

- Runtime/kernel behavior changes in effect handling
- Kernel-wide guard policy expansion across all modules
- Any GameSpecDoc or visual-config data/schema evolution

## Acceptance Criteria

### Tests That Must Pass

1. Redundant conjunctions with the same error expression are detected.
2. Conjunctions with different error expressions are not detected.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Redundant-conjunction detection is semantic (shared-error-symbol aware), not only lexical.
2. Engine/runtime remain game-agnostic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` — add shared-symbol vs mixed-symbol detection cases. Rationale: precision lock for AST detector behavior.
2. `packages/engine/test/unit/effect-error-contracts.test.ts` — no test content changes expected; execute to confirm existing guard contract checks still pass under tightened helper semantics.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js`
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Tightened `collectRedundantEffectRuntimeReasonConjunctions(...)` so a conjunction is reported only when `isEffectErrorCode(..., 'EFFECT_RUNTIME')` and `isEffectRuntimeReason(...)` reference canonically equivalent first-argument error expressions.
  - Refined the comparison from source-text equality to structural AST equivalence, including syntax-wrapper normalization (`as` assertions and non-null assertions), to avoid brittle false negatives.
  - Preserved operand-order support (`A && B` and `B && A`).
  - Added mixed-symbol non-match fixtures and structural-equivalence fixtures to `kernel-source-ast-guard` unit coverage.
  - Corrected ticket assumptions/dependencies to reflect `SEATRES-072` archival path and `SEATRES-074` active-scope relationship.
- **Deviations From Original Plan**:
  - No changes were required in `effect-error-contracts.test.ts`; existing tests already exercised the helper transitively and passed unchanged.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js` passed.
  - `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (367/367).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
