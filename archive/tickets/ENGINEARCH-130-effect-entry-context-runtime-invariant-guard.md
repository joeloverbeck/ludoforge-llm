# ENGINEARCH-130: Effect Entry Context Runtime Invariant Guard

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-dispatch runtime context validation
**Deps**: archive/tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md

## Problem

`applyEffect`/`applyEffects` currently trust `EffectContext` shape at runtime. Typed callers are safe, but malformed untyped inputs (`as any` / JS interop) can still reach effect handlers with invalid authority/mode combinations.

## Assumption Reassessment (2026-02-28)

1. `EffectContext` is now discriminated by mode and authority in type space.
2. Runtime entry points in `effect-dispatch.ts` do not assert authority/mode coherence before execution.
3. `ENGINEARCH-114/115/116` are completed (archived) and strengthened constructor-routing guard tests only; they do not add runtime entry invariant checks in `applyEffect`/`applyEffects`.
4. Corrected scope: add fast-fail runtime contract validation at effect entry boundaries for malformed untyped contexts.

## Architecture Check

1. Runtime invariant guards at engine boundaries are cleaner and more robust than relying only on compile-time typing.
2. The invariant is purely engine contract logic and remains game-agnostic; no game-specific branching is added.
3. No compatibility shims or aliases: invalid contexts should hard-fail immediately.

## What to Change

### 1. Add context coherence validator in effect-dispatch

Add a small internal assertion that rejects impossible combinations (for example `mode: 'execution'` with probe authority).

### 2. Enforce validator at both public entry points

Call validator in both `applyEffect` and `applyEffects` before budget creation.

### 3. Add focused runtime invariant tests

Add unit tests that pass malformed contexts via casts and assert deterministic runtime errors.

### 4. Keep canonical architecture guard ownership unchanged

Do not duplicate constructor-routing policy checks already covered by `effect-mode-threading-guard.test.ts`; this ticket only adds runtime entry contract enforcement.

## Files to Touch

- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` or `packages/engine/src/kernel/effect-error.ts` (modify if new error code/context shape is needed)
- `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` (modify or extend)
- `packages/engine/test/unit/effects-choice.test.ts` (modify if needed)

## Out of Scope

- Redesign of choice illegal-reason taxonomy.
- Changes to GameSpecDoc or visual-config schema/data contracts.
- Runner transport/UI concerns.

## Acceptance Criteria

### Tests That Must Pass

1. Malformed effect contexts fail fast at entry points before effect execution.
2. Valid execution/discovery strict/probe flows remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime enforces authority/mode coherence at effect entry boundaries.
2. Error behavior remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` — adds malformed-context entry assertions.
2. `packages/engine/test/unit/effect-error-contracts.test.ts` or equivalent kernel runtime-error contract test — verifies stable error code/reason contract for invariant failures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js`
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed vs originally planned**:
  - Added runtime entry invariant validation in `effect-dispatch.ts` for `applyEffect` and `applyEffects`, rejecting malformed mode/authority combinations before budget creation and effect execution.
  - Added malformed-context assertions in `choice-authority-runtime-invariants.test.ts` covering both entry points.
  - Added deterministic error-contract coverage in `effect-error-contracts.test.ts` for invariant-violation reason/context payload.
- **Scope correction applied first**:
  - Updated assumption text to reflect that `ENGINEARCH-114/115/116` were already completed/archived and did not provide runtime entry-point guards.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js` passed.
  - `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (320/320).
  - `pnpm -F @ludoforge/engine lint` passed.
