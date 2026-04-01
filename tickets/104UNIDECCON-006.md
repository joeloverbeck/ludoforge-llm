# 104UNIDECCON-006: Update runtime — scope filtering, `evaluateConsideration()`, derived completion guidance

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-eval.ts`, `completion-guidance-eval.ts`, `policy-evaluation-core.ts`
**Deps**: `archive/tickets/104UNIDECCON-003.md`, `archive/tickets/104UNIDECCON-002.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

The runtime must filter considerations by scope at evaluation time, rename `evaluateScoreTerm()` to `evaluateConsideration()`, set `context.kind` in the evaluation context, and derive completion guidance enablement from the presence of completion-scoped considerations.

## Assumption Reassessment (2026-04-01)

1. `policy-eval.ts` move-level scoring loop at ~line 341 — confirmed. Iterates `profile.use.scoreTerms`.
2. `completion-guidance-eval.ts` completion-level scoring at ~line 48 — confirmed. Iterates completion score term IDs.
3. `evaluateScoreTerm()` at `policy-evaluation-core.ts:~340` — confirmed. Generic method accepting any score term dict.
4. `this.input.completion` in `policy-evaluation-core.ts` distinguishes context — confirmed.

## Architecture Check

1. Scope filtering is a simple array check: `consideration.scopes.includes('move')` — O(1) for small scope arrays.
2. `evaluateConsideration()` is a rename of `evaluateScoreTerm()` — same logic, new name.
3. Derived completion guidance: profile has completion-scoped considerations → completion is enabled. No separate config needed (Foundation 15).

## What to Change

### 1. Update `policy-eval.ts` (move-level scoring)

- Filter `profile.use.considerations` to those with `'move'` in scopes (looked up from `catalog.library.considerations`)
- Evaluate filtered set using `evaluateConsideration()`
- Context kind is `'move'`

### 2. Update `completion-guidance-eval.ts` (completion-level scoring)

- Filter `profile.use.considerations` to those with `'completion'` in scopes
- Evaluate filtered set using `evaluateConsideration()`
- Context kind is `'completion'`
- Completion guidance is enabled when filtered set is non-empty (replaces `completionGuidance` config check)

### 3. Rename `evaluateScoreTerm()` → `evaluateConsideration()` in `policy-evaluation-core.ts`

Same logic, new name. Update all call sites.

### 4. Add `contextKind` evaluation in `resolveRef`

Already partially done in ticket 002. Ensure the runtime returns `'move'` or `'completion'` correctly.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/completion-guidance-eval.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

## Out of Scope

- Compilation changes — ticket 005
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. Move-scoped consideration evaluated in move context, not in completion context
2. Completion-scoped consideration evaluated in completion context, not in move context
3. Dual-scoped consideration evaluated in both contexts
4. `context.kind` returns `'move'` in move context, `'completion'` in completion context
5. Profile with completion-scoped considerations enables completion guidance
6. Profile without completion-scoped considerations does not enable completion guidance
7. Existing scoring behavior preserved (behavioral equivalence)

### Invariants

1. Scope filtering is deterministic
2. `evaluateConsideration()` produces identical results to `evaluateScoreTerm()` for equivalent inputs

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval-considerations.test.ts` — scope filtering + context kind tests
2. Update existing `policy-eval.test.ts` tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern policy-eval` — targeted
2. `pnpm -F @ludoforge/engine test` — full suite
3. `pnpm turbo typecheck`
