# FREEOP-OUTCOME-001: Filter move completions that predictably fail outcome policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agents/prepare-playable-moves.ts, kernel/playable-candidate.ts or kernel/apply-move.ts
**Deps**: None

## Problem

When a free-operation grant has `outcomePolicy: mustChangeGameplayState`, the engine currently allows `evaluatePlayableMoveCandidate` to produce "playable complete" move completions that will predictably fail the outcome policy during `applyMove`.  This causes `IllegalMoveError` at runtime when a bot selects such a completion.

**Concrete scenario** (FITL, seed 17):
1. Sihanouk shaded event grants VC a free Rally in Cambodia, then a free March from spaces that just rallied.
2. VC Rallies in 3 Cambodia spaces but places 0 guerrillas (none available in reserves).
3. The free March grant is issued with `outcomePolicy: mustChangeGameplayState`.
4. `evaluatePlayableMoveCandidate` completes the march template by selecting destination spaces but empty piece lists (`$movingGuerrillas: []`, `$movingTroops: []`) — because `chooseN` with `min: 0` allows empty selections.
5. The PolicyAgent selects this completion.
6. `applyMove` applies the march (no-op), then the outcome policy check fires and throws `IllegalMoveError: freeOperationOutcomePolicyFailed`.

**Rules basis** (FITL 5.1.3): "An executed Event's text that can be implemented must be. If not all of its text can be carried out, implement that which can."  A march with zero pieces cannot be carried out — it should be skipped, not attempted and then rejected.

## Assumption Reassessment (2026-03-22)

1. `evaluatePlayableMoveCandidate` does NOT check outcome policies — confirmed by reading the code.  It only validates structural parameter constraints (chooseN min/max bounds, domain membership).
2. The `mustChangeGameplayState` check in `apply-move.ts:130-154` runs AFTER `applyMove` executes — it compares `materialGameplayStateProjection` before vs after.  There is no pre-flight outcome policy check in the completion path.
3. The viability probing path (`free-operation-viability.ts:645-651`) DOES check `doesCompletedProbeMoveChangeGameplayState` for grants with `mustChangeGameplayState` — but this runs during grant issuance / `legalMoves`, not during agent move completion.
4. `preparePlayableMoves` does not verify that completed moves will satisfy outcome policies before adding them to `completedMoves`.

## Architecture Check

1. The fix should be at the `preparePlayableMoves` layer, not in `evaluatePlayableMoveCandidate` or `applyMove`.  The completion layer's job is structural parameter resolution; the agent preparation layer's job is filtering playable candidates.  Pushing outcome-policy awareness into `evaluatePlayableMoveCandidate` would violate separation of concerns (it's a kernel function, not an agent function).  Alternatively, a lightweight pre-flight check in `preparePlayableMoves` after completion — try-applying the move or checking outcome policy viability — would keep concerns properly separated.
2. This is engine-agnostic: `mustChangeGameplayState` is a generic free-operation outcome policy, not FITL-specific.  The fix applies to any game using this policy.
3. No backwards-compatibility shims needed.  The only behavioral change: `preparePlayableMoves` stops producing completions that will always fail `applyMove`.

## What to Change

### 1. Post-completion outcome-policy filtering in `preparePlayableMoves`

After `evaluatePlayableMoveCandidate` returns `playableComplete`, verify that the completed move will satisfy any applicable `mustChangeGameplayState` outcome policy before adding it to `completedMoves`.

Two implementation approaches (choose one):

**A) Lightweight state-change pre-flight**: Call `materialGameplayStateProjection` on the current state, then dry-run `applyMove` with the completed move in a try/catch.  If `applyMove` throws `freeOperationOutcomePolicyFailed`, discard the completion.  Simple but involves a full `applyMove` call per completion.

**B) Dedicated outcome-policy probe**: Extract the outcome-policy check from `applyMove` into a standalone function (e.g. `wouldFreeOperationSatisfyOutcomePolicy`).  Call it on the completed move before adding to `completedMoves`.  More surgical but requires refactoring the outcome-policy check out of `applyMove`.

Recommendation: **Approach A** for initial implementation — it's simpler and the try/catch cost is acceptable since this path only triggers for free-operation moves with outcome policies (rare).  Approach B can be a follow-up optimization if profiling shows the dry-run is expensive.

### 2. Ensure `preparePlayableMoves` reports non-empty results when at least one valid completion exists

If all completions for a move fail the outcome policy, the move is effectively unplayable.  `preparePlayableMoves` should treat it the same as `completionUnsatisfiable` and continue to the next legal move (if any).  If no legal moves survive filtering, the simulation should stop via the existing `noLegalMoves` path in the simulator, not crash with `PolicyRuntimeError`.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — add outcome-policy filtering after completion
- `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify) — add regression test for seed 17 scenario
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — optionally extend self-play seed coverage

## Out of Scope

- Changing the `chooseN min: 0` semantics in the march profile — this is correct for normal (non-free-operation) marches where a player may choose not to move pieces.
- Changing the Sihanouk event spec — the `mustChangeGameplayState` outcome policy is correctly specified.
- Optimizing the outcome-policy check to avoid full `applyMove` dry-runs (future optimization via Approach B).
- Fixing the underlying game-state issue of VC having zero available pieces — this is a valid game state.

## Acceptance Criteria

### Tests That Must Pass

1. Seed 17, 5-turn FITL policy self-play completes without `IllegalMoveError` — either the march is skipped (no valid completion) or a valid completion (moving actual pieces) is selected.
2. Seed 11, 5-turn FITL policy self-play continues to pass (no regression from zone-filter fix).
3. Existing `prepare-playable-moves.test.ts` tests continue to pass.
4. Existing suite: `pnpm turbo test`

### Invariants

1. `evaluatePlayableMoveCandidate` semantics are unchanged — it remains a structural parameter resolver, not an outcome-policy enforcer.
2. `applyMove`'s outcome-policy enforcement is unchanged — it remains the authoritative check.  The `preparePlayableMoves` filter is a pre-flight optimization, not a replacement.
3. Foundation #1 (Engine Agnosticism): the fix operates on generic `mustChangeGameplayState` policy, not FITL-specific logic.
4. Foundation #5 (Determinism): same seed + same actions = same result.  Filtering out no-op completions is deterministic.
5. Foundation #10 (Architectural Completeness): the fix addresses the root cause (pre-flight outcome-policy filtering at the agent preparation layer), not a symptom.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/prepare-playable-moves.test.ts` — add test: "discards completions that fail mustChangeGameplayState outcome policy for free-operation moves" (reproduces seed 17 scenario)
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — optionally add seed 17 to self-play coverage

### Commands

1. `node --test packages/engine/dist/test/unit/prepare-playable-moves.test.js`
2. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
