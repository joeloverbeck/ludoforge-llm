# 93COMMOVPOLEVA-003: Build trustedMoveIndex in PolicyAgent.chooseMove

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent.ts`
**Deps**: `archive/tickets/93COMMOVPOLEVA-002.md`

## Problem

After 93COMMOVPOLEVA-002, the preview runtime accepts a `trustedMoveIndex` and uses it to bypass re-probing for pre-completed moves. However, `PolicyAgent.chooseMove` still passes nothing (the plumbing exists but the production caller doesn't build the map). This ticket wires the production code path: build the `ReadonlyMap<string, TrustedExecutableMove>` from the selected playable moves and pass it to `evaluatePolicyMove`.

## Assumption Reassessment (2026-03-29)

1. `PolicyAgent.chooseMove` calls `preparePlayableMoves()` which returns `{ completedMoves: TrustedExecutableMove[], stochasticMoves: TrustedExecutableMove[], rng: Rng }`. Confirmed.
2. The agent selects `playableMoves = completedMoves.length > 0 ? completedMoves : stochasticMoves`. Confirmed.
3. `toMoveIdentityKey(def, move)` is exported from `packages/engine/src/kernel/move-identity.ts` and is already imported in `policy-agent.ts` (used for the post-evaluation trusted-move lookup). Confirmed.
4. After 93COMMOVPOLEVA-002, `EvaluatePolicyMoveInput` has a required `trustedMoveIndex` field.

## Architecture Check

1. **Why here**: `PolicyAgent.chooseMove` is the only production caller of `evaluatePolicyMove`. It already holds the `TrustedExecutableMove[]` array — the map construction is a simple one-liner.
2. **Agnosticism (F1)**: `PolicyAgent` is in `packages/engine/src/agents/` — no kernel changes. The map is built from generic `TrustedExecutableMove` wrappers using `toMoveIdentityKey`.
3. **Immutability (F7)**: The map is constructed once and passed as `ReadonlyMap`. Not mutated after construction.
4. **No shims (F9)**: Direct integration — no optional fallback or legacy path.

## What to Change

### 1. Build `trustedMoveIndex` from playable moves

In `PolicyAgent.chooseMove`, after selecting `playableMoves`:

```typescript
const playableMoves = prepared.completedMoves.length > 0
  ? prepared.completedMoves
  : prepared.stochasticMoves;

const trustedMoveIndex = new Map(
  playableMoves.map(tm => [toMoveIdentityKey(input.def, tm.move), tm] as const),
);
```

### 2. Pass to `evaluatePolicyMove`

```typescript
const result = evaluatePolicyMove({
  ...existingFields,
  trustedMoveIndex,
});
```

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify — build map, pass to evaluatePolicyMove)

## Out of Scope

- Any changes to `policy-preview.ts`, `policy-eval.ts`, or `policy-runtime.ts` (done in 001/002)
- Kernel code changes
- New tests for the fast-path (that's 93COMMOVPOLEVA-004)
- Golden fixture updates (that's 93COMMOVPOLEVA-005)
- Performance optimization of the map construction
- Changes to `preparePlayableMoves` or move completion logic

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests in `test/unit/agents/policy-eval.test.ts` pass
2. All existing property tests pass (determinism, visibility)
3. Full suite: `pnpm turbo test`
4. TypeScript compiles: `pnpm turbo typecheck`

### Invariants

1. `PolicyAgent.chooseMove` contract unchanged — same `Agent` interface, same return type
2. No kernel source files modified
3. Determinism (F5): the map is deterministic — same playable moves produce the same map. `toMoveIdentityKey` is deterministic.
4. Bounded computation (F6): map construction is `O(playableMoves.length)` — bounded by `completionsPerTemplate` (already bounded by Spec 15).
5. For games where moves are already `playableComplete` (Texas Hold'em), the fast-path in `getPreviewOutcome` produces the same result as the classification path — both call `tryApplyPreview` with the same trusted move.

## Test Plan

### New/Modified Tests

None directly in this ticket — the behavioral impact is verified by 93COMMOVPOLEVA-004 and 93COMMOVPOLEVA-005.

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (style)
