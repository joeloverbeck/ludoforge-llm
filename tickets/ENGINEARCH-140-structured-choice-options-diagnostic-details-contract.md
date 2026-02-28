# ENGINEARCH-140: Structured Choice-Options Diagnostic Details Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel diagnostic detail contract shape + caller formatting boundaries
**Deps**: archive/tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md

## Problem

Choice-options diagnostic details currently rely on pre-rendered free-form text. This is harder to extend safely for future tooling, deterministic formatting, and richer machine-readable diagnostics.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` currently returns `message` and `suggestion` strings plus `alternatives` for shape violations.
2. Compiler and validator currently consume those strings directly, adding only layer-local code/path/severity.
3. Mismatch: current detail payload is not structured for future rendering policy evolution. Corrected scope: introduce structured, game-agnostic detail payload and have callers render final strings locally.

## Architecture Check

1. Structured reason+params contracts are cleaner and more extensible than string-only payloads because they separate semantics from presentation.
2. This preserves architecture boundaries: kernel stays game-agnostic and semantic; caller layers own rendering/taxonomy; no GameSpecDoc or visual-config concerns are introduced.
3. No backwards-compatibility aliases/shims; migrate contract in-place and update all call sites/tests.

## What to Change

### 1. Introduce structured detail payload

Replace string-first detail object with structured fields (for example reason identifier + runtime/invalid shape params) in `choice-options-runtime-shape-contract.ts`.

### 2. Move final string rendering to caller layers

In `compile-effects.ts` and `validate-gamedef-behavior.ts`, build user-facing `message`/`suggestion` from structured payload while keeping layer-local diagnostic code ownership.

### 3. Update tests to assert structure + rendering parity

Adjust kernel contract tests for structured payload and preserve parity assertions across compiler/validator rendered diagnostics.

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

1. Kernel shared module emits structured, deterministic choice-options diagnostic details with no caller taxonomy.
2. Compiler/validator render equivalent user-facing detail text from shared structure.
3. Existing suite: `pnpm -F @ludoforge/engine test`

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
