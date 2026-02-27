# ENGINEARCH-112: Probe-Authority Runtime Invariant Guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel choice-effect runtime reason invariants + unit coverage
**Deps**: tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md

## Problem

The new probe/strict ownership split is behaviorally covered through legality flows, but there is no direct invariant test that guards runtime-reason emission boundaries. A future refactor could accidentally emit probe-only reasons in strict execution paths (or vice versa) without fast, targeted failure.

## Assumption Reassessment (2026-02-27)

1. Current tests validate cross-seat probing behavior via `legalChoicesEvaluate` and strict submitted-param rejection behavior, but they do not directly assert the runtime reason partition for ownership mismatches.
2. `effects-choice.ts` now emits `choiceProbeAuthorityMismatch` only under discovery+probe policy, and `choiceRuntimeValidationFailed` otherwise.
3. Mismatch: architecture has an explicit policy split but lacks direct invariant-level tests for policy/reason coupling. Corrected scope: add focused tests for runtime reason boundaries, not broader behavior rewrites.

## Architecture Check

1. Explicit invariant tests for runtime reason partitioning are cleaner than relying only on indirect integration behavior.
2. This work is fully game-agnostic and touches only kernel runtime contracts; no GameSpecDoc or visual config coupling.
3. No backwards-compatibility aliases/shims; this is hardening of the canonical runtime contract.

## What to Change

### 1. Add direct ownership-mismatch runtime-reason tests

Create focused unit tests for `applyChooseOne`/`applyChooseN` that exercise ownership mismatch under:
- discovery + probe policy => `choiceProbeAuthorityMismatch`
- discovery + strict policy => `choiceRuntimeValidationFailed`
- execution + strict policy => `choiceRuntimeValidationFailed`

### 2. Keep taxonomy and behavior contract aligned

Assert the emitted reasons remain present in canonical runtime reason registries and do not drift from effect behavior.

## Files to Touch

- `packages/engine/test/unit/kernel/effects-choice.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify if parity assertions need extension)

## Out of Scope

- Additional decision-authority model changes.
- GameDef/GameSpecDoc schema changes.
- Runner/UI behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Ownership mismatch in discovery+probe mode emits `choiceProbeAuthorityMismatch`.
2. Ownership mismatch in strict contexts never emits `choiceProbeAuthorityMismatch`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Probe-only runtime reasons remain probe-only.
2. Strict resolution/error semantics stay deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effects-choice.test.ts` — direct runtime-reason boundary assertions for chooser ownership mismatch across mode/policy combinations.
2. `packages/engine/test/unit/kernel/runtime-reasons.test.ts` — ensures canonical reason registry remains aligned with runtime behavior contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effects-choice.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
