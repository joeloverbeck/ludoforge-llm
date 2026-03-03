# TESTINFRA-001: Harden engine build-clean policy test against command-string coupling

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — test robustness for engine build policy guard
**Deps**: archive/tickets/SEATRES-030-strictly-type-active-seat-invariant-surfaces.md

## Problem

Current policy coverage is coupled to one exact command prefix (`^pnpm run clean && `). This is brittle and under-specified:

1. Equivalent command shapes that still preserve the invariant can fail.
2. The test currently has no explicit negative assertions for missing clean-step or wrong order.

## Assumption Reassessment (2026-03-03)

1. `packages/engine/package.json` currently defines `build` as `pnpm run clean && tsc`.
2. `packages/engine/test/unit/lint/build-script-clean-policy.test.ts` currently uses a strict regex prefix check, so it validates command text shape, not ordered behavior.
3. The current test includes only a positive case and does not directly prove rejection when clean is absent or appears after compile.
4. No other active ticket currently targets this exact policy test hardening.

## Architecture Check

1. Testing behavior-level intent (clean-before-compile) is cleaner and more extensible than asserting one exact shell string.
2. This change touches test/tooling only and does not alter `GameSpecDoc`, `GameDef`, or simulation runtime behavior.
3. No backwards-compat aliases: the stricter architectural invariant remains required; only the assertion strategy becomes resilient.

## What to Change

### 1. Replace string-prefix assertion with intent-level assertion

1. Update the lint/policy test to evaluate ordered command segments in `build`: clean command must appear before compile command.
2. Keep the policy deterministic by validating `&&`-chained segments and command intent (`clean` step and TypeScript compile step), rather than a single hardcoded prefix string.
3. Permit equivalent clean-before-compile script shapes while rejecting scripts that miss the clean behavior.

### 2. Add negative/edge coverage for policy guard

1. Add test coverage that demonstrates rejection when `build` compiles without a clean step.
2. Add test coverage that demonstrates rejection when clean appears after compile.
3. Keep assertions self-contained and avoid dependence on one exact literal script string.

## Files to Touch

- `packages/engine/test/unit/lint/build-script-clean-policy.test.ts` (modify)
- `packages/engine/package.json` (modify only if needed to align with improved policy checks)

## Out of Scope

- Changing engine package build/test command topology beyond clean-before-compile invariant
- Turbo task graph redesign
- General script normalization across workspace packages

## Acceptance Criteria

### Tests That Must Pass

1. Policy test passes for valid clean-before-compile script shapes without requiring one exact command prefix.
2. Policy test fails when clean step is absent or ordered after compile.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Lint/typecheck for engine package pass after test changes.

### Invariants

1. Engine build always guarantees stale `dist` artifacts are removed before TypeScript output is generated.
2. Policy guard remains deterministic and robust across harmless script refactors.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/build-script-clean-policy.test.ts` — assert behavior-level clean-before-compile policy and negative cases.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/build-script-clean-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Replaced strict prefix matching in `build-script-clean-policy.test.ts` with intent-based invariant checks over ordered `&&` command steps.
  - Added explicit coverage for equivalent valid script shapes, missing clean-step rejection, and clean-after-compile rejection.
  - Preserved existing engine `build` script (`pnpm run clean && tsc`); no runtime/compiler architecture changes were required.
- **Deviations From Original Plan**:
  - No `packages/engine/package.json` change was needed because current `build` script already satisfied the invariant.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/lint/build-script-clean-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
