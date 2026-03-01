# TOKFILT-002: Enforce strict compiler token-filter prop contract parity with kernel

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler token-filter prop validation + unit coverage alignment (`compile-conditions.ts`, related tests)
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md

## Problem

Compiler token-filter prop validation currently runs only when `tokenFilterProps` is present/non-empty in lowering context. Kernel `validateGameDef` now always validates token-filter props against declared token props plus intrinsic `id`.

This creates a contract gap: some specs can compile without token-filter prop diagnostics but fail later at kernel validation.

## Assumption Reassessment (2026-03-01)

1. `compile-conditions.ts` returns no unknown-prop diagnostic when `context.tokenFilterProps` is `undefined` or empty.
2. Kernel behavior validator now always enforces token-filter prop names via `tokenFilterPropCandidates` plus intrinsic `id`.
3. Current tests assert unknown-prop diagnostics only for the vocabulary-present compiler path; missing/empty vocabulary path is not pinned.
4. `compiler-core.ts` already computes token-filter vocabulary from final token types after scenario-deck synthetic token type insertion (`cardId`, `eventDeckId`, `isCoup`), and integration coverage already exists for synthetic-prop acceptance.
5. Scope correction: mismatch is localized to compiler prop validation behavior under absent/empty vocab, not to token-filter vocabulary plumbing.

## Architecture Check

1. Enforcing the same token-filter prop contract at compile time and kernel validation is cleaner than split enforcement with deferred failures.
2. Contract remains game-agnostic: allowed props are derived from declared token type/runtime data, not game-specific branches.
3. No backward-compatibility shims: non-`id` undeclared props should fail deterministically.

## What to Change

### 1. Eliminate "skip validation" branch for missing/empty vocab

In `compile-conditions.ts`, remove the early-return behavior that suppresses unknown-prop diagnostics when `tokenFilterProps` is absent/empty. Intrinsic `id` remains allowed; all other unknown props should error.

### 2. Keep compiler and kernel alternatives/suggestions aligned

Use shared alternatives (`id` + canonical declared props) so diagnostics remain deterministic across layers.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (optional; modify only if unit coverage is insufficient)

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

1. `packages/engine/test/unit/compile-conditions.test.ts` — add negative test for non-`id` prop when token-filter vocab is absent.
2. `packages/engine/test/unit/compile-conditions.test.ts` — add negative test for non-`id` prop when token-filter vocab is explicitly empty.
3. `packages/engine/test/unit/compile-conditions.test.ts` — add intrinsic `id` acceptance test under absent/empty vocab.
4. `packages/engine/test/integration/compile-pipeline.test.ts` — no change required unless unit coverage fails to demonstrate compiler/kernel contract parity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-03-01
- What actually changed:
  - Removed the compiler-side skip branch so token-filter prop validation no longer bypasses unknown-prop checks when `tokenFilterProps` is absent/empty.
  - Added unit coverage in `compile-conditions.test.ts` for:
    - non-`id` prop rejection when token-filter vocabulary is absent
    - non-`id` prop rejection when token-filter vocabulary is explicitly empty
    - intrinsic `id` acceptance when vocabulary is absent/empty
  - Updated existing compiler unit tests that intentionally use non-`id` token filter props to declare `tokenFilterProps` explicitly in lowering context.
  - Updated `compile-effects.test.ts` contexts for reveal/conceal token-filter cases so they declare token-filter props under the stricter contract.
- Deviations from original plan:
  - No `compiler-core.ts`, `compile-lowering.ts`, or integration test changes were required.
  - Additional unit test alignment in `compile-effects.test.ts` was required to preserve deterministic test semantics under the stricter contract.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
