# AIORCH-002: Add atomic template-move execution API in worker/store boundary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: AIORCH-001

## Problem

Current AI orchestration performs completion and application as separate calls (`completeMove` then `applyMove`). This split creates an avoidable boundary seam and duplicates orchestration logic that can be made more robust by a single atomic operation.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/src/store/game-store.ts` currently does two-step orchestration for AI template execution.
2. `packages/runner/src/worker/game-worker-api.ts` already has the primitives needed to unify these steps under stamp validation.
3. Mismatch: previous assumption that this must be engine-level is incorrect; boundary hardening can be achieved runner-side without changing game rules.

## Architecture Check

1. A single worker method that completes and applies within one operation reduces race surface and centralizes invariants.
2. This is game-agnostic API design: no game-specific action branching, only generic move lifecycle handling.
3. No backwards-compatibility aliases/shims: callers migrate to new method; old split methods can be removed once internal callers are updated.

## What to Change

### 1. Add atomic worker API for template execution

Introduce a method (for example `applyTemplateMove`) that completes a template move and applies it in one validated operation, returning structured outcome (`applied`, `uncompletable`, `illegal`).

### 2. Update store AI flow to use atomic API

Replace two-step calls with atomic call; simplify `resolveSingleAiStep` control flow and outcomes.

### 3. Align tests and contract docs

Update worker/store tests to validate all outcomes and stamp/error semantics.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/test/worker/game-worker.test.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)

## Out of Scope

- Introducing game-specific AI heuristics.
- Changing GameSpecDoc/visual-config responsibilities.

## Acceptance Criteria

### Tests That Must Pass

1. Atomic API applies completed move when completion succeeds.
2. Atomic API returns explicit non-applied outcome when completion fails; store handles outcome without misleading no-legal-moves state.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. GameDef/simulation runtime remain game-agnostic and unchanged in behavior.
2. Worker/store API expresses move lifecycle outcomes explicitly and deterministically.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker.test.ts` — add atomic API outcome matrix tests.
2. `packages/runner/test/store/game-store.test.ts` — migrate AI resolution tests to atomic path.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/store/game-store.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
