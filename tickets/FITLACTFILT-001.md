# FITLACTFILT-001: Fix resolveCommitment tautological executor/pre pattern

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — game spec data only
**Deps**: None

## Problem

The `resolveCommitment` action in the FITL game spec uses `executor: '0'` with `pre: { op: '==', left: { ref: activePlayer }, right: 0 }`. Because `executor: '0'` forces `ctx.activePlayer = 0` (US) in the eval context, the `pre` condition is tautological — it always evaluates to true regardless of `state.activePlayer`.

During the commitment phase, this means any faction's active player could theoretically submit `resolveCommitment` and the `pre` check would pass. The action is gated to `phase: [commitment]` which limits exposure, but the `pre` condition provides no actual faction filtering.

This is the same pattern that was fixed for `nvaTransferResources` and `vcTransferResources` where `executor: '2'`/`'3'` made their `pre` checks tautological.

## Assumption Reassessment (2026-02-27)

1. `resolveCommitment` at line ~1098 of `data/games/fire-in-the-lake/30-rules-actions.md` uses `executor: '0'` with `pre: { activePlayer == 0 }`. Confirmed tautological.
2. The action is `phase: [commitment]` — only visible during coup round commitment phase, not during normal `main` phase gameplay.
3. Effects call `macro: coup-process-commitment` and `popInterruptPhase` — these are US-specific commitment resolution effects that should only execute when the US player is active.
4. No pipeline profile exists for `resolveCommitment` — filtering relies entirely on the base action `pre` condition.

## Architecture Check

1. Changing `executor: '0'` to `executor: 'actor'` makes the `pre` condition functional — it will correctly reject `resolveCommitment` when `state.activePlayer` is not the US player (seat 0). This matches the pattern already established by `pivotalEvent` (which correctly uses `executor: 'actor'` with `pre: { activePlayer == 0 }`).
2. Change is entirely in the GameSpecDoc data file — no engine/kernel code modifications. Preserves agnostic boundary.
3. No backwards-compatibility concerns.

## What to Change

### 1. Fix executor for resolveCommitment

In `data/games/fire-in-the-lake/30-rules-actions.md`, change `resolveCommitment`'s `executor: '0'` to `executor: 'actor'`.

Before:
```yaml
- id: resolveCommitment
  actor: active
  executor: '0'
  phase: [commitment]
  pre: { op: '==', left: { ref: activePlayer }, right: 0 }
```

After:
```yaml
- id: resolveCommitment
  actor: active
  executor: 'actor'
  phase: [commitment]
  pre: { op: '==', left: { ref: activePlayer }, right: 0 }
```

### 2. Recompile bootstrap JSON

Regenerate `packages/runner/src/bootstrap/fitl-game-def.json` after the spec change.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — executor value)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — recompile output)

## Out of Scope

- Adding pipeline profiles for commitment-phase actions (unnecessary — phase gating is sufficient)
- Auditing all other `executor: '<literal>'` usages (this is the only remaining tautological instance in main/commitment phases)
- Changing commitment-phase game flow logic

## Acceptance Criteria

### Tests That Must Pass

1. FITL E2E golden suite: `pnpm -F @ludoforge/engine test:e2e`
2. FITL integration tests: `pnpm -F @ludoforge/engine test`
3. Full suite: `pnpm turbo test`

### Invariants

1. `resolveCommitment` is only legal when `state.activePlayer` is the US player (seat 0).
2. Commitment-phase effects execute with the correct player context.
3. No engine/kernel code changes — fix is data-only.

## Test Plan

### New/Modified Tests

1. No new tests required — existing coup/commitment E2E tests already exercise `resolveCommitment` with the US player active. The fix makes the `pre` condition functional but doesn't change behavior in the normal case (US player active during commitment).

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm -F @ludoforge/engine test:e2e`
