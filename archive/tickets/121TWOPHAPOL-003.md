# 121TWOPHAPOL-003: Restructure chooseMove into two-phase pipeline

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/policy-agent, agents/policy-eval
**Deps**: `archive/tickets/121TWOPHAPOL-001.md`, `archive/tickets/121TWOPHAPOL-002.md`

## Problem

The current `PolicyAgent.chooseMove` pipeline completes ALL templates before scoring, entangling completion-scope and move-scope decisions. Adding a completion-scope consideration (e.g., `preferPopulousTargets`) can change which `actionId` is selected — a coupling that caused campaign failures in `fitl-arvn-agent-evolution` (exp-009: ARVN switched from `govern` to `sweep` when a target-selection heuristic was added). This ticket separates the pipeline into Phase 1 (move-scope evaluation on templates) and Phase 2 (completion of winning `actionId` only).

## Assumption Reassessment (2026-04-09)

1. `chooseMove` in `policy-agent.ts` (lines 43-97) currently: builds completion callback → `preparePlayableMoves` (completes all) → `evaluatePolicyMove` (scores completed moves) — confirmed.
2. `evaluatePolicyMoveCore` already filters considerations by `scopes?.includes('move')` at line ~490 of `policy-eval.ts` — confirmed. Phase 1 leverages this existing infrastructure.
3. Move-scope considerations that reference `candidate.param.*` use the `coalesce` operator to handle undefined params — confirmed in `policy-evaluation-core.ts` line 478.
4. `preparePlayableMoves` now accepts `actionIdFilter` (from ticket 002) — prerequisite.
5. `PolicyAgentDecisionTrace` now has optional phase fields (from ticket 001) — prerequisite.

## Architecture Check

1. The two-phase separation is the architecturally complete solution (Foundation 15) — it eliminates the root cause of decision-level entanglement rather than working around it.
2. No game-specific logic — the pipeline restructure is generic. `actionId` grouping, `coalesce` fallback, and scope filtering are all game-agnostic kernel concepts.
3. No backwards-compatibility shims — the migration updates repo-owned authored/test surfaces that relied on completed `candidate.param.*` values during move-scope evaluation. Profiles without completion-scope considerations still preserve the new two-phase semantics without compatibility wrappers.

## What to Change

### 1. Restructure `chooseMove` in `policy-agent.ts`

Replace the current single-pass flow with:

**Phase 1 — Move-scope evaluation (action type selection)**:
1. Call `evaluatePolicyMove` with the raw `input.legalMoves` (template moves, not completed). Move-scope considerations evaluate against pre-completion state. The existing `scopes?.includes('move')` filter ensures only move-scope considerations score.
2. The result selects the winning `actionId` (via pruning, scoring, tie-breaking on `stableMoveKey`).
3. Extract the winning `actionId` from the selected move.

**Phase 2 — Completion-scope evaluation (parameter selection)**:
4. Build the completion choose callback (via `buildCompletionChooseCallback`) — same as today but only used in Phase 2.
5. Call `preparePlayableMoves` with `actionIdFilter` set to the winning `actionId`. Only templates matching that `actionId` are completed.
6. Score completed variants. Among completed moves of the winning `actionId`, select by completion-scope quality + move-scope tie-breakers.
7. Return the final completed move.

Record `phase1Score`, `phase2Score`, and `phase1ActionRanking` in the metadata for trace output (consumed by ticket 004).

### 2. Extend `PolicyEvaluationMetadata` in `policy-eval.ts`

Add fields to carry phase-separated results:

```typescript
readonly phase1Score?: number | null;
readonly phase2Score?: number | null;
readonly phase1ActionRanking?: readonly string[];
```

These are populated by the two-phase pipeline and consumed by the trace builder.

### 3. Verify `evaluatePolicyMoveCore` handles template moves

