# TOKFILT-002: Enforce strict compiler token-filter prop contract parity with kernel

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler token-filter lowering context/validation (`compiler-core.ts`, `compile-conditions.ts`, related tests)
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md

## Problem

Compiler token-filter prop validation currently runs only when `tokenFilterProps` is present/non-empty in lowering context. Kernel `validateGameDef` now always validates token-filter props against declared token props plus intrinsic `id`.

This creates a contract gap: some specs can compile without token-filter prop diagnostics but fail later at kernel validation.

## Assumption Reassessment (2026-03-01)

1. `compile-conditions.ts` returns no unknown-prop diagnostic when `context.tokenFilterProps` is `undefined` or empty.
2. Kernel behavior validator now always enforces token-filter prop names via `tokenFilterPropCandidates` plus intrinsic `id`.
3. Current tests assert unknown-prop diagnostics only for the vocabulary-present compiler path; missing/empty vocabulary path is not pinned.
4. Mismatch correction: compiler scope must be updated so token-filter prop contract enforcement is deterministic and aligned with kernel.

## Architecture Check

1. Enforcing the same token-filter prop contract at compile time and kernel validation is cleaner than split enforcement with deferred failures.
2. Contract remains game-agnostic: allowed props are derived from declared token type/runtime data, not game-specific branches.
3. No backward-compatibility shims: non-`id` undeclared props should fail deterministically.

## What to Change

### 1. Make compiler token-filter prop contract always enforceable

Ensure compile context always carries canonical token-filter prop vocabulary for any path where token filters are legal, including synthetic runtime props derived from scenario/event-deck materialization.

### 2. Eliminate "skip validation" branch for missing/empty vocab

In `compile-conditions.ts`, remove the early-return behavior that suppresses unknown-prop diagnostics when `tokenFilterProps` is absent/empty. Intrinsic `id` remains allowed; all other unknown props should error.

### 3. Keep compiler and kernel alternatives/suggestions aligned

Use shared alternatives (`id` + canonical declared props) so diagnostics remain deterministic across layers.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify only if context plumbing is required)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add targeted parity test if unit coverage is insufficient)

## Out of Scope

- Kernel runtime token filtering semantics
- Runner/UI/`visual-config.yaml` concerns
- Seat-resolution architecture tickets (`SEATRES-*`)

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits unknown token-filter prop diagnostic for non-`id` props even when token-filter vocabulary would otherwise be absent/empty.
2. Compiler still accepts intrinsic `id` token-filter prop.
3. Compiler and kernel reject/accept the same token-filter prop shapes for equivalent inputs.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Token-filter prop contract is deterministic at compile boundary and kernel boundary.
2. `GameDef`/kernel/simulator remain game-agnostic.
3. No aliasing/back-compat path for undeclared token-filter props.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add negative test for non-`id` prop when token-filter vocab is absent/empty.
2. `packages/engine/test/unit/compile-conditions.test.ts` — keep/extend intrinsic `id` acceptance under absent/empty vocab.
3. `packages/engine/test/integration/compile-pipeline.test.ts` — add parity case if needed to prove compile-time failure occurs before kernel validation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
