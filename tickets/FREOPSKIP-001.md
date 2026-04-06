# FREOPSKIP-001: Add skipIfNoLegalCompletion policy for free operation grants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel turn-flow-eligibility, contracts, compiler validation, game spec encoding
**Deps**: None

## Problem

A game deadlock occurs when a free operation grant has `completionPolicy: required` but no legal completion exists. The simulator catches `NoPlayableMovesAfterPreparationError` from the agent and reports `noLegalMoves`, ending the game prematurely.

**Reproduction**: FITL seed 1009. Card 75 (Sihanoukville, shaded) grants VC a 2-step free operation:
1. Step 0: Free Rally in Cambodia → captures rally zones as `sihanouk-rally-spaces`
2. Step 1: Free March FROM `sihanouk-rally-spaces` with `outcomePolicy: mustChangeGameplayState`

On seed 1009, after VC rallies in northeast-cambodia, the March from that zone has 3 destination options (pleiku-darlac, southern-laos, the-fishhook) but all fail template completion — no combination produces a state-changing legal march. The game deadlocks after 3 total moves.

In the physical FITL board game, free operations that cannot be executed are simply skipped. The engine has no mechanism to express this — `completionPolicy` only supports `required`.

## Assumption Reassessment (2026-04-06)

1. `TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES` at `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts:21` contains only `['required']` — confirmed, no optional policy exists.
2. `isRequiredPendingFreeOperationGrant` at `packages/engine/src/kernel/turn-flow-eligibility.ts:132-134` hardcodes the `required` check — confirmed.
3. The simulator at `packages/engine/src/sim/simulator.ts:151-154` catches `NoPlayableMovesAfterPreparationError` and maps it to `noLegalMoves` — confirmed. This conflates "no legal moves in the game" with "this specific free operation template can't be completed."
4. Card 75 shaded step 1 (march grant) at `data/games/fire-in-the-lake/41-events/065-096.md:2214` uses `completionPolicy: required` — confirmed.
5. No other completion policy values exist in the codebase — confirmed via grep.

## Architecture Check

1. **Game-agnostic**: The new policy is a generic engine feature, not FITL-specific. Any game with conditional free operations benefits. Aligns with FOUNDATIONS.md §1 (Engine Agnosticism).
2. **Bounded computation**: Skipping a free operation is a bounded operation (remove from pending queue, advance turn flow). No new iteration or recursion. Aligns with FOUNDATIONS.md §10.
3. **Deterministic**: The skip decision is deterministic — if no legal completion exists, the grant is skipped. Same inputs always produce the same skip. Aligns with FOUNDATIONS.md §8.
4. **No backwards compatibility shims**: The new policy value is additive. Existing `required` behavior is unchanged. Game specs opt into the new behavior by using the new policy value. Aligns with FOUNDATIONS.md §14.

## What to Change

### 1. Add `skipIfNoLegalCompletion` completion policy value

**File**: `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`

Add `'skipIfNoLegalCompletion'` to `TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES`. This value means: "attempt the free operation; if template completion produces no playable moves, skip the grant and advance turn flow as if the operation was not issued."

### 2. Handle the new policy in turn flow eligibility

**File**: `packages/engine/src/kernel/turn-flow-eligibility.ts`

When resolving pending free operation grants:
- `required`: current behavior — the grant blocks until completed (and deadlocks if no completion exists)
- `skipIfNoLegalCompletion`: the grant is offered to the agent. If `NoPlayableMovesAfterPreparationError` is thrown, remove the grant from the pending queue and continue turn flow. The simulator must NOT treat this as `noLegalMoves`.

### 3. Handle the skip in the simulator

**File**: `packages/engine/src/sim/simulator.ts`

When `NoPlayableMovesAfterPreparationError` is caught:
- Check if the current legal move is a free operation with `skipIfNoLegalCompletion` policy
- If yes: remove the grant from pending, re-enumerate legal moves, continue the game loop
- If no (or if the grant has `required` policy): current behavior (stop with `noLegalMoves`)

This requires passing the grant's completion policy through the legal move or making it available to the simulator. The cleanest approach: the `NoPlayableMovesAfterPreparationError` could carry metadata about the grant, or the simulator checks the turn order state directly.

### 4. Update FITL Card 75 encoding

**File**: `data/games/fire-in-the-lake/41-events/065-096.md`

