# ENGINEARCH-114: Effect-Context Boundary Guard Single Authority

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests only
**Deps**: None

## Problem

The same `applyEffects` boundary-constructor invariant is currently asserted by multiple guard tests, creating duplicate ownership of one architecture rule. This increases maintenance friction and makes intentional boundary evolution noisier than necessary.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` already owns full `applyEffects` boundary invariants: boundary module allowlist, constructor routing, and anti-inline wiring checks.
2. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` duplicates the constructor-routing portion of that same boundary invariant.
3. Discrepancy from initial scope: no behavioral or ownership gap exists in the canonical guard; only duplicate assertions in the contract test need removal.
4. Corrected scope: preserve `effect-mode-threading-guard` as the sole boundary-routing authority and narrow `effect-context-construction-contract` to `effect-context.ts` constructor-contract assertions only.

## Architecture Check

1. Single ownership per invariant is cleaner and more robust than duplicated guard assertions that can drift.
2. This change is test architecture only; it does not introduce game-specific behavior and keeps GameDef/runtime/kernel game-agnostic.
3. No backwards-compatibility shims or aliases; we remove redundancy directly.

## What to Change

### 1. Keep canonical boundary invariant ownership unchanged

Retain boundary allowlist + constructor-routing assertions in `effect-mode-threading-guard.test.ts` as-is.

### 2. Remove duplicate boundary assertions from the contract guard

Refactor the other guard test to validate only constructor-level contracts that are not already covered by boundary guard ownership.

### 3. Keep failure messages explicit and deterministic

Ensure guard failure diagnostics still point directly to the violated invariant and expected update action.

## Files to Touch

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

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — narrowed to constructor-internal contract checks only (no boundary routing assertions).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Removed duplicate boundary-routing assertions from `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`.
  - Kept `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` as the single owner of `applyEffects` boundary routing invariants.
  - Strengthened constructor-only contract coverage by asserting `createDiscoveryEffectContext` delegates to strict/probe constructors.
- **Deviation from original plan**:
  - Initial ticket scope said both guard files would be modified. Reassessment showed canonical ownership in `effect-mode-threading-guard.test.ts` was already correct, so only the contract test needed edits.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (315/315).
  - `pnpm -F @ludoforge/engine lint` passed.
