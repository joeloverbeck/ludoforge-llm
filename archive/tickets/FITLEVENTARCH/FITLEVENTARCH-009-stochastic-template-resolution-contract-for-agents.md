# FITLEVENTARCH-009: Canonical Stochastic Template Resolution Contract for Agents

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — template completion and agent behavior under stochastic unresolved decisions
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md

## Problem

After introducing stochastic pending decisions, `completeTemplateMove` returns `null` for `pendingStochastic`. If all legal moves are templates in that state, current agents can throw `no playable moves after template completion`.

This creates brittle simulator behavior around stochastic-yet-legal decision frontiers.

## Assumption Reassessment (2026-03-07)

1. `completeTemplateMove` now returns `null` when `legalChoicesEvaluate` yields `pendingStochastic`. — **Verified** at `move-completion.ts:102-104`.
2. `RandomAgent` and `GreedyAgent` currently throw when no completed moves remain after template completion attempts. — **Verified** at `random-agent.ts:22-24` and `greedy-agent.ts:66-68`.
3. There is no explicit canonical agent/runtime contract yet for unresolved stochastic alternatives. — **Verified**: both `unsatisfiable` and `pendingStochastic` return `null`, conflating two semantically different outcomes.
4. `legalMoves()` includes stochastic moves (classified as `unknown` by `classifyDecisionSequenceSatisfiability`, not `unsatisfiable`), so agents DO receive them.

## Architecture Check

1. Agent/runtime flow should treat unresolved stochastic alternatives as a first-class state, not an exceptional crash path.
2. A canonical unresolved-template contract keeps engine behavior robust and extensible without game-specific exceptions.
3. No backward-compatibility aliases: define one explicit behavior for stochastic unresolved templates.

## What to Change

### 1. Introduce discriminated `TemplateCompletionResult` return type

Replace `{ move: Move; rng: Rng } | null` with:
```typescript
type TemplateCompletionResult =
  | { kind: 'completed'; move: Move; rng: Rng }
  | { kind: 'unsatisfiable' }
  | { kind: 'stochasticUnresolved'; move: Move; rng: Rng }
```

This explicitly distinguishes:
- **completed**: all decisions filled, move is ready for `applyMove`
- **unsatisfiable**: empty options domain or min > selectable; move is truly unplayable
- **stochasticUnresolved**: decisions behind a `rollRandom` gate; move has all pre-stochastic decisions filled

### 2. Update agents to handle stochastic fallback

Both `RandomAgent` and `GreedyAgent`:
- Collect `completed` moves as before
- Track `stochasticUnresolved` moves separately
- If no completed moves but stochastic moves exist, pick one randomly and return its partially-completed move
- Only throw if no moves of any kind remain (genuinely empty — shouldn't happen if `legalMoves` was non-empty)

### 3. Update all callers of `completeTemplateMove`

All callers must be updated to handle the new discriminated return type.

### 4. Add robust regressions for agent behavior

Add tests proving agents do not throw solely due to stochastic unresolved template fronts when legal moves exist.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify — new return type)
- `packages/engine/src/agents/random-agent.ts` (modify — stochastic fallback)
- `packages/engine/src/agents/greedy-agent.ts` (modify — stochastic fallback)
- `packages/engine/test/unit/kernel/move-completion.test.ts` (modify — adapt to new return type)
- `packages/engine/test/unit/agents/random-agent.test.ts` (modify — add stochastic tests)
- `packages/engine/test/unit/agents/greedy-agent-core.test.ts` (modify — add stochastic tests)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify — adapt to new return type)
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify — adapt to new return type)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify — adapt to new return type)
- `packages/engine/test/integration/fitl-commitment-targeting-rules.test.ts` (modify — adapt to new return type)
- `packages/runner/src/worker/game-worker-api.ts` (modify — adapt to new return type)
- `packages/runner/test/worker/game-worker.test.ts` (modify — update mocks)
- `packages/runner/test/worker/clone-compat.test.ts` (modify — update mocks)

## Out of Scope

- Legal move enumeration policy harmonization
- UI decision prompting flow
- Event-card content changes

## Acceptance Criteria

### Tests That Must Pass

1. Built-in agents do not crash when legal moves are present but template completion encounters stochastic unresolved choices.
2. Agent behavior remains deterministic for identical seeds/inputs.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Agent fallback behavior is game-agnostic and independent of game-specific card logic.
2. Stochastic unresolved templates are represented explicitly, not conflated with unsatisfiable templates.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/random-agent.test.ts` — stochastic unresolved template front does not cause terminal throw when legal move exists.
2. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — same invariant for greedy expansion path.
3. `packages/engine/test/unit/kernel/move-completion.test.ts` — verify `stochasticUnresolved` result kind returned for stochastic templates.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/random-agent.test.js`
3. `node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

### What Changed (vs. Originally Planned)

All planned changes were implemented as specified. No scope additions or reductions.

1. **`TemplateCompletionResult` discriminated union** — Replaced `{ move, rng } | null` with `{ kind: 'completed' | 'unsatisfiable' | 'stochasticUnresolved' }` in `move-completion.ts`. This explicitly separates three semantically different outcomes that were previously conflated.

2. **Agent stochastic fallback** — Both `RandomAgent` and `GreedyAgent` now track `completed` and `stochasticUnresolved` moves separately. When no completed moves exist but stochastic ones do, agents pick one randomly instead of throwing.

3. **All 14 callers updated** — Every file listed in "Files to Touch" was modified to handle the new return type. Runner's `game-worker-api.ts` and its test mocks were updated.

4. **Test fixtures corrected** — Stochastic test fixtures were updated to use conditional `if`/`when` effects inside `rollRandom.in`, producing different `internalDecisionId` values per roll branch. This ensures the `pendingStochastic` code path is actually exercised (previously, same-ID choices were merged into regular `pending`).

### Test Results

- Engine: 4299 tests pass, 0 failures
- Runner: 1490 tests pass, 0 failures
- Lint: clean
- Typecheck: pre-existing `ActionTooltip.tsx` error (unrelated); our changes *fixed* 3 prior typecheck errors in runner worker files
