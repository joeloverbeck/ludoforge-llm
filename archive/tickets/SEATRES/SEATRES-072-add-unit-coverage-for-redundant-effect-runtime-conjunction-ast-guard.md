# SEATRES-072: Add unit coverage for redundant effect-runtime conjunction AST guard

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test helper contract coverage for AST guard behavior
**Deps**: archive/tickets/SEATRES/SEATRES-068-remove-redundant-effect-runtime-code-check-at-reason-guards.md

## Problem

`collectRedundantEffectRuntimeReasonConjunctions(...)` was added to `kernel-source-ast-guard.ts` and is now used by source-contract tests, but helper-specific unit tests do not yet cover its expected match/non-match behavior. This leaves AST guard contract drift under-tested.

## Assumption Reassessment (2026-03-03)

1. `collectRedundantEffectRuntimeReasonConjunctions(...)` exists in `packages/engine/test/helpers/kernel-source-ast-guard.ts` and is consumed by `effect-error-contracts.test.ts`.
2. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` currently has no test cases for this helper.
3. `tickets/SEATRES-073-require-shared-error-symbol-in-redundant-effect-runtime-conjunction-guard.md` also touches this helper and unit-test file, but for semantic tightening (shared-error-symbol identity), not baseline match/non-match contract coverage.

## Architecture Check

1. Guard-helper unit tests are cleaner than relying only on indirect integration-style assertions because helper semantics are locked at the ownership boundary.
2. This is test-infrastructure hardening only; GameSpecDoc/game-specific data boundaries and GameDef/runtime agnosticism are unchanged.
3. No backwards-compatibility aliases/shims: add direct tests for current canonical helper behavior.

## What to Change

### 1. Add helper contract tests

1. Extend `kernel-source-ast-guard.test.ts` with fixtures that should match the redundant conjunction anti-pattern.
2. Add fixtures that should not match (single guard only, non-runtime code checks, unrelated conjunctions).
3. Keep assertions deterministic and independent from production source files.

### 2. Keep effect-runtime consumer tests unchanged in intent

1. Preserve current `effect-error-contracts.test.ts` usage of the helper.
2. Ensure helper unit tests cover enough shape variants to prevent false confidence.

### 3. Scope boundary with adjacent tickets

1. Do not implement shared-error-symbol identity semantics in this ticket; that belongs to `SEATRES-073`.
2. Do not implement kernel-wide module scanning policy expansion in this ticket; that belongs to `SEATRES-074`.

## Files to Touch

- `packages/engine/test/unit/kernel-source-ast-guard.test.ts` (modify)

## Out of Scope

- Changing runtime/kernel behavior in `apply-move.ts` or `legal-choices.ts`
- Broader kernel-wide policy expansion beyond helper unit coverage
- Shared-error-symbol equivalence tightening inside `collectRedundantEffectRuntimeReasonConjunctions(...)`
- Any GameSpecDoc or visual-config schema/data changes

## Acceptance Criteria

### Tests That Must Pass

1. `kernel-source-ast-guard.test.ts` includes direct positive and negative coverage for `collectRedundantEffectRuntimeReasonConjunctions(...)`.
2. Existing effect-runtime reason contract tests continue passing without semantic changes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. AST helper behavior remains deterministic and explicit under unit tests.
2. Engine/runtime remain game-agnostic and decoupled from GameSpecDoc/visual-config specifics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` — add dedicated match/non-match fixtures for redundant conjunction detection. Rationale: lock helper contract at source.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js`
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Corrected assumption drift: this ticket now explicitly acknowledges overlap with `SEATRES-073` and narrows scope boundaries so `SEATRES-072` owns baseline helper coverage only.
2. Added direct unit coverage in `kernel-source-ast-guard.test.ts` for:
   - positive detection of canonical redundant conjunctions (both operand orders)
   - negative non-match fixtures (single guards, non-`EFFECT_RUNTIME` code checks, unrelated conjunctions, disjunction)
3. Kept helper semantics and consumer intent unchanged; no runtime/kernel behavior changes were introduced.
