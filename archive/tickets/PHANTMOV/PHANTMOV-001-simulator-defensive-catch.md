# PHANTMOV-001: Explicit no-playable-move handling at the agent/simulator boundary

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/sim/simulator.ts`, `packages/engine/src/agents/*`, shared kernel agent types/tests
**Deps**: None

## Problem

The original ticket assumed the primary bug lived in the simulator and could be
patched with a blanket `try/catch`. That no longer matches the codebase.

Today, `preparePlayableMoves` already filters out unsatisfiable template
completions through `evaluatePlayableMoveCandidate`. The remaining gap is a
boundary mismatch:

1. `enumerateLegalMoves` can still legitimately surface classified template
   moves that are incomplete at discovery time.
2. A built-in agent then derives its own "playable" candidate set from those
   classified moves.
3. If every classified move collapses to "not actually playable now", the
   built-in agent currently throws and `runGame` lets that exception escape.

That is not a kernel legality bug by itself. It is an agent/simulator contract
bug: the simulator understands `noLegalMoves`, but the built-in agents have no
explicit way to report "enumerated candidates existed, but none were playable
after agent-side preparation".

The fix should make that state explicit and typed, rather than swallowing
arbitrary agent exceptions by message text.

## Assumption Reassessment (2026-03-29)

1. `runGame` still calls `agent.chooseMove()` without handling the
   agent-contract case "no playable move after preparation". Confirmed.
2. `preparePlayableMoves` is no longer a naive random-completion shim only. It
   already uses `evaluatePlayableMoveCandidate` and stops early on
   `completionUnsatisfiable`. The original ticket understated the current
   architecture. Confirmed in `prepare-playable-moves.ts`.
3. The stale reproduction text around FITL seed 1009 is no longer a reliable
   contract. Current FITL policy-agent coverage already exercises related
   dead-end scenarios (for example seed 17) without fallback. The ticket should
   not anchor acceptance on an unverified historical seed.
4. `RandomAgent` and `GreedyAgent` still throw when their prepared playable set
   is empty. `PolicyAgent` can reach the same state indirectly through policy
   evaluation on an empty prepared set. So the problem is shared across agent
   implementations, but not via the exact same throw site.

## Architecture Check

1. Catching generic agent exceptions in the simulator is the wrong abstraction.
   It would turn a known control-flow condition into stringly-typed exception
   matching and risk masking genuine agent bugs.
2. The better architecture is to introduce a typed, game-agnostic built-in
   agent signal for "no playable move after preparation" and have `runGame`
   translate only that typed condition into `stopReason = 'noLegalMoves'`.
3. This keeps the kernel game-agnostic, preserves deterministic behavior, and
   makes the simulator boundary explicit instead of relying on ad hoc error
   messages.
4. A full `Agent.chooseMove` return-type redesign would be even cleaner in the
   abstract, but it is broader than this ticket needs. A typed shared error is
   the smallest complete fix that restores an explicit contract without a
   message-pattern catch.

## What to Change

### 1. Introduce a typed no-playable-move signal for built-in agents

Add a shared typed error/helper used when a built-in agent receives classified
legal moves but ends up with zero playable candidates after `preparePlayableMoves`.

Use that typed signal from `RandomAgent`, `GreedyAgent`, and `PolicyAgent`
instead of bespoke throw strings or policy-empty fallthrough.

### 2. Translate only the typed signal inside the simulator

In `packages/engine/src/sim/simulator.ts`, catch only the shared typed
no-playable-move condition around `agent.chooseMove()`, convert it into
`stopReason = 'noLegalMoves'`, and continue to let all unrelated agent errors
surface normally.

This keeps real bugs loud while making the one known contract gap explicit.

### 3. Strengthen tests around the contract boundary

Add a synthetic unsatisfiable-template regression that proves:

1. built-in agents surface the typed condition instead of a string-specific
   generic error path;
2. the simulator converts that condition into `noLegalMoves`;
3. unrelated illegal-move/agent failures still throw.

## Files to Touch

- `packages/engine/src/sim/simulator.ts`
- `packages/engine/src/agents/random-agent.ts`
- `packages/engine/src/agents/greedy-agent.ts`
- `packages/engine/src/agents/policy-agent.ts`
- shared agent type/helper file(s) under `packages/engine/src/agents/` or
  `packages/engine/src/kernel/`
- targeted unit tests under `packages/engine/test/unit/agents/` and
  `packages/engine/test/unit/sim/`

## Out of Scope

- Kernel-level legality/discovery redesign. If discovery itself should stop
  surfacing these templates, that belongs in a separate kernel ticket.
- Reworking the entire public `Agent` interface into a richer union return type.
  That may be worth considering later, but is not required for this focused
  fix.

## Acceptance Criteria

### Tests That Must Pass

1. A synthetic unsatisfiable-template scenario causes the simulator to stop with
   `noLegalMoves` rather than crash.
2. `RandomAgent`, `GreedyAgent`, and `PolicyAgent` all use the same typed
   no-playable-move path for that scenario.
3. Existing illegal-move and unrelated agent-error simulator tests still fail
   loudly.
4. Existing engine suite passes.

### Invariants

1. Determinism: same seed + same actions = identical stateHash
2. Simulator does not mask unrelated agent/runtime bugs
3. No game-specific logic in simulator or agent signal
4. No string-pattern matching on error messages for control flow

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — add a regression for the
   typed no-playable-move signal being converted to `noLegalMoves`, plus a
   companion assertion that unrelated errors still surface.
2. `packages/engine/test/unit/agents/random-agent.test.ts` — assert the agent
   emits the typed no-playable-move condition when all prepared candidates are
   unsatisfiable.
3. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — same contract
   for greedy selection.
4. `packages/engine/test/unit/agents/policy-agent.test.ts` — same contract for
   policy selection when preparation yields zero candidates.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Added a shared typed `NoPlayableMovesAfterPreparationError` for built-in
    agents.
  - Updated `RandomAgent`, `GreedyAgent`, and `PolicyAgent` to raise that typed
    condition when classified legal moves collapse to zero playable candidates
    after preparation.
  - Updated `runGame` to translate only that typed condition into
    `stopReason = 'noLegalMoves'`, while preserving unrelated agent/runtime
    failures.
  - Added unit coverage for all three built-in agents plus the simulator
    boundary using a synthetic unsatisfiable-template scenario.
- Deviations from original plan:
  - Did not implement a message-pattern-based simulator catch.
  - Did not use the stale FITL seed-1009 reproduction as acceptance criteria.
  - Kept the existing `Agent` interface and fixed the contract with a typed
    boundary signal rather than a wider return-type redesign.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/random-agent.test.js packages/engine/dist/test/unit/agents/greedy-agent-core.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/sim/simulator.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
