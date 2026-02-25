# AIORCH-002: Replace split AI template completion/apply with atomic execution API

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: AIORCH-001

## Problem

Current AI orchestration in the runner uses two worker calls for template moves (`completeMove` then `applyMove`). This split duplicates lifecycle handling in the store and leaves completion outside mutation stamp validation.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/src/store/game-store.ts` still resolves AI template moves via two-step orchestration (`completeMove` then `applyMove`) inside `resolveSingleAiStep`.
2. `packages/runner/src/worker/game-worker-api.ts` does **not** yet expose an atomic template-execution method; only `applyMove` is mutation-stamped, while `completeMove` is a separate unstamped read.
3. Existing tests in `packages/runner/test/store/game-store.test.ts` and `packages/runner/test/worker/game-worker.test.ts` explicitly encode the split API and call ordering; these assumptions must be migrated.
4. This remains runner-boundary work; no engine kernel/runtime changes are required.

## Scope Correction

1. Introduce a single worker boundary method for template execution (complete + apply) with stamp validation in one operation.
2. Migrate store AI step logic to the atomic method and remove split-call coupling.
3. Remove the old split `completeMove` worker API surface (no alias/shim/backward-compat path).
4. Update worker and store tests to match the new contract and outcome semantics.

## Architecture Check

1. Atomic template execution is cleaner than split orchestration because completion/apply invariants are owned at one boundary.
2. Stamping the atomic operation reduces stale-interleaving surface compared to an unstamped completion pre-step.
3. Explicit atomic outcomes (`applied`, `uncompletable`, `illegal`) are more robust than exception-only control flow for expected non-applied paths.
4. This preserves game-agnostic architecture: generic move lifecycle handling only, with no game-specific branching.

## What to Change

### 1. Add atomic worker API for template execution

Replace split API usage with a method (for example `applyTemplateMove`) that:
- accepts a template move + mutation stamp,
- completes and applies in one worker operation,
- returns structured outcome (`applied`, `uncompletable`, `illegal`) without caller-side completion orchestration.

### 2. Update store AI flow to use atomic API

Refactor `resolveSingleAiStep` to consume atomic outcomes directly and keep orchestration diagnostics deterministic.

### 3. Align tests and contracts

Update worker/store tests to validate:
- successful applied outcome,
- uncompletable outcome (no apply side effects),
- illegal outcome semantics,
- removal of split API expectations.

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/test/worker/game-worker.test.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)

## Out of Scope

- Introducing game-specific AI heuristics.
- Changing GameSpecDoc/visual-config responsibilities.
- Engine runtime legality/completion algorithm changes.

## Acceptance Criteria

### Tests That Must Pass

1. Atomic API applies completed move when completion succeeds.
2. Atomic API returns explicit `uncompletable` and `illegal` outcomes without applying state mutation.
3. Store AI resolution consumes atomic outcomes without split-call assumptions or misleading no-legal-moves behavior.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. GameDef/simulation runtime remain game-agnostic and unchanged in behavior.
2. Worker/store boundary expresses move lifecycle outcomes explicitly and deterministically.
3. No backward-compatibility aliases for removed split API.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/game-worker.test.ts` — add atomic template execution outcome matrix tests and remove split `completeMove` contract assertions.
2. `packages/runner/test/store/game-store.test.ts` — migrate AI resolution tests from split completion/apply sequencing to atomic execution outcomes.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/store/game-store.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-25
- Actually changed:
  - Replaced split worker API surface (`completeMove` + caller-side apply) with atomic `applyTemplateMove`.
  - Added explicit `applyTemplateMove` outcomes (`applied`, `uncompletable`, `illegal`) with stamp-validated execution.
  - Migrated store AI orchestration (`resolveSingleAiStep`) to atomic template execution and preserved deterministic diagnostics.
  - Migrated worker/store tests to atomic contract assertions and added explicit illegal-outcome coverage in both layers.
- Deviations from original plan:
  - No additional files were needed beyond the scoped worker/store + test files.
  - Targeted test command executed the full runner suite in this Vitest setup, which provided broader verification.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- test/worker/game-worker.test.ts test/store/game-store.test.ts` passed (full runner suite executed).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
