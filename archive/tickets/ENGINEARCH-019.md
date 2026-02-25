# ENGINEARCH-019: Make Defer Classification Consume Canonical Taxonomy Map

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — classifier implementation/data-source consolidation + tests
**Deps**: ENGINEARCH-018 (✅ completed; dependency already satisfied)

## Problem

`EVAL_ERROR_DEFER_CLASSES_BY_CODE` defines defer taxonomy, but `hasEvalErrorDeferClass` still classifies via a direct context equality check that does not consume the taxonomy map. This leaves runtime source-of-truth duplicated and vulnerable to drift.

## Assumption Reassessment (2026-02-25)

1. `EVAL_ERROR_DEFER_CLASSES_BY_CODE` exists in `eval-error-defer-class.ts` and currently maps only `SELECTOR_CARDINALITY`.
2. `hasEvalErrorDeferClass` compares `error.context?.deferClass` directly and does not read `EVAL_ERROR_DEFER_CLASSES_BY_CODE`.
3. Compile-time code/defer-class narrowing was already completed in `ENGINEARCH-018` (`EvalErrorCodeWithDeferClass`, `EvalErrorDeferClassForCode<C>`, and type tests in `types-foundation.test.ts`).
4. No current runtime test guarantees classifier behavior stays map-derived if taxonomy and implementation diverge.

## Architecture Check

1. Classifier behavior should be derived from one canonical taxonomy map to eliminate drift and reduce maintenance cost.
2. This is game-agnostic kernel infrastructure hardening and does not move game-specific behavior into runtime.
3. No backwards-compatibility aliases/shims are introduced; classifier internals become stricter and centralized.
4. This is more beneficial than current architecture because runtime defer acceptance becomes declarative (map-driven) rather than imperative (ad hoc equality checks), so future taxonomy expansion requires fewer error-prone call-site updates.

## What to Change

### 1. Derive defer-class checks from `EVAL_ERROR_DEFER_CLASSES_BY_CODE`

Refactor classifier helper implementation so accepted defer classes are sourced from the map for the relevant eval-error code.

### 2. Add runtime parity guardrails between taxonomy map and classifier behavior

Add targeted tests proving every defer class listed for a code is accepted, and that values not listed in the map are rejected even if present in error context.

### 3. Keep policy callers stable while reducing internal duplication

Preserve existing policy semantics in `missing-binding-policy` and selector flows while removing hardcoded duplicate taxonomy assumptions from classification internals.

## Files to Touch

- `packages/engine/src/kernel/eval-error-classification.ts` (modify)
- `packages/engine/test/unit/eval-error-classification.test.ts` (modify)
- `packages/engine/test/unit/eval-error-defer-class.test.ts` (modify, if needed for stronger taxonomy guardrails)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify only if parity regression is discovered)

## Out of Scope

- New defer-class values or new eval error codes
- Runtime policy behavior changes beyond taxonomy sourcing
- GameSpecDoc / visual-config model changes

## Acceptance Criteria

### Tests That Must Pass

1. Classifier acceptance/rejection behavior is derived from the taxonomy map.
2. Existing policy semantics remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Defer taxonomy has a single authoritative representation.
2. GameDef and simulator remain game-agnostic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error-classification.test.ts` — assert classifier behavior for all mapped defer classes and rejection for unmapped/no-context cases.
2. `packages/engine/test/unit/eval-error-defer-class.test.ts` — assert taxonomy map shape and literals remain canonical.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — keep policy behavior parity under map-driven classification (modify only if needed).

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error-classification.test.js`
4. `node --test packages/engine/dist/test/unit/eval-error-defer-class.test.js`
5. `pnpm -F @ludoforge/engine test:unit`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - `hasEvalErrorDeferClass` now reads `EVAL_ERROR_DEFER_CLASSES_BY_CODE` and only accepts defer classes present in the canonical map for the provided code.
  - Added runtime parity tests in `eval-error-classification.test.ts` to assert:
    - all mapped defer classes are accepted;
    - unlisted/forged defer classes are rejected, even when present in error context.
- Deviations from original plan:
  - `eval-error-defer-class.test.ts` and `missing-binding-policy.test.ts` were left unchanged after reassessment because existing coverage already validated taxonomy literals/map shape and policy parity; no regression surfaced.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error-classification.test.js` passed.
  - `node --test packages/engine/dist/test/unit/eval-error-defer-class.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (159/159).
  - `pnpm -F @ludoforge/engine lint` passed.
