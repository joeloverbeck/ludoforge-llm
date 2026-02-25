# Spec 50 — Event Interactive Choice Protocol

**Status**: ✅ COMPLETED
**Depends on**: Spec 29 (FITL event card encoding)
**Affects**: Kernel legal move enumeration, agents, simulator, browser runner

## Problem Statement

Event cards with `chooseOne` effects inside `forEach` loops (e.g., Gulf of Tonkin: "moves 6 US pieces from out-of-play to **any** Cities") do not let the player choose. The kernel's `enumerateCurrentEventMoves()` in `legal-moves.ts` pre-resolves all `chooseOne` decisions via `resolveMoveDecisionSequence()`, which calls `pickDeterministicChoiceValue()` — always selecting `values[0]` (the first option in enumeration order). Every event with a `chooseOne` in its effects is hardcoded to the first legal option.

For Gulf of Tonkin, this means all 6 pieces always move to `an-loc:none` (first city alphabetically). The card text says "any Cities" — a player decision — but no player or bot ever gets to make that decision.

This affects **every** FITL event card and macro that uses `chooseOne` in its effects, not just Gulf of Tonkin.

## Key Finding: The Infrastructure Already Exists

The step-by-step choice protocol is already implemented in three independent places. The only change needed is to stop bypassing it for event moves.

### Existing infrastructure

| Component | File | What it does |
|-----------|------|--------------|
| `completeTemplateMove()` | `packages/engine/src/agents/template-completion.ts:57-105` | Step-by-step loop: calls `legalChoicesEvaluate()` → gets pending choice → randomly selects an option → adds to `move.params` → repeats until complete. Already used by `RandomAgent` and `GreedyAgent`. |
| `legalChoicesEvaluate()` | `packages/engine/src/kernel/legal-choices.ts:542-566` | Accepts a partial move, runs effects in **discovery mode**, returns the next `ChoicePendingRequest` with all legal options and their legality status. |
| Event effect discovery | `packages/engine/src/kernel/legal-choices.ts:444-446` | `legalChoicesEvaluate` already resolves event effect lists via `resolveEventEffectList()` and runs them in discovery mode. Event `chooseOne` effects already return `pendingChoice` when the decision param is missing (`effects-choice.ts:77-98`). |
| `GameWorkerAPI.legalChoices()` | `packages/runner/src/worker/game-worker-api.ts:57,225-229` | Already exposed to the browser runner. The UI can call `legalChoices(partialMove)` with a partial event move and get back the next choice to present. |
| `isMoveDecisionSequenceSatisfiable()` | `packages/engine/src/kernel/move-decision-sequence.ts:105-112` | Checks whether an event move's decisions CAN all be satisfied, without pre-resolving them. Already exists and is used elsewhere. |

### What is blocking

One function: `enumerateCurrentEventMoves()` in `packages/engine/src/kernel/legal-moves.ts:251-330`.

Lines 311-328 call `resolveMoveDecisionSequence()` which pre-resolves all `chooseOne` decisions deterministically (always first option). It emits only the fully-resolved move. Callers (agents, simulator, runner) never see the base event move template and never get a chance to make choices.

## What Must Change

### 1. `enumerateCurrentEventMoves()` — emit event templates, not resolved moves

**File**: `packages/engine/src/kernel/legal-moves.ts`
**Lines**: 251-330

**Current behavior** (lines 311-328):
```typescript
completion = resolveMoveDecisionSequence(def, state, move, { ... });
if (!completion.complete) {
  continue;  // Skip unsatisfiable events
}
// Emits fully-resolved move with all chooseOne decisions pre-filled
```

**Required behavior**:
```
1. Check satisfiability via isMoveDecisionSequenceSatisfiable(def, state, move)
2. If satisfiable: emit the BASE event move (eventCardId + eventDeckId + side + branch only)
3. If not satisfiable: skip (same as current behavior)
```

The base event move is already constructed on lines 280-287 and 291-299. Currently it's passed through `resolveMoveDecisionSequence` to fill in decisions before emission. After the change, it's emitted directly (after satisfiability check).

### 2. Simulator game loop — complete event templates before apply

**File**: `packages/engine/src/sim/simulator.ts`

The simulator calls `legalMoves()` → `agent.chooseMove()` → `applyMove()`. After the change, event moves from `legalMoves()` are templates (missing decision params). `applyMove()` will fail because effects expect all params.

