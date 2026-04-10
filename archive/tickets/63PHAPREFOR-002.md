# 63PHAPREFOR-002: Implement explicit Phase 1 representative preview by action ID

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy agent, policy evaluation core
**Deps**: `archive/tickets/63PHAPREFOR-001.md`

## Problem

Phase 1 of `PolicyAgent` evaluation cannot discriminate between template-operation action types based on projected outcomes. The original draft assumed Phase 1 could reuse the existing `trustedMoveIndex` keyed by `stableMoveKey`, but the current architecture applies `selectionGrouping: 'actionId'` only after candidate scoring. A `stableMoveKey -> TrustedExecutableMove` map therefore cannot express the spec's intended semantics of "one representative preview per action type, reused across all Phase 1 candidates of that action type".

This ticket implements the explicit missing contract: Phase 1 computes representative previews keyed by `actionId`, and `evaluatePolicyMoveCore()` consumes those action-level preview outcomes when scoring Phase 1 candidates. Phase 2 continues to use exact per-candidate trusted moves keyed by `stableMoveKey`.

## Assumption Reassessment (2026-04-10)

1. `policy-agent.ts` Phase 1 still evaluates all legal moves first, then groups selected representatives by `actionId`. This means Phase 1 preview data must be available during candidate scoring, not introduced after the fact.
2. `policy-eval.ts` currently skips `costClass: 'preview'` features during candidate scoring and only resolves preview state through the per-move `trustedMoveIndex` path in `policy-preview.ts`.
3. `policy-preview.ts` resolves preview state through `trustedMoveIndex.get(candidate.stableMoveKey)`, which is correct for exact candidate evaluation but cannot represent action-level Phase 1 semantics.
4. `preparePlayableMoves()` already provides the bounded completion mechanism needed to synthesize one representative move per `actionId`.
5. `NOT_VIABLE_RETRY_CAP = 7` bounds completion retries, and `DEFAULT_COMPLETIONS_PER_TEMPLATE = 3` remains the Phase 2 budget.
6. Ticket 001 already introduced `profile.preview.phase1` and `profile.preview.phase1CompletionsPerAction` on compiled preview config, so no new schema/compiler work belongs here.

## Architecture Check

1. Phase 1 representative previews reuse `preparePlayableMoves()` for bounded completion, but they are exposed through a dedicated action-level preview contract rather than overloading the Phase 2 trusted-move contract (Foundations 12 and 15).
2. Completion order is deterministic: iterate unique `actionId`s in stable sorted order before Phase 1 scoring (Foundation 8).
3. RNG consumption is bounded: at most `|unique action IDs|` calls to `preparePlayableMoves()`, each bounded by `NOT_VIABLE_RETRY_CAP` (Foundation 10).
4. No game-specific logic is introduced; the grouping key is the generic candidate `actionId` already present in policy evaluation traces (Foundation 1).
5. Preview evaluation still consumes immutable projected states produced by applying trusted moves; no input state mutation is allowed (Foundation 11).

## What to Change

### 1. Add explicit Phase 1 action-level preview preparation in `policy-agent.ts`

After `resolveEffectivePolicyProfile()` and before `evaluatePolicyMove(phase1EvaluationInput)`:

1. Check `resolvedProfile?.profile.preview.phase1 === true`. If false, skip (current behavior).
2. Extract unique action IDs from `input.legalMoves` in sorted order.
3. For each action ID, call `preparePlayableMoves(input, { pendingTemplateCompletions: profile.preview.phase1CompletionsPerAction ?? 1, actionIdFilter: actionId })`.
4. If a representative completion succeeds, retain the chosen trusted move and any projected preview state needed by the shared preview evaluator in a dedicated Phase 1 structure keyed by `actionId`.
5. Track consumed RNG state and feed the updated RNG into Phase 1 candidate scoring.
6. Pass the new Phase 1 action-level preview structure into Phase 1 evaluation input while keeping `trustedMoveIndex` empty for Phase 1 exact-candidate lookups.

### 2. Extend the policy preview contract to support action-level representative previews

Introduce an explicit Phase 1 preview dependency/input path that is separate from `trustedMoveIndex`:

```typescript
readonly phase1ActionPreviewIndex?: ReadonlyMap<string, Phase1ActionPreviewEntry>;
```

`Phase1ActionPreviewEntry` must be generic engine data that captures the representative trusted move plus the preview-ready projected outcome needed by `policy-preview.ts` to resolve preview references for any Phase 1 candidate with the same `actionId`.

