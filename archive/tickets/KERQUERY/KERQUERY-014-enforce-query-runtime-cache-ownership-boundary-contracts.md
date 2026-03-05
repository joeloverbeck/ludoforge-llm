# KERQUERY-014: Enforce query runtime cache ownership boundary contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel import-boundary and ownership contract tests for query runtime cache
**Deps**: archive/tickets/KERQUERY/KERQUERY-009-encapsulate-query-runtime-cache-and-contract-tests.md, archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts

## Problem

Query runtime cache ownership was moved to `query-runtime-cache.ts`, but there is no explicit contract/lint test preventing future re-introduction of cache-contract ownership or aliasing through `eval-context.ts` (or other modules). Without a boundary lock, architectural drift can silently reappear.

## Assumption Reassessment (2026-03-05)

1. `query-runtime-cache.ts` is now the canonical ownership module for query cache contracts.
2. `eval-context.ts` consumes cache types/factory but should not redefine or re-own query-cache contracts.
3. KERQUERY-010/011/012/013 are archived and do not leave an explicit ownership-boundary test that fails on alias/re-export drift for query cache contracts.
4. Existing canonical-owner policy tests in `packages/engine/test/unit/lint/` (using `analyzeCanonicalSymbolOwnerPolicy`) are the established architecture for this type of boundary enforcement and should be reused here.

## Architecture Check

1. A dedicated canonical-owner lint policy test is cleaner than relying on conventions or broad import-policy tests and better matches existing engine test architecture.
2. This strengthens game-agnostic kernel architecture and does not introduce any game-specific behavior.
3. No backwards-compatibility aliases/shims: boundary tests should fail on reintroduced alias paths or duplicate ownership.

## What to Change

### 1. Add query-runtime-cache canonical-owner policy test

1. Add a lint policy test that asserts query cache contracts live in `query-runtime-cache.ts`.
2. Assert `eval-context.ts` does not re-export alias cache contracts as canonical ownership surfaces.
3. Assert non-canonical kernel modules do not define/export duplicate cache ownership symbols.

### 2. Lock import and re-export policy at kernel surfaces

1. Enforce canonical imports for cache ownership symbols from `./query-runtime-cache.js` without aliasing.
2. Add policy checks that prevent duplicate contract ownership via unrelated kernel modules.

### 3. Add regression signal for future refactors

1. Ensure tests fail clearly when cache ownership drifts.
2. Keep checks narrow to ownership/import policy (not behavior semantics already covered elsewhere).

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (new)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (reuse existing helper, modify only if required)
- `packages/engine/src/kernel/*` (no runtime behavior changes expected; touch only if a policy violation requires normalization)

## Out of Scope

- Runtime behavior changes in query evaluation
- Trigger/lifecycle/discovery resource identity work already tracked in KERQUERY-010/011/012
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Contract/lint suite fails if query runtime cache ownership is reintroduced outside `query-runtime-cache.ts`.
2. Canonical kernel import/re-export paths for cache ownership symbols remain explicit and non-aliased.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache ownership boundary stays explicit, deterministic, and enforceable by tests.
2. GameDef/runtime/simulator remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — enforce single-source query-runtime-cache ownership and no alias/re-export boundaries across kernel modules.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Added `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` to enforce query-runtime-cache single-source ownership in kernel modules.
  - Locked no-alias import policy for query cache ownership symbols to `./query-runtime-cache.js`.
  - Locked no duplicate local definitions and no named re-export policy for ownership symbols outside `query-runtime-cache.ts`.
  - Locked canonical barrel exposure by asserting direct `export * from './query-runtime-cache.js'` in `kernel/index.ts` and `kernel/runtime.ts`.
- **Deviations From Original Plan**:
  - Replaced broad contract-test modifications (`contracts-public-surface-import-policy` / `contracts-kernel-boundary`) with a focused lint-policy test aligned with existing canonical-owner policy architecture in `packages/engine/test/unit/lint/`.
  - No runtime source changes were required; enforcement is test-policy only.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
