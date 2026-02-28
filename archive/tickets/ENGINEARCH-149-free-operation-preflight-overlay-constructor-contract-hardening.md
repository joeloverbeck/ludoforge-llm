# ENGINEARCH-149: Harden Free-Operation Preflight Overlay Constructor Contract and Surface Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract typing and constructor-level test hardening
**Deps**: archive/tickets/ENGINEARCH-143-free-operation-preflight-overlay-single-constructor-contract.md

## Problem

The canonical free-operation preflight overlay constructor is in place, but its contract is still loosely coupled to one specific analysis result type and constructor tests currently assert diagnostics on only one surface (`legalChoices`). This leaves avoidable drift risk in strict-surface diagnostics and future analysis producer refactors.

## Assumption Reassessment (2026-02-28)

1. Confirmed: `buildFreeOperationPreflightOverlay(...)` currently accepts `Pick<FreeOperationDiscoveryAnalysisResult, 'executionPlayer' | 'zoneFilter'> | null | undefined` and emits overlay fields for preflight.
2. Confirmed: both strict/apply and discovery/legal-choices call sites consume the constructor and pass their own diagnostics surface (`turnFlowEligibility`, `legalChoices`).
3. Confirmed: constructor unit tests currently validate missing analysis, execution override, and zone-filter diagnostics payload, but only assert diagnostics source for `legalChoices`.
4. Scope correction: because call sites already pass the expected shape structurally, `apply-move.ts` and `legal-choices.ts` are expected to remain behaviorally unchanged unless the tightened contract forces follow-up type alignment.

## Architecture Check

1. Narrowing constructor input to a minimal local contract and locking both diagnostics surfaces produces a cleaner, more extensible ownership boundary.
2. This is kernel-internal, game-agnostic contract hygiene; no game-specific logic leaks into GameDef/runtime/simulator.
3. No backwards-compatibility aliasing/shims; tighten the contract directly and update all call sites/tests only if required by typing.

## What to Change

### 1. Introduce a minimal local constructor input contract

Define an internal type owned by the constructor module for just the required fields (`executionPlayer`, optional `zoneFilter`) and migrate function signature to that contract.

### 2. Strengthen constructor-level surface matrix tests

Add explicit tests for diagnostics source and payload on both `legalChoices` and `turnFlowEligibility` surfaces, including no-zone-filter branch assertions.

### 3. Keep call sites aligned to the tightened contract

Update call sites only as needed for stricter typing, without changing runtime behavior.

## Files to Touch

- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` (modify/add)
- `packages/engine/src/kernel/apply-move.ts` (modify only if type alignment requires)
- `packages/engine/src/kernel/legal-choices.ts` (modify only if type alignment requires)

## Out of Scope

- Free-operation legality semantics changes.
- Action/pipeline selector semantics changes.
- Any GameSpecDoc or visual-config content/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Constructor-level contract is explicitly validated for both diagnostics surfaces.
2. Constructor input type is minimal and locally owned; no unnecessary coupling to broader analysis result types.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation overlay construction remains single-owner and game-agnostic.
2. Strict and discovery diagnostics surfaces remain deterministic and parity-safe.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` — add coverage for `turnFlowEligibility` diagnostics source/payload and explicit no-zone-filter diagnostics absence.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` / `packages/engine/test/unit/kernel/legal-choices.test.ts` — no behavioral assertions expected to change; run as regression guards.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Tightened the overlay constructor contract to a minimal, locally owned input shape:
    - `packages/engine/src/kernel/free-operation-preflight-overlay.ts`
  - Further decoupled overlay constructor contracts from `EvalContext` field aliases by defining constructor-owned diagnostics/output typing with core kernel types (`PlayerId`, `ConditionAST`, `Move['params']`):
    - `packages/engine/src/kernel/free-operation-preflight-overlay.ts`
  - Expanded constructor-level coverage to lock diagnostics payload/source across both surfaces and explicit no-zone-filter behavior:
    - `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts`
- **What changed vs originally planned**:
  - `apply-move.ts` and `legal-choices.ts` did not require edits because existing call-site objects already satisfy the stricter constructor contract structurally.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# pass 327`, `# fail 0`)
  - `pnpm turbo lint` ✅
