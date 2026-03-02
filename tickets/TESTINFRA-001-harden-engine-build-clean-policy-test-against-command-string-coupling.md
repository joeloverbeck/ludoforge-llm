# TESTINFRA-001: Harden engine build-clean policy test against command-string coupling

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — test robustness for engine build policy guard
**Deps**: archive/tickets/SEATRES-030-strictly-type-active-seat-invariant-surfaces.md

## Problem

The new build policy test currently enforces an exact script prefix (`^pnpm run clean && `). This is brittle: equivalent valid build scripts can fail the test even when they preserve the required invariant (cleaning `dist` before TypeScript compilation).

## Assumption Reassessment (2026-03-02)

1. Engine build now uses `pnpm run clean && tsc` to prevent stale `dist` artifacts from polluting test runs.
2. The policy test currently validates this via a strict regex against raw command text.
3. No active ticket currently tracks making this policy assertion intent-based (ordered behavior) rather than literal command-shape matching.

## Architecture Check

1. Testing behavior-level intent (clean-before-compile) is cleaner and more extensible than asserting one exact shell string.
2. This change touches test/tooling only and does not alter `GameSpecDoc`, `GameDef`, or simulation runtime behavior.
3. No backwards-compat aliases: the stricter architectural invariant remains required; only the assertion strategy becomes resilient.

## What to Change

### 1. Replace string-prefix assertion with intent-level assertion

1. Update the lint/policy test to parse or inspect the build script for ordered execution semantics: clean command must run before compile command.
2. Permit equivalent command shapes that satisfy the same invariant (for example alternate clean invocations or script chaining style) while still rejecting missing clean-step behavior.

### 2. Add negative/edge coverage for policy guard

1. Add test coverage that demonstrates rejection when `build` compiles without a clean step.
2. Keep the test self-contained and independent of shell-specific syntax details where possible.

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
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
