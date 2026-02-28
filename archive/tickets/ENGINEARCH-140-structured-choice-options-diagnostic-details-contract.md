# ENGINEARCH-140: Structured Choice-Options Diagnostic Details Contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel diagnostic detail contract shape + caller formatting boundaries
**Deps**: archive/tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md

## Problem

Choice-options diagnostic details currently rely on pre-rendered free-form text. This is harder to extend safely for future tooling, deterministic formatting, and richer machine-readable diagnostics.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` currently returns pre-rendered `message`/`suggestion` strings plus `alternatives` copied from invalid runtime shapes.
2. Compiler and validator currently forward those kernel-rendered strings directly, adding layer-local diagnostic code/path/severity and cloning `alternatives`.
3. Mismatch: semantics and presentation are coupled in the shared kernel contract, which increases drift risk for future caller-local taxonomy and rendering policy changes.
4. Corrected scope: shared kernel contract should expose structured semantic fields only (reason + params + alternatives). Compiler/validator must each own final user-facing message/suggestion rendering from that structure.

## Architecture Check

1. Structured reason+params contracts are cleaner and more extensible than string-only payloads because they separate semantics from presentation.
2. This preserves architecture boundaries: kernel stays game-agnostic and semantic; caller layers own rendering/taxonomy; no GameSpecDoc or visual-config concerns are introduced.
3. No backwards-compatibility aliases/shims; migrate contract in-place and update all call sites/tests.

## What to Change

### 1. Introduce structured detail payload

Replace string-first detail object with structured fields (for example reason identifier + runtime/invalid shape params) in `choice-options-runtime-shape-contract.ts`.

### 2. Move final string rendering to caller layers

In `compile-effects.ts` and `validate-gamedef-behavior.ts`, build user-facing `message`/`suggestion` from structured payload while keeping layer-local diagnostic code ownership. Keep wording parity intentionally locked across caller layers via tests.

### 3. Update tests to assert structure + rendering parity

Adjust kernel contract tests for structured payload (including fresh-array determinism), preserve parity assertions across compiler/validator rendered diagnostics, and keep direct caller-suite coverage where choice-options diagnostics are emitted.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify only if assertion updates required)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify only if assertion updates required)

## Out of Scope

- Any GameSpecDoc or visual-config schema/data changes.
- Runtime behavior changes for valid choice options.
- Non-choice diagnostic contract refactors.

## Acceptance Criteria

### Tests That Must Pass

1. Kernel shared module emits structured, deterministic, game-agnostic choice-options diagnostic details with no pre-rendered user-facing strings.
2. Compiler/validator render equivalent user-facing detail text from shared structure while preserving layer-local diagnostic codes.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Choice-options runtime-shape invariant logic remains single-source and game-agnostic.
2. Diagnostic taxonomy ownership remains layer-local (CNL vs validator), with no cross-layer aliasing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` — assert structured detail payload contract and determinism.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — assert caller-rendered parity from shared structure.
3. `packages/engine/test/unit/compile-effects.test.ts` / `packages/engine/test/unit/validate-gamedef.test.ts` — adjust only where message text assertions require updates.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-contract.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
5. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Replaced string-first choice-options diagnostic details with structured semantic details in `choice-options-runtime-shape-contract.ts` (`reason`, `runtimeShapes`, `invalidShapes`, `alternatives`).
  - Moved final `message`/`suggestion` rendering to caller layers (`compile-effects.ts` and `validate-gamedef-behavior.ts`) while preserving layer-local diagnostic code ownership.
  - Updated kernel contract tests to assert structured payload shape and fresh-array determinism for all returned arrays.
  - Preserved compiler/validator parity coverage and executed focused + full engine test/lint suites.
- **Deviations From Original Plan**:
  - No additional deviations in implementation scope; plan remained accurate after assumption corrections.
  - `compile-effects.test.ts` and `validate-gamedef.test.ts` did not require assertion text changes because emitted wording remained intentionally stable.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused node tests for contract/parity/compiler/validator passed.
  - `pnpm -F @ludoforge/engine test` passed (`323` passed, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
