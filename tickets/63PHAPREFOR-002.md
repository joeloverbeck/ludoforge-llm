# 63PHAPREFOR-002: Implement Phase 1 representative completion and conditional preview evaluation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy agent, policy evaluation core
**Deps**: `archive/tickets/63PHAPREFOR-001.md`

## Problem

Phase 1 of PolicyAgent evaluation unconditionally skips `costClass: 'preview'` candidate features, so all template operations receive the same fallback `projectedSelfMargin` value. Phase 1 cannot discriminate between action types based on projected outcomes. This ticket adds the core logic: completing one template per action type before Phase 1 scoring, and conditionally evaluating preview features for candidates with completions.

## Assumption Reassessment (2026-04-10)

1. `policy-agent.ts` Phase 1 call at line 56 passes `trustedMoveIndex: new Map()` (empty) — confirmed. Phase 1 completions must populate this map before scoring.
2. `policy-eval.ts:435` unconditional `costClass === 'preview'` skip — confirmed. Needs conditional gate on trusted move availability.
3. `preparePlayableMoves()` at `prepare-playable-moves.ts:76` accepts `pendingTemplateCompletions` and `actionIdFilter` options — confirmed. Can be called per-action-type with `pendingTemplateCompletions: 1`.
4. `NOT_VIABLE_RETRY_CAP = 7` at `prepare-playable-moves.ts:22` — confirmed. Bounds retry attempts per completion.
5. `DEFAULT_COMPLETIONS_PER_TEMPLATE = 3` at `policy-agent.ts:14` — confirmed. Phase 1 uses a separate budget (`phase1CompletionsPerAction`, default 1).
6. After ticket 001, `profile.preview.phase1` and `profile.preview.phase1CompletionsPerAction` are available on `CompiledAgentPreviewConfig`.

## Architecture Check

1. Phase 1 completions reuse the existing `preparePlayableMoves()` infrastructure — no parallel completion mechanism introduced (Foundation 15).
2. Completion order is deterministic: iterate unique action IDs in `Array.from(new Set(...)).sort()` order. Same seed = same completions (Foundation 8).
3. RNG consumption is bounded: at most `|unique action IDs|` calls to `preparePlayableMoves()`, each bounded by `NOT_VIABLE_RETRY_CAP` (Foundation 10).
4. No game-specific logic — operates on generic `actionId` grouping (Foundation 1).
5. `applyTrustedMove()` returns new state, no mutation (Foundation 11).

## What to Change

### 1. Phase 1 completion loop in policy-agent.ts

After `resolveEffectivePolicyProfile()` and before `evaluatePolicyMove(phase1EvaluationInput)`:

1. Check `resolvedProfile?.profile.preview.phase1 === true`. If false, skip (current behavior).
2. Extract unique action IDs from `input.legalMoves` in sorted order.
3. For each action ID, call `preparePlayableMoves(input, { pendingTemplateCompletions: profile.preview.phase1CompletionsPerAction ?? 1, actionIdFilter: actionId })`.
4. Collect successful completions into a `phase1TrustedMoveIndex: Map<string, TrustedExecutableMove>`.
5. Track the consumed RNG state — pass the updated `rng` to Phase 1 evaluation.
6. Pass `phase1TrustedMoveIndex` as the `trustedMoveIndex` for Phase 1 evaluation input (replacing the empty map).

### 2. Conditional preview skip in policy-eval.ts

In `evaluatePolicyMoveCore()` at line ~435, change the unconditional skip to:

```typescript
if (feature?.costClass === 'preview') {
  const candidateMoveKey = candidate.stableMoveKey;
  if (!input.trustedMoveIndex.has(candidateMoveKey)) {
    continue; // Skip preview for candidates without trusted completion
  }
}
```

This allows preview features to be evaluated for any candidate whose move key is in the `trustedMoveIndex`. In Phase 1, only action types with successful completions have entries. In Phase 2, all prepared moves have entries. The change is functionally equivalent for Phase 2 (all candidates already have trusted moves).

### 3. Phase 1 completion profiling hooks

Add `perfStart`/`perfDynEnd` around the Phase 1 completion loop with label `'agent:phase1Completions'` for performance visibility.

### 4. Unit tests

Add tests in `packages/engine/test/unit/agents/`:

- **Opt-in gate**: With `phase1: false` (or omitted), Phase 1 `trustedMoveIndex` remains empty — no completions attempted.
- **Completion per action type**: With `phase1: true`, one completion per unique action ID is attempted. Verify the trusted move index has entries for each action type.
- **Determinism**: Same seed + same legal moves = same Phase 1 completions. Run twice and assert identical `trustedMoveIndex` keys and move identities.
- **Conditional skip**: With `phase1: true`, candidates with trusted moves get `projectedSelfMargin` contributions that differ from the fallback value. Candidates without trusted moves still get the fallback.
- **Completion failure**: When `preparePlayableMoves()` returns no completions for an action type (unsatisfiable constraints), that action type retains fallback scoring — no error thrown.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — add Phase 1 completion tests)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify — add conditional skip tests)

## Out of Scope

- Schema artifact regeneration (ticket 003)
- Golden fixture migration (ticket 003)
- Determinism canary updates (ticket 003)
- Integration-level FITL ARVN differentiation test (ticket 004)
- Changing the representative selection heuristic (spec Non-Goals)
- Making preview work for stochastic operations (spec Non-Goals)

## Acceptance Criteria

### Tests That Must Pass

1. Phase 1 with `phase1: true` populates `trustedMoveIndex` with one entry per action type
2. Phase 1 with `phase1: false` leaves `trustedMoveIndex` empty (no behavior change)
3. `projectedSelfMargin` contributions vary across action types when Phase 1 preview is enabled
4. Same seed produces identical Phase 1 completions and scores (determinism)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `phase1: false` profiles produce bit-identical evaluation traces to current behavior (no regression)
2. Phase 1 completions consume RNG in deterministic sorted-action-ID order
3. No mutation of input state — `applyTrustedMove()` returns new state
4. Phase 2 behavior is functionally unchanged — all Phase 2 candidates already have trusted moves

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — Phase 1 completion loop: opt-in, determinism, failure handling
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — conditional preview skip: trusted vs untrusted candidates

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "phase1|preview"`
2. `pnpm turbo build && pnpm turbo test`
3. `pnpm turbo typecheck`
