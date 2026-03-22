# 75ENRLEGMOVENU-007: Replace `skipMoveValidation` with Trusted Executable Moves

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel move types, agent return contract, simulator, runner worker/store threading
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-004-agent-and-prepare-playable-moves-update.md, archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-005-simulator-and-runner-type-threading.md

## Problem

`ExecutionOptions.skipMoveValidation` expresses a trust boundary with a bare boolean. That is weaker than the architecture we actually want:

1. The trust relationship is by convention only. Any caller can set the flag.
2. The "same state that produced this move" invariant is not encoded in the value being executed.
3. The agent pipeline currently sheds move provenance before execution:
   - `enumerateLegalMoves()` yields classified moves
   - agents select a raw `Move`
   - simulator/runner call `applyMove(rawMove, { skipMoveValidation: true })`
4. Template-completion paths in `preparePlayableMoves` and `evaluatePlayableMoveCandidate` also produce executable raw `Move` values, but there is no first-class type saying "this move has already been validated for this exact state".

The long-term architecture should carry trust as a typed value, not as a boolean side-channel.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions` in `packages/engine/src/kernel/types-core.ts` currently includes public `skipMoveValidation?: boolean`.
2. `applyMove()` in `packages/engine/src/kernel/apply-move.ts` now threads that option to the internal `skipValidation` mechanism, so the public boolean exists and is active.
3. Spec 75's classified-enumeration split has already landed:
   - `enumerateLegalMoves()` returns `ClassifiedMove[]`
   - `legalMoves()` intentionally remains the raw `Move[]` facade for UI/general callers
   This ticket must preserve that split rather than re-open it.
4. `ClassifiedMove` currently contains `{ move, viability }` only. It does not carry execution provenance such as the state hash it was derived from.
5. `Agent.chooseMove` already accepts `ClassifiedMove[]`, but it still returns a raw `Move`, so trusted provenance is discarded at the selection boundary.
6. `evaluatePlayableMoveCandidate()` and `preparePlayableMoves()` currently surface executable raw `Move` values for completed/stochastic candidates. This is the other provenance-loss point.
7. Runner AI uses the same pattern as simulator: classified enumeration on one side, raw `Move` execution on the other via `bridge.applyMove(...)`.
8. Existing tests already prove the current boolean optimization works for parity. This ticket should replace that coverage with typed trusted-move coverage rather than duplicate it.
9. None of the remaining active tickets currently owns replacing the public boolean with a typed trusted-move contract. This ticket is still required to close that architectural gap.

## Architecture Check

1. The cleaner design is a dedicated `TrustedExecutableMove` value object that carries both the executable `Move` and the state identity it was validated against. Raw moves stay raw; trusted executable moves become a distinct contract.
2. The split boundary introduced by Spec 75 should remain intact:
   - `legalMoves()` continues to serve raw `Move[]` for general kernel/UI callers
   - `enumerateLegalMoves()` continues to serve classified agent-facing data
   This ticket should not collapse those APIs together while introducing trusted execution.
3. `applyMove()` should remain the validating entry point for raw/untrusted `Move` values. A separate `applyTrustedMove()` should accept `TrustedExecutableMove` and perform only cheap trust checks before skipping full validation. This keeps the trust boundary explicit and readable.
4. The boolean option should be removed from the public API entirely. No deprecation shim, no alias path, no "legacy support" branch.
5. This remains game-agnostic. Trust metadata is generic kernel provenance (`sourceStateHash`, provenance kind), not game-specific logic.
6. The trust contract must be carried across both simulator and runner AI pipelines. Otherwise one path stays convention-based and the architecture remains split-brain.
7. The current architecture is already better than the original Spec 75 draft in one key respect: `legalMoves()` stayed raw while agent-facing enrichment moved to `enumerateLegalMoves()`. This ticket should build on that separation, not undo it.

## What to Change

### 1. Introduce `TrustedExecutableMove`

Add a new kernel type in `types-core.ts`:

```typescript
export interface TrustedExecutableMove {
  readonly move: Move;
  readonly sourceStateHash: bigint;
  readonly provenance: 'enumerateLegalMoves' | 'templateCompletion';
}
```

The exact field names may vary, but the contract must encode:
- the executable `Move`
- the state hash the move was validated/completed against
- generic provenance about how the trusted move was produced

### 2. Thread trusted executable moves through classification/completion paths

Update trusted-move producers so executable moves are emitted as `TrustedExecutableMove`, not raw `Move`:

- `enumerateLegalMoves()` / `classifyEnumeratedMoves()`:
  - complete viable enumerated moves produce `TrustedExecutableMove`
  - pending non-stochastic classified moves do not
- `evaluatePlayableMoveCandidate()`:
  - `playableComplete` returns `TrustedExecutableMove`
  - `playableStochastic` returns `TrustedExecutableMove`
- `preparePlayableMoves()`:
  - `completedMoves` and `stochasticMoves` become `readonly TrustedExecutableMove[]`

This ticket should choose a single consistent representation for executable AI candidates and apply it everywhere instead of mixing raw/trusted executable arrays.

### 3. Change the agent selection boundary

Update `Agent.chooseMove` so the agent returns a trusted executable move instead of a raw move:

```typescript
{ readonly move: TrustedExecutableMove; readonly rng: Rng; ... }
```

Then update:
- `RandomAgent`
- `GreedyAgent`
- `PolicyAgent`
- any helper types or tests that currently assume the agent returns a raw `Move`

This is the point where the trusted execution contract survives agent choice instead of being discarded.

### 4. Add `applyTrustedMove()` and remove public `skipMoveValidation`

In `apply-move.ts`:

- add a dedicated `applyTrustedMove(def, state, trustedMove, options?, runtime?)`
- verify cheap invariants before bypassing full move validation:
  - `trustedMove.sourceStateHash === state.stateHash`
  - the trusted payload is structurally coherent
- call the internal core path with skip-validation enabled after those checks

Then remove `skipMoveValidation` from `ExecutionOptions` and update all callers in the same change.

### 5. Update simulator and runner AI pipelines

Update the trusted-move consumer boundaries:

- `packages/engine/src/sim/simulator.ts`
  - agent returns `TrustedExecutableMove`
  - simulator executes via `applyTrustedMove()`
- `packages/runner/src/store/ai-move-policy.ts`
  - selection result returns `TrustedExecutableMove`
- `packages/runner/src/store/agent-turn-orchestrator.ts`
  - selected AI step carries `TrustedExecutableMove`
- `packages/runner/src/worker/game-worker-api.ts`
  - expose/apply the trusted execution path needed by AI execution over the worker boundary
- any runner store call sites that currently do `bridge.applyMove(aiStep.move, ...)`
  - switch to the trusted execution API for AI-selected moves only

Human/UI-selected moves should continue using the validating raw `applyMove` path.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add trusted move type, remove public boolean)
- `packages/engine/src/kernel/legal-moves.ts` (modify — mint trusted executable moves for executable classified results while preserving raw `legalMoves()`)
- `packages/engine/src/kernel/playable-candidate.ts` (modify — return trusted executable moves for completed/stochastic candidates)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — carry trusted executable moves)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify — add `applyTrustedMove`, remove public boolean threading)
- `packages/engine/src/sim/simulator.ts` (modify — consume trusted executable move)
- `packages/runner/src/store/ai-move-policy.ts` (modify — selection types)
- `packages/runner/src/store/agent-turn-orchestrator.ts` (modify — selection types)
- `packages/runner/src/worker/game-worker-api.ts` (modify — trusted apply API for AI path)
- relevant engine/runner tests (modify)

## Out of Scope

- Changing the semantics of `validateMove` itself
- Security-hardening against malicious callers forging trust payloads outside the type system; this is a correctness boundary inside the repo, not a security boundary
- Collapsing `applyMove` and `applyTrustedMove` into a single overloaded API
- Performance benchmarking/reporting beyond the correctness tests already required

## Acceptance Criteria

### Tests That Must Pass

1. Raw `applyMove(def, state, move)` still validates untrusted moves and rejects illegal moves as before.
2. `applyTrustedMove(def, state, trustedMove)` succeeds for trusted executable moves produced from the same state and yields the same result as raw `applyMove` on the same legal move.
3. `applyTrustedMove(def, state, trustedMove)` rejects moves whose `sourceStateHash` does not match the current state.
4. Agents return `TrustedExecutableMove`, not raw `Move`, without losing game-agnostic behavior.
5. Simulator AI execution uses `applyTrustedMove()` and no longer relies on `skipMoveValidation`.
6. Runner AI execution uses the trusted execution path and no longer relies on the public boolean.
7. `ExecutionOptions.skipMoveValidation` is removed from the public kernel surface.
8. Existing suite: `pnpm turbo test`
9. Existing suite: `pnpm turbo typecheck`
10. Existing suite: `pnpm turbo lint`

### Invariants

1. Trust is carried by a typed move value, not by an out-of-band boolean option.
2. Human/UI/external raw move execution continues to validate through `applyMove`.
3. AI/trusted execution remains state-bound: a trusted move is only executable against the state that produced it.
4. No backwards-compatibility shims are introduced. The public boolean goes away completely when the trusted contract lands.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — replace public-boolean assertions with `applyTrustedMove` parity for same-state trusted moves and rejection for mismatched-state trusted moves.
2. `packages/engine/test/unit/agents/random-agent.test.ts` — verify trusted move return type and selection behavior.
3. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` and/or `packages/engine/test/unit/agents/policy-agent.test.ts` — verify agents preserve trusted executable moves through selection.
4. `packages/engine/test/unit/prepare-playable-moves.test.ts` — verify executable candidate preparation returns trusted executable moves.
5. `packages/engine/test/unit/sim/simulator.test.ts` and `packages/engine/test/integration/classified-move-parity.test.ts` — replace `skipMoveValidation` parity with trusted-apply parity.
6. `packages/runner/test/store/ai-move-policy.test.ts` — verify runner AI selection carries trusted executable moves.
7. `packages/runner/test/store/agent-turn-orchestrator.test.ts` — verify runner AI orchestration carries trusted executable moves.

### Commands

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-22
- What changed:
  - Added a first-class `TrustedExecutableMove` contract with `sourceStateHash` and provenance.
  - Removed public `ExecutionOptions.skipMoveValidation` and introduced `applyTrustedMove()` as the explicit trusted execution boundary.
  - Threaded trusted executable moves through classified enumeration, template completion, agent selection, simulator execution, and runner AI execution.
  - Kept `legalMoves()` as the raw `Move[]` facade and preserved classified enrichment on the `enumerateLegalMoves()` / agent-facing path.
  - Updated engine and runner tests to assert the trusted contract instead of the old boolean bypass.
- Deviations from original plan:
  - `ClassifiedMove` now carries optional `trustedMove` metadata for executable classified results rather than replacing `move` outright.
  - Policy evaluation and preview internals intentionally still reason over raw `Move` values and reattach the selected trusted candidate at the boundary, which keeps policy logic decoupled from execution provenance.
  - This ticket also corrected stale assumptions left behind by the earlier Spec 75 split, because classified enumeration had already landed before this work started.
- Verification:
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
