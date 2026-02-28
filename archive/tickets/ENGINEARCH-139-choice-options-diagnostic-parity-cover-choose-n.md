# ENGINEARCH-139: Choice-Options Diagnostic Parity Coverage for `chooseN`

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/CNL diagnostic parity test coverage
**Deps**: archive/tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md

## Problem

`chooseOne` cross-layer diagnostic parity is now covered, but `chooseN` parity is not explicitly locked. This leaves room for future drift in message/suggestion/alternatives between compiler and validator for `chooseN` shape violations.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` currently asserts cross-layer parity only for `chooseOne`.
2. `packages/engine/src/cnl/compile-effects.ts` and `packages/engine/src/kernel/validate-gamedef-behavior.ts` both build `chooseN` shape diagnostics via shared details + layer-local code/path/severity.
3. `chooseN` runtime-shape diagnostics are already tested per layer in:
   - `packages/engine/test/unit/compile-effects.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
4. Mismatch: coverage exists for each layer independently, but cross-layer parity is only locked for `chooseOne`. Corrected scope: extend parity tests to include `chooseN`.

## Architecture Check

1. Parity tests at the contract boundary are cleaner than relying on duplicated assertions in distant suites and prevent silent caller drift.
2. This preserves boundaries: game-specific behavior remains in GameSpecDoc/GameDef data, while compiler/validator diagnostic plumbing remains game-agnostic.
3. No backwards-compatibility aliasing/shims; enforce strict parity in-place.

## What to Change

### 1. Extend cross-layer parity tests for `chooseN`

Add a `chooseN` case to the kernel parity test to assert compiler/validator detail payload equality (`message`, `suggestion`, `alternatives`) while keeping diagnostic codes layer-specific.

### 2. Keep scope limited to contract parity

Do not change runtime semantics or diagnostic policy; only harden cross-layer parity coverage.

## Files to Touch

- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify)

## Out of Scope

- Any GameSpecDoc or visual-config YAML changes.
- Runtime choice semantics changes.
- Diagnostic code taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. `chooseN` parity test fails if compiler and validator detail payloads diverge.
2. Existing `chooseOne` parity behavior remains covered.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared choice-options diagnostic detail contract remains single-source.
2. Diagnostic taxonomy ownership remains caller-local (CNL vs validator) with game-agnostic kernel/runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — add `chooseN` parity assertion to prevent cross-layer drift.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-28
- What actually changed:
  - Updated assumption scope to reflect existing per-layer `chooseN` coverage and clarify the remaining gap is cross-layer parity only.
  - Extended `choice-options-runtime-shape-diagnostic-parity` to assert compiler/validator parity for both `chooseOne` and `chooseN` via a table-driven case set.
- Deviations from original plan:
  - No architectural/runtime behavior changes were needed; work remained strictly in parity test coverage and ticket assumptions.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (323/323).
  - `pnpm -F @ludoforge/engine lint` passed.
