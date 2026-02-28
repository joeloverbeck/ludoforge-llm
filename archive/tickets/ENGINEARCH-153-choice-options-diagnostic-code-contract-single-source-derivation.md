# ENGINEARCH-153: Derive Choice-Options Diagnostic Code Contract from a Single Source

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — kernel diagnostic helper contract representation hardening
**Deps**: archive/tickets/ENGINEARCH-150-choice-options-runtime-shape-diagnostic-code-contract-tightening.md

## Problem

The choice-options runtime-shape helper currently exports two canonical code constants and a separate union type. Even though this is type-safe today, it still has a manual maintenance seam because constants and union members are maintained in separate declarations.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` currently exports two code constants plus a manually enumerated union type.
2. Compiler and validator call sites already consume those constants; no runtime behavior mismatch exists.
3. Additional regression coverage already exists beyond the two kernel-focused tests (for example `compile-effects.test.ts`, `validate-gamedef.test.ts`, and `core-types-validation.integration.test.ts`) and validates emitted code literals in real compiler/validator flows.
4. Mismatch: type ownership is still split across multiple declarations. Corrected scope is to encode canonical code values once and derive types from that source.

## Architecture Check

1. A single canonical code map/tuple with derived union type is cleaner and reduces drift risk than split constant+union declarations.
2. This change remains kernel/compiler generic and game-agnostic; no GameSpecDoc, visual-config, or game-specific runtime behavior is introduced.
3. No backwards-compatibility shims/aliases; compiler/validator call sites should consume the canonical source directly.

## What to Change

### 1. Replace split constant/union declarations with one canonical source

In `choice-options-runtime-shape-diagnostic.ts`, represent surface codes in one `as const` source and derive the `ChoiceOptionsRuntimeShapeDiagnosticCode` type from it.

### 2. Keep call-site behavior stable

Retain current compiler and validator emitted code values unchanged while updating imports/usages to consume the canonical source directly.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify)

## Out of Scope

- Diagnostic wording changes.
- Choice-options runtime-shape semantic changes.
- Any GameSpecDoc or visual-config content/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Helper code type is derived from a single canonical source, not manually duplicated declarations.
2. Compiler/validator paths still emit unchanged canonical code values.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`
5. Existing regression coverage asserting these literals remains green (unit + integration tests that assert `CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` and `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID`).

### Invariants

1. Diagnostic code ownership for this helper remains explicit and drift-resistant.
2. GameDef/runtime/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` — preserve/extend canonical code assertions with the new derived contract surface.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — keep compiler/validator parity checks stable after representation refactor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`

## Scope Decision (Reassessed)

1. Proceed with the single-source diagnostic-code contract refactor.
2. Do not change diagnostic strings/messages/suggestions.
3. Do not add compatibility aliases for the old split constant contract; migrate call sites in the same change.

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Replaced split diagnostic-code constants + manual union in `choice-options-runtime-shape-diagnostic.ts` with a single canonical `as const` map (`CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES`) and derived union type.
  - Updated compiler and validator call sites to consume `CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler|validator` directly.
  - Updated kernel unit tests/parity tests to consume the canonical map and added an invariant assertion that the canonical map owns both expected emitted literals.
- **Deviations from original plan**:
  - Scope was refined before implementation to explicitly account for existing regression tests that already assert these literals in unit/integration flows.
  - No semantic/runtime diagnostic payload changes were made.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`327` passed, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
