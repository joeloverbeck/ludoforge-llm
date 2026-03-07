# LEGACTTOO-032: Limit Identity Contract Centralization and Semantic Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics, kernel validation semantics, shared identity contract module
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-030-first-class-limit-identity-contract.md, tickets/LEGACTTOO-031-limit-identity-invariant-test-hardening.md

## Problem

Limit IDs are now first-class in `LimitDef`, but identity semantics are still fragmented:

1. Canonical ID formatting is implemented locally in compile lowering as string concatenation.
2. Schema enforces only `id: string`, with no semantic validation for uniqueness/canonicality per action.
3. Compiler diagnostic text for malformed limits still documents the old shape without `id`.

This leaves room for invalid/duplicate IDs in externally-authored `GameDef` inputs and keeps identity rules distributed across unrelated files.

## Assumption Reassessment (2026-03-07)

1. Canonical IDs are generated in `lowerActionLimits` using `${actionId}::${scope}::${index}` string construction. Confirmed in `packages/engine/src/cnl/compile-lowering.ts`.
2. `LimitDefSchema` requires `id` but does not enforce uniqueness or canonical format. Confirmed in `packages/engine/src/kernel/schemas-core.ts`.
3. `validate-gamedef*` currently has no action-limit semantic checks, so duplicate IDs can pass kernel validation. Confirmed by search over `packages/engine/src/kernel/validate-gamedef*.ts`.
4. Compiler missing-capability suggestion for limits is stale and still references `{ scope, max }`. Confirmed in `packages/engine/src/cnl/compile-lowering.ts`.

## Architecture Check

1. A single shared limit-identity contract module (build/parse/validate) is cleaner than duplicated string templates and ad-hoc checks.
2. Semantic validation belongs in game-agnostic kernel validation layers (`GameDef` contract), not game-specific docs/assets.
3. No backwards-compatibility aliases/shims: enforce canonical limit IDs directly and fail fast on invalid contracts.

## What to Change

### 1. Introduce canonical limit identity contract utilities

Add a focused shared module for limit identity:
- canonical builder (`buildCanonicalLimitId`)
- parser/validator (`parseCanonicalLimitId`/`isCanonicalLimitIdForAction`)

Consume this module in compiler lowering to remove local string-template ownership.

### 2. Enforce semantic ID invariants in `validate-gamedef`

For each action with limits:
- reject duplicate `limit.id` values within the same action
- reject IDs that do not match canonical `${actionId}::${scope}::${index}` for that limit entry

Emit explicit diagnostics with actionable paths (`actions.<i>.limits.<j>.id`).

### 3. Align compiler diagnostics with the new contract

Update malformed-limit diagnostics in compile lowering so expected shape includes required `id` semantics.

### 4. Add contract-focused tests

Add/extend unit tests for:
- canonical identity utility behavior
- validator rejection for duplicate/non-canonical limit IDs
- compiler diagnostic text consistency for malformed limit entries

## Files to Touch

- `packages/engine/src/kernel/` (new module for limit identity contract)
- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef*.ts` (modify targeted semantic validator entry points)
- `packages/engine/test/unit/` (modify/add targeted tests)

## Out of Scope

- Runner UI rendering/style changes
- Changes to GameSpecDoc author-facing limit syntax
- Any game-specific behavior branching

## Acceptance Criteria

### Tests That Must Pass

1. Validator rejects duplicate limit IDs within an action with deterministic diagnostics.
2. Validator rejects non-canonical limit IDs for each action limit row.
3. Compiler/lowering uses shared canonical ID builder (no local format duplication).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Limit identity semantics are centralized in one shared contract module.
2. `GameDef` limit identity remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<new-limit-identity-contract>.test.ts` — builder/parser/validator contract behavior.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — duplicate and non-canonical limit ID rejection diagnostics.
3. `packages/engine/test/unit/compile-actions.test.ts` (or compile-lowering-focused test) — compiler path uses canonical IDs and updated diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine typecheck && pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-07
- **What changed**: All four deliverables were already implemented by prior tickets (LEGACTTOO-030, LEGACTTOO-031). The remaining gap was a missing compiler-lowering test for malformed limit diagnostic text consistency. Added `packages/engine/test/unit/compile-lowering-action-limits.test.ts` (5 tests) covering canonical ID assignment, multi-limit canonical IDs, malformed-limit diagnostic shape (verifying `<actionId>::<scope>::<index>` in alternatives), non-integer max, and negative max.
- **Deviations from plan**: No `compile-actions.test.ts` was created; instead the test was placed in `compile-lowering-action-limits.test.ts` to match the existing naming pattern (`compile-lowering-action-defaults.test.ts`).
- **Verification**: 4246/4246 engine tests pass. Typecheck and lint clean.
