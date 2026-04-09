# 121TWOPHAPOL-003: Restructure chooseMove into two-phase pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/policy-agent, agents/policy-eval
**Deps**: `archive/tickets/121TWOPHAPOL-001.md`, `tickets/121TWOPHAPOL-002.md`

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
3. No backwards-compatibility shims — profiles without completion-scope considerations produce identical behavior (Phase 2 uses PRNG for inner decisions, same as current no-callback path).

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

Add fields to carry Phase 1 results:

```typescript
readonly phase1Score?: number | null;
readonly phase1ActionRanking?: readonly string[];
```

These are populated by `evaluatePolicyMoveCore` when evaluating template moves and consumed by the trace builder.

### 3. Verify `evaluatePolicyMoveCore` handles template moves

Template moves have unresolved inner decisions — `candidate.param.*` refs may be undefined. Verify that:
- Move-scope considerations using `coalesce` handle this correctly (expected: yes, no code change needed).
- Pruning rules that check `candidate.actionId` work on templates (expected: yes).
- Pruning rules that check `candidate.param.*` use `coalesce` fallback (verify and fix if not).

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

1. `chooseMove` with a profile containing only move-scope considerations produces the same result as before the restructure.
2. `chooseMove` with a profile containing both move-scope and completion-scope considerations selects the same `actionId` as the move-scope-only variant (the core isolation property).
3. `chooseMove` with no completion-scope considerations produces identical output to pre-restructure behavior (backward compatibility).
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
