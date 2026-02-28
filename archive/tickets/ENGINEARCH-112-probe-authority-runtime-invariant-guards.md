# ENGINEARCH-112: Probe-Authority Runtime Invariant Guards

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel choice-effect runtime reason invariants + unit coverage
**Deps**: archive/tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md

## Problem

The new probe/strict ownership split is behaviorally covered through legality flows, but there is no direct invariant test that guards runtime-reason emission boundaries. A future refactor could accidentally emit probe-only reasons in strict execution paths (or vice versa) without fast, targeted failure.

## Assumption Reassessment (2026-02-27)

1. Current tests validate strict cross-seat rejection through `legalChoicesEvaluate` (for chooser-owned decisions) and include taxonomy-level assertions for runtime reason strings, but they do not execute a direct discovery+probe ownership mismatch path and assert emitted reason boundaries.
2. `effects-choice.ts` emits `choiceProbeAuthorityMismatch` only when `mode === 'discovery'` and `decisionAuthority.ownershipEnforcement === 'probe'`; otherwise ownership mismatch emits `choiceRuntimeValidationFailed`.
3. Mismatch: ticket referenced stale/non-existent test files (`effects-choice.test.ts`) and an outdated source path (`kernel/effects/effects-choice.ts`). Corrected scope: add focused apply-effect invariant tests for ownership mismatch reason partitioning in current test layout.

## Architecture Check

1. Explicit invariant tests for runtime reason partitioning are cleaner than relying only on indirect integration behavior.
2. This work is fully game-agnostic and touches only kernel runtime contracts; no GameSpecDoc or visual config coupling.
3. No backwards-compatibility aliases/shims; this is hardening of the canonical runtime contract.

## What to Change

### 1. Add direct ownership-mismatch runtime-reason tests

Create focused unit tests (via `applyEffect`) for `applyChooseOne`/`applyChooseN` behavior that exercise ownership mismatch under:
- discovery + probe policy => `choiceProbeAuthorityMismatch`
- discovery + strict policy => `choiceRuntimeValidationFailed`
- execution + strict policy => `choiceRuntimeValidationFailed`

### 2. Keep taxonomy and behavior contract aligned

Assert emitted reasons match canonical reason constants to prevent behavior/registry drift.

## Files to Touch

- `packages/engine/test/unit/kernel/choice-membership-parity.test.ts` (modify/add ownership-mismatch invariant tests)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (no-op unless parity assertions need extension)

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

1. `packages/engine/test/unit/kernel/choice-membership-parity.test.ts` — direct runtime-reason boundary assertions for chooser ownership mismatch across mode/policy combinations and choice primitives.
2. `packages/engine/test/unit/kernel/runtime-reasons.test.ts` — unchanged unless additional parity assertions are required.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-membership-parity.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Reassessed and corrected stale assumptions/file paths in this ticket to match current code layout.
  - Added direct runtime invariant tests in `packages/engine/test/unit/kernel/choice-membership-parity.test.ts` for chooser ownership mismatch reason partitioning across:
    - discovery + probe => `choiceProbeAuthorityMismatch`
    - discovery + strict => `choiceRuntimeValidationFailed`
    - execution + strict => `choiceRuntimeValidationFailed`
  - Kept runtime reason taxonomy tests (`runtime-reasons.test.ts`) unchanged because canonical coverage already existed; new behavior tests now couple emitted reasons to canonical constants.
- **Deviations from original plan**:
  - Original ticket referenced non-existent `effects-choice.test.ts`; implementation used the existing choice parity test module as the focused runtime invariant home.
  - `runtime-reasons.test.ts` was not modified because no additional registry assertions were required after reassessment.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/choice-membership-parity.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/runtime-reasons.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`314` passed, `0` failed)
  - `pnpm -F @ludoforge/engine lint` ✅
