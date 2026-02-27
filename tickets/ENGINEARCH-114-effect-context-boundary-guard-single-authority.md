# ENGINEARCH-114: Effect-Context Boundary Guard Single Authority

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests only
**Deps**: None

## Problem

The same `applyEffects` boundary-constructor invariant is currently asserted by multiple guard tests, creating duplicate ownership of one architecture rule. This increases maintenance friction and makes intentional boundary evolution noisier than necessary.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` asserts canonical constructor routing for all runtime `applyEffects` boundary modules.
2. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` also asserts the same boundary routing invariant.
3. Mismatch: one invariant is owned by two tests. Corrected scope: keep one canonical boundary guard owner and narrow the second test to non-overlapping constructor-contract assertions.

## Architecture Check

1. Single ownership per invariant is cleaner and more robust than duplicated guard assertions that can drift.
2. This change is test architecture only; it does not introduce game-specific behavior and keeps GameDef/runtime/kernel game-agnostic.
3. No backwards-compatibility shims or aliases; we remove redundancy directly.

## What to Change

### 1. Assign one canonical boundary invariant owner

Keep boundary allowlist + constructor-routing assertions in one test module only.

### 2. Remove duplicate boundary assertions from the second guard

Refactor the other guard test to validate only constructor-level contracts that are not already covered by boundary guard ownership.

### 3. Keep failure messages explicit and deterministic

Ensure guard failure diagnostics still point directly to the violated invariant and expected update action.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in kernel effect execution.
- Decision authority type-model redesign.
- Any GameSpecDoc/visual-config schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Exactly one guard test owns `applyEffects` boundary constructor-routing assertions.
2. Constructor contract coverage remains present without duplicating boundary routing checks.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime boundary constructor policy remains explicitly guarded.
2. Guard-test ownership remains DRY and non-overlapping.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — retains single ownership of boundary module allowlist and constructor-routing invariants.
2. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — narrowed to constructor-internal contract checks only.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
