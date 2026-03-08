# ENG-209: Strengthen Kernel Boundary Cycle Guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests and import-boundary contracts
**Deps**: archive/tickets/ENG-206-decouple-viability-probe-from-kernel-cycle.md, packages/engine/src/kernel/legal-choices.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/turn-flow-action-class.ts, packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts

## Problem

Current boundary guard coverage is narrow: it blocks one specific legacy import symbol but not the full import edge that caused the cycle. It also lacks explicit export-surface guard coverage for newly extracted boundary modules.

## Assumption Reassessment (2026-03-08)

1. `free-operation-discovery-boundary.test.ts` currently asserts that `legal-choices.ts` does not import one symbol from `turn-flow-eligibility.ts`.
2. The same file does not assert that `legal-choices.ts` has zero imports from `turn-flow-eligibility.ts`, so alternate symbol imports could reintroduce cycle risk.
3. Mismatch: guard intent is acyclic layering, but current test leaves a bypass path. Correction: enforce full import-edge prohibition and add export-surface guards for extracted modules.

## Architecture Check

1. Explicit boundary guards are cleaner than relying on convention and reduce regression risk during refactors.
2. This is purely architecture/test hardening in agnostic kernel layers and does not inject game-specific logic.
3. No compatibility shims: enforce the canonical boundary directly and fail fast on violations.

## What to Change

### 1. Enforce full boundary prohibition for `legal-choices`

Update architecture guard tests so `legal-choices.ts` must not import `turn-flow-eligibility.ts` at all.

### 2. Add module export-surface guards

Add strict source export contract guards for extracted boundary modules (for example `turn-flow-action-class.ts` and free-operation discovery modules) so surface changes require deliberate updates.

### 3. Add cycle-focused invariant coverage

Add/strengthen guard assertions that represent the exact cycle edge set (`turn-flow-eligibility -> move-decision-sequence -> legal-choices` with no back-edge to `turn-flow-eligibility`).

## Files to Touch

- `packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/<kernel-boundary-cycle-guard>.test.ts` (new/modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify if needed)

## Out of Scope

- Free-operation grant semantics/policy contracts (ENG-202/ENG-203/ENG-207).
- Card data encoding changes (ENG-204).

## Acceptance Criteria

### Tests That Must Pass

1. `legal-choices.ts` has no direct import edge to `turn-flow-eligibility.ts`.
2. Extracted boundary modules have explicit curated export-surface guard coverage.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/free-operation-discovery-boundary.test.js packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js`

### Invariants

1. The previously observed cycle edge cannot be reintroduced without failing architecture guard tests.
2. Kernel boundary modules remain game-agnostic and strictly layered.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts` — forbid any `legal-choices.ts -> turn-flow-eligibility.ts` import.
2. `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` — enforce strict export/import contract for canonical action-class module.
3. `packages/engine/test/unit/kernel/<kernel-boundary-cycle-guard>.test.ts` — represent cycle-edge invariant explicitly.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-discovery-boundary.test.js packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
