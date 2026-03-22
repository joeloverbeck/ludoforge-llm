# 75ENRLEGMOVENU-005: Reassess Simulator & Runner ClassifiedMove Threading

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Possibly none; expected work is test hardening plus ticket correction
**Deps**: archive/tickets/75ENRLEGMOVENU/75ENRLEGMOVENU-002-enumeratelegal-moves-classification.md, archive/tickets/75ENRLEGMOVENU-003-skip-move-validation-threading.md, tickets/75ENRLEGMOVENU-004-agent-and-prepare-playable-moves-update.md

## Problem

This ticket originally assumed that simulator and runner production wiring still needed to be updated for `ClassifiedMove[]`. That assumption is now stale. The current codebase already threads classified moves through the agent-facing simulator and runner boundaries. The remaining work is to:

1. correct the ticket so it reflects the real architecture,
2. confirm that architecture is the right one, and
3. strengthen tests where the optimization and type boundary are not yet proven clearly enough.

## Assumption Reassessment (2026-03-22)

1. `packages/engine/src/sim/simulator.ts` already calls `enumerateLegalMoves(...)` and passes `legalMoveResult.moves` to `agent.chooseMove(...)`.
2. `packages/engine/src/sim/simulator.ts` already passes `{ ...options, skipMoveValidation: true }` into `applyMove(...)`.
3. `packages/engine/src/sim/simulator.ts` already logs `legalMoveResult.moves.length`, so the logging/threading portion is also already in place.
4. `packages/runner/src/worker/game-worker-api.ts` already keeps the split boundary:
   - `legalMoves()` returns raw `Move[]`
   - `enumerateLegalMoves()` returns `LegalMoveEnumerationResult` with `ClassifiedMove[]`
5. `packages/runner/src/store/ai-move-policy.ts` already types `SelectAgentMoveInput.legalMoves` as `readonly ClassifiedMove[]`.
6. `packages/runner/src/store/agent-turn-orchestrator.ts` already types `ResolveAgentTurnStepInput.legalMoves` as `readonly ClassifiedMove[]`.
7. Existing runner tests already construct `ClassifiedMove` fixtures, so the runner type migration is not the missing work.

## Architecture Check

1. The current split boundary is preferable to the spec's earlier assumption that `legalMoves()` itself should return `ClassifiedMove[]`.
2. Keeping `legalMoves()` as raw `Move[]` preserves a clean separation:
   - raw move enumeration for general kernel/UI callers,
   - classified enumeration for agent pipelines that need viability metadata.
3. This architecture is more robust and extensible than collapsing both concerns into one API:
   - it avoids forcing classification overhead and richer payloads on every consumer,
   - it keeps UI/store boundaries honest about when they need viability metadata,
   - it avoids future alias/shim pressure because each API has one clear responsibility.
4. `skipMoveValidation` remains an acceptable intermediate contract for the simulator-only trusted path, but it is still not the ideal long-term architecture. A future dedicated trusted-enumeration execution contract would be cleaner than a boolean on general execution options.
5. This ticket should therefore not reopen the production architecture unless testing exposes a real correctness gap.

## What to Change

### 1. Correct the ticket scope

- Rewrite this ticket around the actual remaining work instead of already-landed production changes.
- Record explicitly that the split `legalMoves()` / `enumerateLegalMoves()` architecture is the intended design.

### 2. Harden simulator proof tests

- Add or strengthen simulator tests to prove:
  - the agent input comes from classified enumeration rather than raw `Move[]`,
  - the simulator trace remains identical to a replay that applies the same chosen moves without the optimization,
  - the classified move count used for logging matches the enumerated result.

### 3. Confirm runner/store coverage

- Keep runner production code unchanged unless audit reveals a real mismatch.
- Update runner tests only if a gap exists in asserting the classified boundary clearly enough.

## Files to Touch

- `tickets/75ENRLEGMOVENU-005-simulator-and-runner-type-threading.md` (modify — correct assumptions and scope)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify — strengthen proof around classified agent input and optimization parity)
- `packages/runner/test/store/ai-move-policy.test.ts` (only if audit reveals a missing boundary assertion)
- `packages/runner/test/store/agent-turn-orchestrator.test.ts` (only if audit reveals a missing boundary assertion)

## Out of Scope

- Re-implementing simulator classified threading that is already present
- Changing the established split between raw `legalMoves()` and classified `enumerateLegalMoves()`
- Changing agents or `preparePlayableMoves` (ticket 004)
- Changing `applyMove` internals beyond existing trusted-path usage (ticket 003)
- Runner UI components, canvas, or animation layers

## Acceptance Criteria

### Tests That Must Pass

1. `runGame` agent input is proven to be `ClassifiedMove[]`, not raw `Move[]`
2. `runGame` produces the same resulting move sequence / state progression as replaying the same chosen moves through normal validated `applyMove(...)`
3. Existing runner/store tests continue to prove `ClassifiedMove[]` type acceptance without additional production edits
4. `pnpm turbo test` passes
5. `pnpm turbo typecheck` passes
6. `pnpm turbo lint` passes

### Invariants

1. `skipMoveValidation: true` remains simulator-owned trusted-path behavior, not a generally advertised caller pattern.
2. The optimization does not change trace semantics; it only removes redundant validation work.
3. Runner store types accept `ClassifiedMove[]`, while raw UI-facing move handling remains unchanged where that boundary is already established.
4. Determinism remains intact (Foundation 5).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — add explicit classified-input assertions and parity coverage against validated replay
2. `packages/runner/test/store/ai-move-policy.test.ts` — only touch if the audit finds a missing assertion around classified inputs
3. `packages/runner/test/store/agent-turn-orchestrator.test.ts` — only touch if the audit finds a missing assertion around classified inputs

### Commands

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - corrected the ticket to match the implemented architecture already present in the codebase,
  - confirmed the preferred architecture is the split boundary where `legalMoves()` stays raw and `enumerateLegalMoves()` serves agent-facing classified data,
  - strengthened `packages/engine/test/unit/sim/simulator.test.ts` with explicit coverage that the simulator passes `ClassifiedMove[]` into agents and that simulator execution matches a validated replay of the same moves.
- Deviations from original plan:
  - no simulator production code changes were needed,
  - no runner production code changes were needed,
  - no runner test changes were needed because existing tests already covered the `ClassifiedMove[]` store boundary adequately.
- Verification results:
  - focused engine simulator test passed,
  - focused runner store tests passed,
  - `pnpm turbo test` passed,
  - `pnpm turbo typecheck` passed,
  - `pnpm turbo lint` passed.
