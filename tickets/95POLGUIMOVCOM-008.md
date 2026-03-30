# 95POLGUIMOVCOM-008: PolicyAgent builds and threads `choose` callback from profile

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents policy-agent, agents prepare-playable-moves
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-001.md, archive/tickets/95POLGUIMOVCOM-007.md

## Problem

The PolicyAgent does not use its profile's `completionGuidance` config or `completionScoreTerms` when completing template moves. Even with kernel threading (ticket 001) and the evaluator (ticket 007) in place, the PolicyAgent's `chooseMove` method needs to build a `choose` callback from the profile and pass it through `preparePlayableMoves`. This ticket wires the full pipeline together.

## Assumption Reassessment (2026-03-30)

1. `PolicyAgent.chooseMove` calls `preparePlayableMoves(input, { pendingTemplateCompletions: this.completionsPerTemplate })`. After ticket 001, `PreparePlayableMovesOptions` accepts `choose`. Confirmed (pending 001).
2. `PolicyAgent` has access to `AgentPolicyCatalog` and the profile via seat binding. Confirmed — it looks up the profile in `chooseMove`.
3. `input.state` is the immutable pre-move snapshot state. The `choose` callback should close over this. Confirmed.
4. When `completionGuidance.enabled` is false or absent, no callback is built — pure PRNG behavior. Confirmed by spec.
5. When the `choose` callback returns `undefined` (no terms matched or all scored 0), the kernel falls through to PRNG or deterministic first-option based on `fallback` config. Confirmed.

## Architecture Check

1. Cleanest approach: a `buildCompletionChooseCallback` factory function in `policy-agent.ts` (or a small helper module). It takes the state, def, catalog, playerId, and profile, and returns `((ChoicePendingRequest) => MoveParamValue | undefined) | undefined`. When the profile doesn't enable guidance, it returns `undefined` (no callback, PRNG fallback).
2. Engine agnosticism: the callback is built from compiled YAML terms and generic kernel types. No game-specific logic.
3. No backwards-compatibility shims: profiles without `completionGuidance` get `undefined` callback — identical to current behavior.

## What to Change

### 1. `policy-agent.ts` — build `choose` callback in `chooseMove`

Before calling `preparePlayableMoves`, check if the resolved profile has `completionGuidance?.enabled`. If so:

```typescript
const chooseCallback = buildCompletionChooseCallback(
  input.state, input.def, this.catalog, playerId, profile,
);
```

Pass it to `preparePlayableMoves`:
```typescript
preparePlayableMoves(input, {
  pendingTemplateCompletions: this.completionsPerTemplate,
  choose: chooseCallback,
});
```

### 2. `policy-agent.ts` — `buildCompletionChooseCallback` implementation

The callback closure:
1. Checks `profile.completionGuidance?.enabled` — returns `undefined` if not enabled
2. Gets `scoreTermIds` from `profile.use.completionScoreTerms` — returns `undefined` if empty
3. Returns a function that:
   - Filters `request.options` to legal options
   - If ≤1 legal option, returns `undefined` (no meaningful choice)
   - Scores each legal option via `scoreCompletionOption` (from ticket 007)
   - If best score > 0, returns the best option's value
   - If best score ≤ 0 (no terms matched), returns `undefined` for fallback

### 3. `prepare-playable-moves.ts` — handle `fallback` config

When the `choose` callback returns `undefined` and the profile specifies `fallback: 'first'`:
- Select the first legal option deterministically (no PRNG consumption)

This requires `preparePlayableMoves` to know the fallback mode. Options:
- (A) Wrap the `choose` callback to handle fallback internally (simpler — the callback itself handles fallback)
- (B) Pass `fallback` as a separate option

Recommend (A): the `buildCompletionChooseCallback` returns a callback that handles fallback internally. When the scoring returns no winner and `fallback === 'first'`, the callback returns the first legal option's value instead of `undefined`.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — minor, threading only if not done in 001)

## Out of Scope

- Changes to `evaluatePolicyMove` (the post-completion scorer) — it continues to score completed moves as before
- Changes to `RandomAgent` or `GreedyAgent` — they don't use guidance
- `completionsPerTemplate` changes — same number of completions, just smarter
- Multi-ply search or lookahead
- Correlated `chooseN` subset optimization
- Performance profiling of guided vs unguided completion
- Policy contract centralization across validator/compiler/schema ownership (ticket `010`)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: profile with `completionGuidance.enabled: true` and `completionScoreTerms` → `chooseMove` produces a callback that scores options
2. New unit test: profile without `completionGuidance` → `chooseMove` passes `undefined` as `choose` (PRNG behavior)
3. New unit test: callback returns `undefined` when all scores are 0 → PRNG fallback occurs
4. New unit test: callback with `fallback: 'first'` returns first legal option when scores are 0
5. New unit test: callback with `fallback: 'random'` returns `undefined` when scores are 0 (PRNG fallback)
6. New integration test: guided completion selects option that matches scoring criteria (e.g., zone with most tokens) over random
7. New integration test: determinism — same state + same profile + same seed = same guided completion result
8. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. Profiles without `completionGuidance` produce identical behavior to pre-spec implementation (no callback, PRNG-based completion).
2. The `choose` callback closes over `input.state` (immutable snapshot) — never sees mid-execution state changes.
3. The callback never selects options outside the legal set provided by the kernel.
4. Foundation #5 (Determinism): same seed + same policy = same guided completion.
5. Foundation #7 (Immutability): callback works with snapshot state only.
6. Foundation #10 (Architectural Completeness): the full pipeline is wired — no dead code or stub implementations.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent-guidance.test.ts` — callback construction and fallback tests
2. `packages/engine/test/integration/agents/guided-completion.test.ts` — end-to-end guided completion with known scoring

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "guidance|guided"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