The agents (`RandomAgent`, `GreedyAgent`) already call `completeTemplateMove()` internally — they should handle event templates naturally. However, **verify** that the agent code path applies `completeTemplateMove()` to ALL moves, not just moves matching `isTemplateMoveForProfile()` (which checks for action pipelines, not events).

**File**: `packages/engine/src/agents/random-agent.ts`
**File**: `packages/engine/src/agents/greedy-agent.ts`

Check whether agents already pass event moves through `completeTemplateMove()`. If agents skip template completion for moves that already have some params (event moves have `eventCardId`, `side`, etc.), they need adjustment to also complete event moves with pending decisions.

### 3. `isTemplateMoveForProfile()` — may need broadening

**File**: `packages/engine/src/agents/template-completion.ts:18-20`

```typescript
export const isTemplateMoveForProfile = (def: GameDef, move: Move): boolean =>
  def.actionPipelines?.some((p) => p.actionId === move.actionId) === true
  && Object.keys(move.params).length === 0;
```

This function only considers a move a "template" if it has zero params AND matches an action pipeline. Event moves have params (`eventCardId`, `side`, etc.) so this function returns `false` for them. If agents use this function to decide whether to call `completeTemplateMove()`, event moves would be skipped.

**Required**: Either broaden `isTemplateMoveForProfile` to recognize event templates, or introduce a separate `isEventTemplateMove()` predicate that checks whether an event move has unresolved decisions. Alternatively, agents could attempt `completeTemplateMove()` on ALL moves unconditionally — for already-complete moves, `legalChoicesEvaluate()` returns `kind: 'complete'` immediately and the function is a no-op.

### 4. Tests — update event move tests to use template completion

Existing tests that call `legalMoves()` and then directly call `applyMove()` with event moves will break because event moves are now templates. These tests must either:

- Use `completeTemplateMove()` to resolve decisions before `applyMove()`
- Or manually construct decision params (as Test B in the Gulf of Tonkin test already does)

### 5. Browser runner — no engine changes needed

The `GameWorkerAPI.legalChoices(partialMove)` endpoint already exists (line 57 of `game-worker-api.ts`). The browser runner's choice UI panel already handles `ChoicePendingRequest`. No kernel or runner-side engine changes are needed for interactive play — the UI just needs to call `legalChoices()` with the event base move and present the resulting choice to the player, then loop.

Whether the runner UI already has the full interaction loop wired up (calling `legalChoices` repeatedly until complete) is a runner concern outside this spec's scope.

## Invariants

### INV-1: Deterministic replayability preserved

Given the same seed and the same sequence of decisions, the game produces the same result. Event moves now include explicit decision params (chosen by agent or player) rather than implicit first-option defaults. The move log captures all decision params, so replaying the log reproduces the game exactly.

### INV-2: Event satisfiability gating unchanged

An event move is only emitted as a legal move if its decision sequence is satisfiable. `isMoveDecisionSequenceSatisfiable()` performs the same check that `resolveMoveDecisionSequence()` implicitly performed. Events with no valid options for a required `chooseOne` are still excluded.

### INV-3: Agents produce valid completed moves

After `completeTemplateMove()`, an event move has all decision params filled. `applyMove()` with a completed event move succeeds without error. The move is indistinguishable from the old pre-resolved moves in terms of what `applyMove()` receives.

### INV-4: Zero-option forEach is still a no-op

When a `forEach` iterates over an empty collection (e.g., 0 pieces in out-of-play), the loop body (including `chooseOne`) never executes. No decision params are needed. The event move is emitted as a complete move (not a template) because `isMoveDecisionSequenceSatisfiable` returns true and `legalChoicesEvaluate` returns `kind: 'complete'`.

### INV-5: Event moves with no chooseOne effects are unaffected

Events whose effects contain no `chooseOne` or `chooseN` (e.g., simple `moveAll`, `addVar`) produce complete moves directly, same as before. The satisfiability check passes, `legalChoicesEvaluate` returns `kind: 'complete'`, and the move needs no template completion.

### INV-6: Non-event legal moves are unaffected

Only `enumerateCurrentEventMoves()` changes. Regular action move enumeration (`enumerateParams()`) is untouched.

### INV-7: legalMoves count for events may change

Previously: 1 fully-resolved move per event side. After: 1 template move per event side (same count, different content). The move count returned by `legalMoves()` for events should remain the same — one per satisfiable side/branch combination.

