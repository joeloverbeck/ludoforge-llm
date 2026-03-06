# TOKFILAST-017: Harden Empty-Args ConditionAST Coverage Across Condition-Bearing Surfaces

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validation/runtime test coverage hardening
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md

## Problem

`ConditionAST` empty-args rejection is implemented, but current test coverage primarily targets action preconditions. Other condition-bearing surfaces are not comprehensively asserted, increasing risk of undetected regressions in diagnostics and path fidelity.

## Assumption Reassessment (2026-03-06)

1. Schema/runtime/validator already reject zero-arity `ConditionAST` booleans:
   - Schema: `ConditionASTSchema` enforces `.min(1)` for `and`/`or`.
   - Runtime core: `evalCondition` throws `TYPE_MISMATCH` for empty `and`/`or`.
2. Existing validator coverage has one explicit empty-args `ConditionAST` case on `actions[].pre`.
3. Real gap: validator path+code coverage is not yet table-driven across other condition-bearing surfaces (triggers, terminal, options-query condition slots, `connectedZones.via`, action-pipeline condition slots, `moveAll.filter`, victory checkpoints).
4. Runtime gap is narrower than originally assumed: direct `evalCondition` empty-arity checks already exist, but query condition-bearing runtime entry points do not yet assert empty-args fail-closed behavior consistently.

## Architecture Check

1. Table-driven cross-surface tests provide stronger architecture-contract guarantees than isolated one-surface assertions.
2. This is game-agnostic validation/runtime hardening with no game-specific branching.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add cross-surface validator diagnostics tests for empty `ConditionAST` args

Cover representative condition-bearing surfaces and assert deterministic `code + path` diagnostics (`CONDITION_BOOLEAN_ARITY_INVALID` at `*.args`).

### 2. Add runtime sanity checks for condition-bearing query entry points

Where malformed nodes can be forced through `evalQuery` entry points (`zones.filter.condition`, `mapSpaces.filter.condition`, `tokensInMapSpaces.spaceFilter.condition`, `connectedZones.via`, `nextInOrderByCondition.where`), assert deterministic fail-closed behavior.

### 3. Ensure path fidelity for nested condition booleans

Add nested malformed case(s) to lock `.arg` / `.args[n]` path shaping consistency on condition-bearing paths.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)

## Out of Scope

- Token-filter surface hardening (`TOKFILAST-011`).
- Unsupported token-filter operator validator hardening (`TOKFILAST-012`).
- Changes to production runtime/validator logic (ticket is coverage hardening only unless tests expose a real bug).

## Acceptance Criteria

### Tests That Must Pass

1. Empty-args `ConditionAST` diagnostics are asserted on multiple condition-bearing surfaces.
2. Nested malformed condition path diagnostics are deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.
4. Existing suite: `pnpm -F @ludoforge/engine lint`.

### Invariants

1. Condition boolean arity enforcement is consistently covered across condition-bearing surfaces.
2. Validation/runtime behavior remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add table-driven empty-args condition cases across surfaces.
2. `packages/engine/test/unit/eval-query.test.ts` — add direct condition-bearing query-path malformed assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-06
- Completion date: 2026-03-06
- What changed:
  - Added table-driven validator coverage for empty-args `ConditionAST` booleans across multiple condition-bearing surfaces, including nested-path fidelity checks.
  - Added `evalQuery` runtime fail-closed tests for malformed empty-args conditions across condition-bearing query entry points.
  - Added canonical condition-surface path contract helpers in `src/contracts` and rewired validator/test path construction to that shared contract to reduce drift risk across condition-bearing surfaces.
  - Corrected ticket assumptions/scope to reflect already-existing schema/runtime baseline coverage and focus this ticket on real coverage gaps.
- Deviations from original plan:
  - Did not add `eval-condition.test.ts` changes because direct `evalCondition` empty-arity runtime checks already existed and were sufficient; runtime additions were focused on query entry surfaces.
  - Expanded validator-surface scope beyond the original examples to include action-pipeline and victory-checkpoint condition slots for stronger architectural contract coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