Template moves have unresolved inner decisions — `candidate.param.*` refs may be undefined. Verify that:
- Move-scope considerations using `coalesce` handle this correctly (expected: yes, no code change needed).
- Pruning rules that check `candidate.actionId` work on templates (expected: yes).
- Pruning rules that check `candidate.param.*` use `coalesce` fallback (verify and fix if not).
- Repo-owned authored fixtures/tests that read move-scope `candidate.param.*` directly are migrated in the same change so Phase 1 semantics are explicit and Foundations-compliant.

### 4. Handle tie-breaking across `actionId`s in Phase 1

If multiple `actionId`s tie on move-scope score, tie-breakers (including `stableMoveKey`) resolve the tie before Phase 2. Only the single winning `actionId` enters Phase 2.

### 5. Handle multiple templates of the same `actionId`

When multiple templates share the winning `actionId` (e.g., `govern` with different valid target sets), all enter Phase 2. The final selection among completed variants uses completion-scope quality.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)

## Out of Scope

- Trace output wiring in `policy-diagnostics.ts` (ticket 004)
- Golden test updates (ticket 004)
- Isolation and regression test suites (ticket 005)
- Changes to `completion-guidance-choice.ts` or `scoreCompletionOption` (unchanged per spec)

## Acceptance Criteria

### Tests That Must Pass

1. `chooseMove` isolates `actionId` selection from completion-scope considerations, even when completion guidance changes how the winning action is parameterized.
2. `chooseMove` with a profile containing both move-scope and completion-scope considerations selects the same `actionId` as the move-scope-only variant (the core isolation property).
3. Repo-owned move-scope `candidate.param.*` authored surfaces used by the tests are explicit about template-phase behavior via `coalesce` or equivalent fallback.
4. Template completion count is reduced compared to pre-restructure (only winning `actionId` templates are completed).
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Phase 1 scoring uses only move-scope considerations — completion-scope considerations MUST NOT influence `actionId` selection.
2. Determinism is preserved: same input → same output (Foundation 8).
3. `PolicyAgent.chooseMove` return type is unchanged.
4. Immutability: no state mutation (Foundation 11).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — update existing tests if the pipeline call order changes; add a smoke test for the two-phase flow.

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-09
- Changed:
  - Restructured `PolicyAgent.chooseMove` in `packages/engine/src/agents/policy-agent.ts` into a two-phase pipeline that evaluates raw templates first, ranks `actionId`s from Phase 1 candidate scores, then completes and re-scores only the winning `actionId`.
  - Extended `PolicyEvaluationMetadata` in `packages/engine/src/agents/policy-eval.ts` with optional `phase1Score`, `phase2Score`, and `phase1ActionRanking` fields and propagated the new metadata through the policy evaluation flow.
  - Updated repo-owned policy proofs in `packages/engine/test/unit/agents/policy-agent.test.ts`, `packages/engine/test/integration/event-preview-differentiation.test.ts`, `packages/engine/test/integration/considerations-e2e.test.ts`, and `packages/engine/test/unit/trace/policy-trace-events.test.ts` to make template-phase behavior explicit and verify the two-phase selection path.
  - Refreshed the owned trace goldens in `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` and `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` so deterministic proofs stayed aligned with the migrated pipeline behavior.
- Deviations from original plan:
  - The original ticket boundary was too narrow. Foundations-complete implementation required migrating repo-owned move-scope `candidate.param.*` authored/test surfaces in the same change rather than only changing `policy-agent.ts` and `policy-eval.ts`.
  - The ticket originally treated golden updates as out of scope for ticket 004, but the broader migration changed owned deterministic proofs immediately, so the goldens were updated here as part of the same implementation.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm turbo typecheck`
  - `node packages/engine/dist/test/unit/agents/policy-agent.test.js`
  - `node packages/engine/dist/test/integration/event-preview-differentiation.test.js`
  - `node packages/engine/dist/test/integration/considerations-e2e.test.js`
  - `node packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
  - `pnpm -F @ludoforge/engine test`