Update `policy-preview.ts` so preview lookup follows this precedence:

1. Exact candidate preview via `trustedMoveIndex.get(candidate.stableMoveKey)` for Phase 2 and any other exact evaluation path.
2. Representative Phase 1 preview via `phase1ActionPreviewIndex.get(candidate.actionId)` when Phase 1 preview is enabled.
3. Existing fallback/rejection behavior when no preview data exists.

This keeps the exact-candidate contract explicit while adding the missing action-level contract the spec actually needs.

### 3. Evaluate preview features based on explicit preview-data availability in `policy-eval.ts`

Replace the unconditional `costClass === 'preview'` skip with a gate that asks whether preview data is available for the current candidate through either:

1. Exact trusted-move preview data, or
2. Phase 1 representative action preview data.

Candidates without available preview data still skip preview-cost features and continue to rely on fallback expressions such as `coalesce(...)`.

### 4. Phase 1 completion profiling hooks

Add `perfStart`/`perfDynEnd` around the Phase 1 completion loop with label `'agent:phase1Completions'` for performance visibility.

### 5. Unit tests

Add tests in `packages/engine/test/unit/agents/`:

- **Opt-in gate**: With `phase1: false` (or omitted), Phase 1 `trustedMoveIndex` remains empty — no completions attempted.
- **Representative preview per action type**: With `phase1: true`, one representative completion per unique action ID is attempted. Verify the Phase 1 action preview index has entries keyed by `actionId`, not `stableMoveKey`.
- **Determinism**: Same seed + same legal moves = same Phase 1 action preview entries and identical scores.
- **Shared preview resolution**: A Phase 1 candidate without an exact trusted move still resolves preview references through its action-level representative entry.
- **Conditional skip**: Candidates without exact or representative preview data still skip preview-cost features and retain fallback scoring.
- **Completion failure**: When `preparePlayableMoves()` returns no completions for an action type (unsatisfiable constraints), that action type retains fallback scoring — no error thrown.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — add Phase 1 completion tests)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify — add conditional skip tests)

## Out of Scope

- Schema artifact regeneration (ticket 003)
- Golden fixture migration (ticket 003)
- Determinism canary updates (ticket 003)
- Integration-level FITL ARVN differentiation test (ticket 004)
- Changing the representative selection heuristic beyond the explicit per-`actionId` contract
- Making preview work for stochastic operations (spec Non-Goals)

## Acceptance Criteria

### Tests That Must Pass

1. Phase 1 with `phase1: true` builds a representative preview index with one entry per action type that successfully completes
2. Phase 1 with `phase1: false` leaves representative preview data absent and preserves current behavior
3. `projectedSelfMargin` contributions can vary across action types when representative Phase 1 preview data exists
4. Same seed produces identical Phase 1 representative previews and scores (determinism)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `phase1: false` profiles produce bit-identical evaluation traces to current behavior (no regression)
2. Phase 1 completions consume RNG in deterministic sorted-action-ID order
3. No mutation of input state — `applyTrustedMove()` returns new state
4. Phase 2 behavior remains on the exact trusted-move path keyed by `stableMoveKey`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — Phase 1 representative preview preparation: opt-in, determinism, failure handling
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — preview evaluation gates and representative action-level preview resolution

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "phase1|preview"`
2. `pnpm turbo build && pnpm turbo test`
3. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-10
- What changed:
  - Added an explicit Phase 1 representative preview path keyed by `actionId` in policy evaluation.
  - Updated `PolicyAgent` to prepare one bounded representative completion per action type before Phase 1 scoring and to feed the consumed RNG forward into Phase 1 evaluation.
  - Extended the shared preview/runtime/evaluation path so preview-cost features are evaluated when exact trusted-move data or representative Phase 1 preview data exists.
  - Added unit coverage for representative Phase 1 preview usage in `policy-agent.test.ts` and `policy-eval.test.ts`.
- Deviations from original plan:
  - The original draft ticket incorrectly proposed overloading `trustedMoveIndex` with Phase 1 semantics. Before implementation, the ticket was rewritten to the authoritative action-level preview contract required by the live architecture.
  - Full engine test failures first observed during implementation were caused by overlapping `build` and `test` commands against the shared `dist` tree, not by the code change. Sequential reruns passed.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test packages/engine/test/unit/agents/policy-agent.test.ts`
  - `pnpm -F @ludoforge/engine test packages/engine/test/unit/agents/policy-eval.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
