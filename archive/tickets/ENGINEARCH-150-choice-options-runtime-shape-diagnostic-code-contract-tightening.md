# ENGINEARCH-150: Tighten Choice-Options Runtime-Shape Diagnostic Code Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel diagnostic helper contract typing hardening
**Deps**: archive/tickets/ENGINEARCH-147-choice-options-diagnostic-details-remove-redundant-alternatives-field.md

## Problem

The shared choice-options runtime-shape diagnostic helper currently accepts an unconstrained `string` diagnostic code. This allows taxonomy drift or typos to compile silently and weakens cross-surface contract integrity.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` defines helper args with `code: string`.
2. Current call sites only pass two intended literals (`CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` and `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID`).
3. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` already exists and currently verifies message/suggestion/alternatives parity across compiler and validator surfaces, but it does not yet enforce shared code-constant ownership.
4. Mismatch: implementation contract is looser than actual intended code taxonomy. Corrected scope is to encode the code taxonomy in types and centralize code literals as a single shared contract so invalid/typo codes are rejected at compile time.

## Architecture Check

1. A closed code contract is cleaner and more robust than open-string forwarding because it prevents silent drift.
2. Centralizing canonical code literals behind exported constants is more robust than repeating raw literals at call sites; this creates one ownership point for taxonomy evolution.
3. This is kernel-level diagnostic contract hardening and remains game-agnostic; no game-specific behavior is introduced.
4. No backwards-compatibility aliasing/shims; tighten to canonical literals directly.

## What to Change

### 1. Define a single canonical diagnostic-code contract for this helper

In `choice-options-runtime-shape-diagnostic.ts`, replace `code: string` with a closed union type for the two supported literals and export canonical constants for those literals.

### 2. Align call sites/tests to the canonical contract

Update compiler/validator call sites and relevant tests to consume the exported constants instead of raw string literals. Add explicit emitted-code assertions where helpful.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify to use canonical code constant)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify to use canonical code constant)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify only if needed for shared code-constant assertions)

## Out of Scope

- Choice-options runtime-shape semantics changes.
- Message/suggestion wording changes.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Shared helper cannot be called with arbitrary diagnostic codes (enforced by TypeScript contract).
2. Compiler/validator paths still emit their canonical existing code literals unchanged and source them from shared constants.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Choice-options runtime-shape diagnostics preserve strict, explicit taxonomy ownership with a single literal source of truth.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` — assert emitted `code` matches exact canonical literal constants for each supported surface.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — keep compiler/validator code parity locked and assert both surfaces use canonical code constants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Tightened `buildChoiceOptionsRuntimeShapeDiagnostic` to accept a closed diagnostic-code union instead of `string`.
  - Introduced canonical exported constants in `choice-options-runtime-shape-diagnostic.ts` for compiler and validator code ownership.
  - Updated compiler and validator call sites to consume canonical constants rather than raw string literals.
  - Strengthened unit coverage to assert canonical emitted codes directly for both supported surfaces.
- **Deviations From Original Plan**:
  - Scope was refined before implementation to centralize literal ownership through exported constants (single source of truth), not only local union typing in the helper.
  - Existing parity test already existed; it was updated for canonical constant usage instead of creating a net-new parity file.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (327 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm run check:ticket-deps` ✅
