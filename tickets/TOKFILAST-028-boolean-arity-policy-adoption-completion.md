# TOKFILAST-028: Complete Boolean-Arity Policy Adoption Across Remaining Kernel Callsites

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel policy adoption completion + regression coverage
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md, tickets/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md

## Problem

A shared boolean-arity policy module now exists, but adoption is partial. Remaining callsites still use local arity-check patterns/messages, which risks policy drift and weakens single-source invariant ownership.

## Assumption Reassessment (2026-03-06)

1. Shared policy helpers now exist in `packages/engine/src/kernel/boolean-arity-policy.ts`.
2. `eval-condition.ts`, token-filter runtime, and validator diagnostics consume this policy helper.
3. Mismatch: hidden-info canonicalization still performs local arity checks and does not consistently rely on shared non-empty-array guard/policy ownership (`packages/engine/src/kernel/hidden-info-grants.ts`).
4. Existing active tickets do not explicitly finish adoption for all remaining boolean-arity callsites after recent refactors.

## Architecture Check

1. Full adoption of one policy source is cleaner and more robust than mixed local checks.
2. Completing policy usage across kernel callsites keeps invariant evolution centralized and game-agnostic.
3. No backwards-compatibility aliasing/shims are introduced; malformed payloads remain fail-closed.

## What to Change

### 1. Complete policy adoption in remaining arity callsites

Route remaining boolean-arity check patterns through shared policy/non-empty guard helpers where applicable.

### 2. Add policy-adoption guard coverage

Add/extend tests to catch reintroduction of local boolean-arity message patterns or ad-hoc checks in targeted modules.

## Files to Touch

- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)
- `packages/engine/test/unit/hidden-info-grants.test.ts` (modify)
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

1. `packages/engine/test/unit/hidden-info-grants.test.ts` — assert behavior remains stable after policy adoption completion.
2. `packages/engine/test/unit/kernel/boolean-arity-policy.test.ts` — expand policy regression coverage for remaining callsites.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
