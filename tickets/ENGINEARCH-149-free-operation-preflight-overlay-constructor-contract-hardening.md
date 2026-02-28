# ENGINEARCH-149: Harden Free-Operation Preflight Overlay Constructor Contract and Surface Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract typing and constructor-level test hardening
**Deps**: archive/tickets/ENGINEARCH-143-free-operation-preflight-overlay-single-constructor-contract.md

## Problem

The canonical free-operation preflight overlay constructor is in place, but its contract is still loosely coupled to one specific analysis result type and constructor tests currently assert diagnostics on only one surface (`legalChoices`). This leaves avoidable drift risk in strict-surface diagnostics and future analysis producer refactors.

## Assumption Reassessment (2026-02-28)

1. Confirmed: `buildFreeOperationPreflightOverlay(...)` accepts a `Pick<FreeOperationDiscoveryAnalysisResult, ...>` input and emits overlay fields for preflight.
2. Confirmed: constructor test coverage validates null/defined analysis and diagnostics payload, but only asserts diagnostics source for `legalChoices`.
3. Mismatch: constructor contract is not yet explicitly locked for both diagnostics surfaces (`legalChoices` and `turnFlowEligibility`) and is more tightly coupled than necessary to one analysis type source.

## Architecture Check

1. Narrowing constructor input to a minimal local contract and locking both diagnostics surfaces produces a cleaner, more extensible ownership boundary.
2. This is kernel-internal, game-agnostic contract hygiene; no game-specific logic leaks into GameDef/runtime/simulator.
3. No backwards-compatibility aliasing/shims; tighten the contract directly and update all call sites/tests.

## What to Change

### 1. Introduce a minimal local constructor input contract

Define an internal type owned by the constructor module for just the required fields (`executionPlayer`, optional `zoneFilter`) and migrate function signature to that contract.

### 2. Strengthen constructor-level surface matrix tests

Add explicit tests for diagnostics source and payload on both `legalChoices` and `turnFlowEligibility` surfaces, including no-zone-filter branch assertions.

### 3. Keep call sites aligned to the tightened contract

Update call sites only as needed for stricter typing, without changing runtime behavior.

## Files to Touch

- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if type alignment requires)
- `packages/engine/src/kernel/legal-choices.ts` (modify only if type alignment requires)
- `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` (modify/add)

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

1. `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` — add coverage for `turnFlowEligibility` diagnostics source and explicit no-zone-filter diagnostics absence.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` / `packages/engine/test/unit/kernel/legal-choices.test.ts` — no behavioral assertions expected to change; run as regression guards.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

