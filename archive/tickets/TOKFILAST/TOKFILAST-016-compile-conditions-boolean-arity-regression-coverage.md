# TOKFILAST-016: Add Compile-Boundary Regression Coverage for Boolean Arity Invariants

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL compile tests coverage hardening
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md

## Problem

Boolean arity hardening is implemented in lowering/runtime paths, but compile-boundary coverage should explicitly lock operator symmetry (`and` and `or`) so regressions cannot reintroduce gaps through one branch only.

## Assumption Reassessment (2026-03-06)

1. `lowerConditionNode` rejects empty boolean args for condition `and/or` payloads at lowering time.
2. Token-filter lowering/normalization enforces non-empty boolean args and canonicalizes nested/single-arg wrappers.
3. Prior draft assumption was stale: `compile-conditions.test.ts` already includes targeted regression coverage for empty `and` args and canonical token-filter normalization behavior.
4. Real remaining gap: compile-boundary tests do not explicitly lock equivalent `or` arity diagnostics/path behavior for both condition and token-filter expressions.

## Architecture Check

1. Compile-boundary contract tests are the right place to lock compiler invariants, instead of relying on downstream runtime tests.
2. Narrow symmetry-focused tests are preferable to broad rewrites: they harden behavior without increasing architecture complexity.
3. This is game-agnostic compiler hardening only; no game-specific logic is introduced.
4. No compatibility aliases/shims are introduced.

## What to Change

### 1. Add explicit `or` arity regression tests at compile boundary

Assert deterministic diagnostics for empty condition `or` and empty token-filter `or` payloads.

### 2. Extend normalization coverage to include `or`

Assert valid non-empty `or` token-filter expressions preserve canonical non-empty contract (single-arg wrapper simplification and nested flattening behavior).

## Files to Touch

- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Runtime evaluator behavior changes.
- Validator surface coverage broadening.
- Refactoring lowering internals.

## Acceptance Criteria

### Tests That Must Pass

1. Compile/lowering tests explicitly fail on empty condition/token-filter `or` args with deterministic diagnostics.
2. Compile/lowering tests explicitly pass on valid non-empty `or` token-filter normalization cases.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Compile-boundary diagnostics for boolean arity are deterministic and operator-symmetric.
2. Compiler behavior remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add dedicated `or` empty-args rejection + `or` normalization regression cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-06
- Completion date: 2026-03-06
- What changed:
  - Corrected stale assumptions in this ticket before implementation: compile-boundary `and` arity and token-filter normalization coverage already existed.
  - Narrowed scope to real coverage gaps and added operator-symmetry regression tests for `or` in `packages/engine/test/unit/compile-conditions.test.ts`.
  - Added `or` empty-args deterministic diagnostic tests for both condition and token-filter lowering.
  - Added `or` token-filter normalization tests for single-arg wrapper canonicalization and nested same-op flattening with preserved `not` semantics.
  - Refined lowering architecture after completion by introducing a shared boolean-arity tuple helper used by both condition and token-filter lowering paths, plus a token-filter array lowering helper to reduce policy drift risk while preserving behavior.
- Deviations from original plan:
  - Original draft assumed broad missing coverage in `compile-conditions.test.ts`; implementation instead performed targeted symmetry hardening only.
  - Initial delivery was test-only; post-completion refinement introduced a small compiler-internal refactor to centralize boolean arity handling.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (267/267).
  - `pnpm -F @ludoforge/engine lint` passed.
