# ENGINEARCH-024: Generalize Defer-Taxonomy Parity Tests Across All Mapped Error Codes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit test architecture hardening for classifier/taxonomy parity
**Deps**: None

## Problem

Current defer-class parity coverage is code-specific and anchored to `SELECTOR_CARDINALITY`. If additional eval-error codes are added to `EVAL_ERROR_DEFER_CLASSES_BY_CODE`, classifier/map drift could slip in without a failing test because assertions are not generated map-wide.

## Assumption Reassessment (2026-02-25)

1. `EVAL_ERROR_DEFER_CLASSES_BY_CODE` is currently defined in `packages/engine/src/kernel/eval-error-defer-class.ts` and currently contains only `SELECTOR_CARDINALITY`.
2. `hasEvalErrorDeferClass` now consumes the canonical map in `packages/engine/src/kernel/eval-error-classification.ts`.
3. Existing parity tests in `packages/engine/test/unit/eval-error-classification.test.ts` include positive/negative checks for `SELECTOR_CARDINALITY`, but they still hardcode that code key, so they do not automatically cover future mapped codes.
4. `ENGINEARCH-020` through `ENGINEARCH-023` are archived and do not cover this map-wide defer-taxonomy parity gap.

## Architecture Check

1. Data-driven, map-wide parity tests are cleaner and more extensible than code-specific assertions because they enforce one authoritative taxonomy contract as it evolves.
2. This change remains kernel-generic and does not introduce game-specific behavior into `GameDef`, simulator, or runtime; it validates infrastructure contracts only.
3. No backwards-compatibility aliases/shims are introduced; tests enforce strict current contract behavior.

## What to Change

### 1. Add generic taxonomy-to-classifier parity harness in unit tests

Refactor defer-classification tests so acceptance assertions are derived by iterating all entries in `EVAL_ERROR_DEFER_CLASSES_BY_CODE` rather than hardcoding a single code key.

### 2. Add explicit rejection guardrail per mapped code

For each mapped code under test, assert that an unlisted/forged defer class is rejected even if present in context payload (via deliberate unsafe cast in test-only setup).

### 3. Keep test fixtures maintainable for future map growth

Add a small test fixture/utility pattern in the same test file to construct minimal valid eval errors per mapped code so new taxonomy entries require a clear, localized fixture addition.

## Files to Touch

- `packages/engine/test/unit/eval-error-classification.test.ts` (modify)
- `packages/engine/test/unit/eval-error-defer-class.test.ts` (modify only if map-shape guardrails remain code-specific after refactor)

## Out of Scope

- New defer classes or eval error codes
- Runtime behavior/policy changes in kernel
- GameSpecDoc or visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Parity assertions automatically validate every `(code, deferClass)` pair listed in `EVAL_ERROR_DEFER_CLASSES_BY_CODE`.
2. For each tested code, a forged/unlisted defer class is rejected by `hasEvalErrorDeferClass`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Defer taxonomy map remains the single source of truth for classifier acceptance behavior.
2. `GameDef`/simulation remain game-agnostic, with no game-specific branching introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error-classification.test.ts` — make parity checks map-driven and add per-code negative forged-class rejection.
2. `packages/engine/test/unit/eval-error-defer-class.test.ts` — keep/strengthen taxonomy map shape guardrails if needed.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error-classification.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- **Completion date**: 2026-02-25
- **What actually changed**:
  - Refactored `packages/engine/test/unit/eval-error-classification.test.ts` to validate defer-class parity by iterating all entries in `EVAL_ERROR_DEFER_CLASSES_BY_CODE` rather than hardcoding `SELECTOR_CARDINALITY`.
  - Added exhaustive, localized per-code fixtures in that test file so taxonomy map growth forces fixture updates at compile-time/test-time.
  - Added per-code forged/unlisted defer-class rejection coverage driven by map keys.
  - Strengthened `packages/engine/test/unit/eval-error-defer-class.test.ts` to validate mapping shape and ensure mapped defer classes come from canonical literals.
- **Deviations from original plan**:
  - None in scope; additionally corrected assumption language to reflect that `ENGINEARCH-020` through `ENGINEARCH-023` are archived (not active).
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/eval-error-classification.test.js` ✅
  - `pnpm -F @ludoforge/engine test:unit` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