Change the step-1 march grants (both VC and NVA) from `completionPolicy: required` to `completionPolicy: skipIfNoLegalCompletion`. The step-0 rally grants can remain `required` since Rally in Cambodia always has at least one valid completion (place guerrilla).

Lines to change:
- ~2214: VC march grant `completionPolicy: required` → `skipIfNoLegalCompletion`
- ~2258: NVA march grant `completionPolicy: required` → `skipIfNoLegalCompletion`

### 5. Audit all other `completionPolicy: required` grants

Grep all `completionPolicy: required` in FITL game data. For each, assess whether the free operation could produce no legal completions in edge cases. Change to `skipIfNoLegalCompletion` where the board game rules allow skipping.

Common patterns that need `skipIfNoLegalCompletion`:
- March grants restricted to specific origin zones (pieces may not be there)
- Operation grants with `outcomePolicy: mustChangeGameplayState` (state may already be at maximum)
- Grants restricted by zone filters when no matching zones have pieces

### 6. Compiler validation

**File**: `packages/engine/src/cnl/validate-agents.ts` (or applicable compiler validation)

Ensure the new policy value is accepted during compilation. If there's a validation step that checks completion policy values, add `skipIfNoLegalCompletion` to the allowed set.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify — add policy value)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify — handle new policy)
- `packages/engine/src/sim/simulator.ts` (modify — skip instead of halt)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — Card 75 step-1 grants)
- `packages/engine/src/cnl/compile-agents.ts` or applicable compiler file (modify — if policy validation exists)
- `packages/engine/schemas/` (modify — if schema artifacts enumerate policy values)
- Test files (new — see below)

## Out of Scope

- Adding other completion policy values (e.g., `optional` where the player can choose to skip)
- Changing the `outcomePolicy` mechanism
- Modifying the `viabilityPolicy` mechanism
- Multi-step lookahead for free operation viability

## Acceptance Criteria

### Tests That Must Pass

1. **Seed 1009 no longer deadlocks**: Run FITL simulation with seed 1009. The game must NOT stop with `noLegalMoves` after 3 moves. The Card 75 march grant should be skipped, and the game continues to Coup or terminal.
2. **Required policy unchanged**: A free operation with `completionPolicy: required` that has no legal completion still stops the game (existing behavior preserved for explicitly required grants).
3. **Skip policy works across games**: A synthetic test with a free operation grant using `skipIfNoLegalCompletion` where template completion fails — verify the grant is removed from pending and the game continues.
4. **Skip policy with successful completion**: A free operation with `skipIfNoLegalCompletion` where template completion succeeds — verify the operation executes normally (skip only triggers on failure).
5. **Determinism preserved**: Same seed + same game def produces identical results with the new policy (skip is deterministic).
6. **Card 75 full flow**: Test both shaded sides of Card 75 — unshaded (ARVN sweep+assault in Cambodia) and shaded (VC+NVA rally+march in Cambodia). Verify both sides work correctly with the new policy, including the case where march IS possible and the case where it isn't.
7. **Audit coverage**: All FITL grants changed from `required` to `skipIfNoLegalCompletion` must have at least one test verifying correct behavior.
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Games that previously completed successfully produce identical results (no behavioral change for grants that already had legal completions)
2. The `required` completion policy retains its current deadlock-on-failure behavior — only `skipIfNoLegalCompletion` introduces the skip
3. Determinism: skip decisions are based on game state, not on agent implementation details
4. Engine agnosticism: no FITL-specific logic in the engine code

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/turn-flow-free-operation-skip.test.ts` — unit test for the new policy value: grant creation, skip detection, pending queue removal
2. `packages/engine/test/unit/simulator-free-operation-skip.test.ts` — simulator integration test: game continues after skip, determinism preserved
3. `packages/engine/test/e2e/fitl-card-75-sihanoukville.test.ts` — FITL-specific e2e test: Card 75 shaded side with seed 1009, verify game continues past the march grant
4. `packages/engine/test/unit/policy-production-golden.test.ts` — golden fixture update (if Card 75 encoding changes affect compiled output)

### Commands

1. `pnpm -F @ludoforge/engine test` (full engine test suite)
2. `pnpm turbo typecheck` (type safety after contract changes)
3. `pnpm turbo lint` (lint compliance)
4. Campaign harness: `bash campaigns/fitl-vc-agent-evolution/harness.sh` with seed 1009 — verify game no longer stalls
