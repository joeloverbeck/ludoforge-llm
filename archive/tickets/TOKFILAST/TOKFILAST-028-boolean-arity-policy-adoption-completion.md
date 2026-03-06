# TOKFILAST-028: Complete Boolean-Arity Policy Adoption Across Remaining Kernel Callsites

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel policy adoption completion + regression coverage
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md, archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md

## Problem

A shared boolean-arity policy module now exists, but adoption is partial. Remaining callsites still use local arity-check patterns/messages, which risks policy drift and weakens single-source invariant ownership.

## Assumption Reassessment (2026-03-06)

1. Shared policy helpers now exist in `packages/engine/src/kernel/boolean-arity-policy.ts`.
2. `eval-condition.ts`, token-filter runtime, and validator diagnostics consume this policy helper.
3. `hidden-info-grants.ts` no longer owns boolean-arity checks directly; it delegates traversal/arity enforcement to `token-filter-expr-utils.ts`.
4. Remaining local non-empty checks for boolean operators still exist in:
   - `packages/engine/src/kernel/token-filter-expr-utils.ts` (`entry.args.length === 0` in fold/walk).
   - `packages/engine/src/kernel/validate-gamedef-behavior.ts` (`condition.args.length === 0` in condition validation).
5. Existing active tickets do not explicitly complete migration of these final callsites to the shared non-empty guard helper.

## Architecture Check

1. Full adoption of one policy source is cleaner and more robust than mixed local checks.
2. Completing policy usage across kernel callsites keeps invariant evolution centralized and game-agnostic.
3. No backwards-compatibility aliasing/shims are introduced; malformed payloads remain fail-closed.

## What to Change

### 1. Complete policy adoption in remaining arity callsites

Route remaining boolean-arity check patterns through shared policy/non-empty guard helpers where applicable:

- Use `isNonEmptyArray` in token-filter traversal (`foldTokenFilterExpr`/`walkTokenFilterExpr`) instead of local `length === 0` checks.
- Use `isNonEmptyArray` in `validateConditionAst` boolean-node handling to keep non-empty guard ownership centralized.

### 2. Add policy-adoption guard coverage

Add/extend tests to catch reintroduction of ad-hoc local arity checks in the targeted modules.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/kernel/boolean-arity-policy.test.ts` (modify)

## Out of Scope

- Token-filter traversal boundary mapper centralization (`archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md`).
- Reveal/conceal effect-surface context contract deepening (`archive/tickets/TOKFILAST/TOKFILAST-021-effects-reveal-token-filter-error-context-contract-coverage.md`).
- Broad validator condition-surface policy work (`tickets/TOKFILAST-022`, `023`, `024`).

## Acceptance Criteria

### Tests That Must Pass

1. Remaining kernel arity callsites no longer rely on ad-hoc local message/check logic.
2. Regression tests fail if policy drift is reintroduced in covered modules.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Boolean-arity contract wording and guard semantics are centrally owned.
2. GameDef/runtime behavior remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — keep boolean-arity diagnostics stable while migrating condition validation to shared non-empty guard usage.
2. `packages/engine/test/unit/kernel/boolean-arity-policy.test.ts` — add regression guard coverage for `isNonEmptyArray` adoption in remaining callsites.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Reassessed assumptions and corrected scope to the actual remaining callsites (`token-filter-expr-utils.ts`, `validate-gamedef-behavior.ts`), not `hidden-info-grants.ts`.
  - Migrated remaining boolean non-empty checks to shared `isNonEmptyArray` guard.
  - Added regression coverage:
    - `validate-gamedef.test.ts` assertion that empty `or` diagnostics keep shared `booleanArityMessage` wording.
    - `kernel/boolean-arity-policy.test.ts` source guard that remaining callsites use `isNonEmptyArray` and do not reintroduce local `length === 0` checks.
- Deviations from original plan:
  - Did not modify `hidden-info-grants.ts` / `hidden-info-grants.test.ts` because assumption was stale; those paths were already centralized through token-filter traversal utilities.
  - Added validator-focused regression coverage because validator condition handling was the actual remaining adoption surface.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