## Tests

### Test 1: Event template move has base params only

```
Given: Gulf of Tonkin card-1 with 8 US pieces in out-of-play
When: legalMoves() is called
Then: The unshaded event move has params { eventCardId, eventDeckId, side }
  AND the move does NOT contain any decision:...chooseOne... keys
  AND the move count equals the number of satisfiable event sides
```

### Test 2: legalChoicesEvaluate returns pending choice for event template

```
Given: Gulf of Tonkin unshaded event template move (no decision params)
When: legalChoicesEvaluate(def, state, templateMove) is called
Then: Returns ChoicePendingRequest with:
  - kind: 'pending'
  - type: 'chooseOne'
  - options containing all 8 FITL city zones
  - Each option has legality 'legal' or 'unknown'
  - decisionId matches the chooseOne bind pattern for the first piece
```

### Test 3: Step-by-step completion resolves all decisions

```
Given: Gulf of Tonkin unshaded event template move
When: completeTemplateMove(def, state, templateMove, rng) is called
Then: Returns a fully-resolved move with:
  - All 6 decision params filled (one per piece in the forEach)
  - Each decision value is a valid city zone ID
  - The completed move can be passed to applyMove() without error
```

### Test 4: Agent-completed event move distributes across cities

```
Given: Gulf of Tonkin with 8 US pieces in out-of-play
When: RandomAgent completes the event template with a non-trivial seed
Then: The 6 pieces land in at least 2 different cities
  (probabilistic — with 8 cities and random selection, P(all same) ≈ 0.001)
```

### Test 5: GreedyAgent completes event templates

```
Given: Gulf of Tonkin with 8 US pieces in out-of-play
When: GreedyAgent.chooseMove() is called with event templates in legal moves
Then: Returns a valid completed event move
  AND applyMove succeeds
  AND 6 pieces are moved to cities
```

### Test 6: Fewer-than-limit pieces produce fewer decisions

```
Given: Only 4 US pieces in out-of-play (limit is 6)
When: completeTemplateMove is called on the event template
Then: The completed move has exactly 4 decision params (not 6)
  AND all 4 pieces move to cities
  AND 0 remain in out-of-play
```

### Test 7: Zero pieces produce a complete move (no template)

```
Given: 0 US pieces in out-of-play
When: legalMoves() returns the unshaded event move
Then: The move is already complete (no pending decisions)
  OR legalChoicesEvaluate returns kind: 'complete' immediately
  AND applyMove succeeds with no pieces moved
```

### Test 8: Events without chooseOne are emitted as complete moves

```
Given: An event card whose effects are only moveAll + addVar (no chooseOne)
When: legalMoves() is called
Then: The event move is fully complete (no template completion needed)
  AND applyMove succeeds directly
```

### Test 9: Satisfiability gating still excludes impossible events

```
Given: An event card with chooseOne over a query that returns 0 options
  (e.g., "choose a city with US base" when no US bases exist on the map)
When: legalMoves() is called
Then: The event move is NOT included in legal moves
  (same as current behavior — unsatisfiable events are filtered out)
```

### Test 10: Simulator runs to completion with event templates

```
Given: A full FITL game setup with event deck containing Gulf of Tonkin
When: The simulator runs with RandomAgent for N turns (enough to encounter events)
Then: The game does not crash
  AND event moves are successfully completed and applied
  AND the game trace includes event moves with decision params
```

### Test 11: Existing non-event tests are unaffected

```
Given: All existing unit and integration tests for non-event actions
When: The test suite runs
Then: All non-event tests pass without modification
```

## Out of Scope

- **Browser runner UI for interactive event choices**: The kernel exposes `legalChoices()` and the worker API already wraps it. Wiring the UI to present sequential event choices is a runner-side feature, not a kernel concern.
- **Smarter bot strategies for event choices**: GreedyAgent could evaluate each city option and pick the strategically best one. This is an agent improvement, not a protocol change.
- **Event choice undo/back**: Allowing a player to revise a previous choice within the same event's forEach loop. This would require partial move rollback support.
- **New DSL primitives**: The existing `forEach` + `chooseOne` pattern is sufficient. No new AST nodes are needed.

## Outcome

- **Completion date**: 2026-02-25
- **What changed**: Spec 50 implementation delivered and validated; document archived as completed.
- **Deviations from original plan**: None recorded.
- **Verification results**: User confirmed all related tests are passing.
