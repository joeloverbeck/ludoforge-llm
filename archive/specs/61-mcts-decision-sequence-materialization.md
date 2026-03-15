**Status**: SUPERSEDED

# Spec 61 — MCTS Decision-Sequence Materialization

**Superseded by**: Spec 62 (MCTS Search Visitor & Incremental Decision Expansion)

**Reason**: The retry-based approach (Section 2.1) is mathematically insufficient for deep decision trees. Spec 62 replaces it with incremental decision expansion and adds a visitor architecture for observability. Phase 1 defensive changes (Sections 2.3-2.4) were implemented and carried forward. Test infrastructure (Section 5) was implemented and carried forward.

## 0. Problem Statement

MCTS cannot play Fire in the Lake (FITL). Out of 10 competence scenarios, 9 fail:
- 7 crash with `moveHasIncompleteParams` during MCTS tree expansion
- 1 crashes with `SELECTOR_CARDINALITY` during effect dispatch inside the search
- 1 runs but picks `pass` (competence failure, likely from impoverished search tree)
- Only 1 (coup pacification, simple fully-resolved moves) passes

**Root cause**: The MCTS expansion phase calls `applyMove()` on moves that have unresolved decision parameters. FITL's complex actions (events with multi-step choices, operations with compound special activities) produce moves that `legalMoves()` returns as *templates* — partial move descriptors that require further *decision-sequence resolution* before they can be applied.

The existing materialization infrastructure (`materializeConcreteCandidates`, `completeTemplateMove`) works for Texas Hold'em but fails to fully resolve FITL's deeper decision trees. The result: moves marked as "completed" still crash in `applyMove()`, or the materialization budget is exhausted and the move is silently excluded, leaving an impoverished search space.

**Scope**: Engine-only (game-agnostic). No game-specific code. No visual presentation changes. No backward compatibility constraints.

## 1. Architecture Analysis

### Current Data Flow

```
legalMoves(def, state)                    ← returns Move[] (may include templates)
  │
  ▼
materializeOrFastPath(def, state, moves)  ← classifies & completes templates
  │
  ├─ fast path: all actionIds in runtime.concreteActionIds → skip materialization
  │
  └─ slow path: materializeConcreteCandidates()
       │
       ├─ legalChoicesEvaluate(def, state, move) → { kind: 'complete' | 'pending' | 'illegal' }
       │    └─ kind !== 'pending' → treat as concrete (pass through as-is)
       │    └─ kind === 'pending' → call completeTemplateMove() up to limitPerTemplate times
       │
       └─ completeTemplateMove(def, state, move, rng)
            └─ completeMoveDecisionSequence() with random choose/chooseStochastic callbacks
            └─ Returns: completed | unsatisfiable | stochasticUnresolved
  │
  ▼
selectExpansionCandidate(candidates, def, state, ...)
  │
  └─ for each candidate: applyMove(def, state, candidate.move)  ← CRASH POINT
```

### Identified Failure Modes

**FM-1: Shallow classification in `legalChoicesEvaluate()`**

`legalChoicesEvaluate()` discovers decisions by executing action effects in "discovery mode." For FITL events, the discovery walks through action effects and event effects. If a move's declared action params are all satisfied (e.g., `{eventCardId, eventDeckId, side}`), but event-specific effects have deeper decisions (e.g., `$nvaLaosPieces`), the function may still return `kind: 'pending'` — but the depth of the pending chain matters for the completion budget.

FITL events can have 5–15+ decision steps in a single move (target spaces, piece selections per space, mode choices, chain confirmations). The default `maxCompletionDecisions` budget of 256 should be sufficient in theory, but any decision step that returns an empty domain causes `completeTemplateMove()` to return `unsatisfiable`, silently dropping the move.

**FM-2: Domain emptiness during random completion**

`completeTemplateMove()` fills decisions randomly. For FITL operations that modify board state as each decision resolves (e.g., rally places guerrillas, then asks about the next space), a random choice at step N can make step N+1's domain empty. Example: a random rally target might be a space with no available pieces, causing the next `$withBaseChoice` decision to have no legal options. The template completer returns `unsatisfiable` and the entire action category is lost from the search.

**FM-3: Compound moves (operation + special activity)**

FITL operations can have `compound.specialActivity` with `timing: 'before' | 'after' | 'during'`. The `completeMoveDecisionSequence()` function resolves the main operation's decisions. It's unclear whether compound special-activity decisions are also resolved, or whether the compound's nested move is treated as a separate decision sequence. If the compound isn't resolved, `applyMove()` will reject the move.

**FM-4: No resilience in expansion**

`selectExpansionCandidate()` calls `applyMove()` with no error handling. If ANY candidate throws (illegal move, eval error, selector cardinality), the entire MCTS search crashes. This turns a single problematic move into a total search failure.

**FM-5: `stochasticUnresolved` exclusion**

Moves that hit a `rollRandom` gate during completion are classified as `stochasticUnresolved` and excluded from candidates. FITL events with stochastic elements (dice rolls for combat, random draws) are silently removed from the search space.

### What Works (and Why)

- **Texas Hold'em**: All moves are either concrete (fold, check, call with amount) or simple templates (bet with amount range). One decision step, always satisfiable.
- **FITL coup pacification** (S10): `coupPacifyUS` moves have fully specified params (`targetSpace`, `action`). No template completion needed.
- **FITL NVA Attack+Ambush** (S9): MCTS runs to completion but picks `pass`. The attack/ambush operations likely fail materialization due to FM-2/FM-3, leaving only `pass` as a viable candidate.

## 2. Solution Architecture

### Principle: Defensive Materialization with Graceful Degradation

The fix must be **game-agnostic** — it should work for any game with deep decision trees, not just FITL. The architecture follows three layers:

1. **Robust completion**: Make `completeTemplateMove()` more resilient to domain emptiness
2. **Defensive expansion**: Make `selectExpansionCandidate()` tolerant of illegal/crashed moves
3. **Diagnostic visibility**: Expose materialization failures through MCTS diagnostics

### 2.1 Robust Template Completion

**Problem**: A single bad random choice can make subsequent decisions unsatisfiable, killing the entire move.

**Solution**: Add retry logic to the template completion pipeline. When a completion attempt returns `unsatisfiable`, retry with a different random seed (up to a configurable limit). This dramatically increases the probability of finding at least one valid completion path.

```
completeTemplateMove(def, state, move, rng)
  └─ attempt 1: random choices → unsatisfiable
  └─ attempt 2: different RNG fork → completed ✓
```

**Location**: `packages/engine/src/kernel/move-completion.ts`

**Changes**:
- Add a `maxRetries` parameter (default: 3) to `completeTemplateMove()`
- On `unsatisfiable` result, fork the RNG and retry
- Return the first successful completion, or `unsatisfiable` after all retries exhausted
- Track retry count in a returned diagnostic field

### 2.2 Compound Move Completion

**Problem**: Compound moves (`operation + specialActivity`) may not have their nested special-activity decisions resolved by the completion loop.

**Solution**: Ensure `completeMoveDecisionSequence()` (or a wrapper) handles compound moves end-to-end: resolve the main operation's decisions, then resolve the compound special-activity's decisions in sequence.

**Location**: `packages/engine/src/kernel/move-decision-completion.ts` and `packages/engine/src/kernel/move-completion.ts`

**Investigation needed**: Read `completeMoveDecisionSequence()` to determine whether compound moves are already handled. If not:
- After completing the main move's decision sequence, check for `move.compound?.specialActivity`
- Run a second completion pass on the special-activity move
- Merge the completed params back into the compound structure

### 2.3 Defensive Expansion

**Problem**: A single illegal move crashes the entire MCTS search.

**Solution**: Wrap `applyMove()` calls in `selectExpansionCandidate()` with error handling. Moves that throw are scored as `-Infinity` (worst possible) and excluded from selection. If ALL candidates fail, return the first candidate without scoring (fallback to random selection from the materialized set — the search will correct via backpropagation).

**Location**: `packages/engine/src/agents/mcts/expansion.ts`

**Changes**:
```typescript
for (let i = 0; i < candidates.length; i += 1) {
  const candidate = candidates[i]!;
  try {
    const result = applyMove(def, state, candidate.move, undefined, runtime);
    // ... score as before
  } catch {
    // Move failed to apply — mark as worst and continue
    scored.push({ index: i, score: -Infinity, isTerminalWin: false });
  }
}
```

Also apply the same defensive pattern to:
- Forced-sequence compression in `search.ts` (line 222: `applyMove` on forced single-candidate)
- The post-expansion `applyMove` in `search.ts` (line 305)

For forced-sequence and post-expansion crashes: break out of the selection loop and backpropagate a loss rather than crashing the entire search.

### 2.4 Defensive Rollout

**Problem**: The `SELECTOR_CARDINALITY` error (S8) occurs during rollout simulation, not expansion. A move that passes materialization may still crash during simulation due to kernel-level eval errors.

**Solution**: The rollout loop in `rollout.ts` should catch errors from `applyMove()` during simulation and treat the crashed state as terminal (backpropagate the current heuristic evaluation).

**Location**: `packages/engine/src/agents/mcts/rollout.ts`

### 2.5 Materialization Diagnostics

**Problem**: When materialization silently drops moves, the search space is impoverished with no visibility.

**Solution**: Add diagnostic counters to `MctsSearchDiagnostics`:
- `materializationAttempts`: total calls to `completeTemplateMove()`
- `materializationSuccesses`: `kind === 'completed'` results
- `materializationUnsatisfiable`: `kind === 'unsatisfiable'` results
- `materializationStochasticSkips`: `kind === 'stochasticUnresolved'` results
- `materializationRetries`: total retry attempts (from 2.1)
- `expansionApplyMoveFailures`: moves that threw in `selectExpansionCandidate()`
- `rolloutApplyMoveFailures`: moves that threw during rollout simulation

**Location**: `packages/engine/src/agents/mcts/diagnostics.ts` and `packages/engine/src/agents/mcts/materialization.ts`

### 2.6 Materialization Budget Tuning

**Problem**: The `templateCompletionsPerVisit` config (default: 2) controls how many completions are sampled per template. For FITL with 30+ legal move templates × 2 completions = 60 candidates, but most completions fail. Increasing the limit improves coverage but costs more per iteration.

**Solution**: Add a new MCTS config field `materializationRetriesPerCompletion` (default: 3) controlling the retry budget from 2.1. The existing `templateCompletionsPerVisit` controls how many DISTINCT completions to attempt per template; the new field controls how many retries per attempt.

**Location**: `packages/engine/src/agents/mcts/config.ts`

## 3. Implementation Plan

### Phase 1: Defensive Resilience (no behavior change for working games)

| Ticket | Deliverable |
|--------|-------------|
| MCTSDECMAT-001 | Defensive expansion: wrap `applyMove()` in `selectExpansionCandidate()` with try/catch, score failures as -Infinity. Add `expansionApplyMoveFailures` diagnostic counter. |
| MCTSDECMAT-002 | Defensive forced-sequence: wrap `applyMove()` in the forced-sequence compression path (search.ts ~line 222) and post-expansion apply (search.ts ~line 305). On error: break selection, backpropagate loss. |
| MCTSDECMAT-003 | Defensive rollout: wrap `applyMove()` in rollout simulation loop. On error: treat as terminal, evaluate current state. Add `rolloutApplyMoveFailures` diagnostic counter. |
| MCTSDECMAT-004 | Run FITL MCTS fast tests (`RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:fast`). Expect: no crashes. Record which scenarios now pass vs still fail on move-category. Report diagnostic counters. |

### Phase 2: Robust Materialization

| Ticket | Deliverable |
|--------|-------------|
| MCTSDECMAT-005 | Add `materializationRetriesPerCompletion` to `MctsConfig` (default: 3). Update `validateMctsConfig()`. |
| MCTSDECMAT-006 | Add retry logic to `completeTemplateMove()`: on `unsatisfiable`, fork RNG and retry up to `maxRetries`. Return first success or final `unsatisfiable`. |
| MCTSDECMAT-007 | Thread retry config from MCTS through `materializeConcreteCandidates()` into `completeTemplateMove()`. |
| MCTSDECMAT-008 | Add materialization diagnostic counters (`materializationAttempts`, `materializationSuccesses`, `materializationUnsatisfiable`, `materializationStochasticSkips`, `materializationRetries`). Wire through `materializeConcreteCandidates()` → diagnostics accumulator. |
| MCTSDECMAT-009 | Investigate compound move completion in `completeMoveDecisionSequence()`. Determine whether `move.compound.specialActivity` decisions are resolved. If not, extend the completion loop to handle compound SA decisions. Write unit tests for compound completion. |
| MCTSDECMAT-010 | Run FITL MCTS fast tests again. Compare diagnostic counters before/after retry logic. Expect: higher `materializationSuccesses`, lower `materializationUnsatisfiable`, more scenarios passing. |

### Phase 3: Validation & CI

| Ticket | Deliverable |
|--------|-------------|
| MCTSDECMAT-011 | Tune acceptable move categories in `fitl-mcts-fast.test.ts` based on actual MCTS behavior after Phase 1-2 fixes. Adjust category sets if MCTS consistently prefers valid-but-different strategies than the NPC rules predict. |
| MCTSDECMAT-012 | Run full FITL MCTS test suite: fast, default, strong. Record results. Adjust `fitl-mcts-default.test.ts` and `fitl-mcts-strong.test.ts` acceptable sets as needed. |
| MCTSDECMAT-013 | Verify Texas Hold'em MCTS tests still pass (no regression from defensive changes). Run: `RUN_MCTS_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fast`. |
| MCTSDECMAT-014 | Final verification: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`. |

## 4. Files to Modify

| File | Changes |
|------|---------|
| `packages/engine/src/agents/mcts/expansion.ts` | Defensive try/catch in `selectExpansionCandidate()` |
| `packages/engine/src/agents/mcts/search.ts` | Defensive try/catch in forced-sequence and post-expansion `applyMove()` |
| `packages/engine/src/agents/mcts/rollout.ts` | Defensive try/catch in simulation `applyMove()` |
| `packages/engine/src/agents/mcts/config.ts` | Add `materializationRetriesPerCompletion` field + preset values |
| `packages/engine/src/agents/mcts/materialization.ts` | Thread retry config, add diagnostic accumulation |
| `packages/engine/src/agents/mcts/diagnostics.ts` | New diagnostic counters |
| `packages/engine/src/kernel/move-completion.ts` | Add retry logic to `completeTemplateMove()` |
| `packages/engine/src/kernel/move-decision-completion.ts` | Potentially: compound SA decision handling |

## 5. Files Already Created (from this session)

The following test infrastructure was created and is ready for use. All files compile, lint, and typecheck. Tests are gated by `RUN_MCTS_FITL_E2E=1`.

| File | Status |
|------|--------|
| `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` | Created. FITL MCTS infrastructure: compilation, victory formulas, deck engineering, 8 turn descriptors, replay-to-decision-point with caching, MCTS search wrapper, category/victory assertions, scenario descriptors. |
| `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` | Created. 10 scenarios, 200 iterations, broad categories. Currently: 1 pass (S10), 9 fail. |
| `packages/engine/test/e2e/mcts-fitl/fitl-mcts-default.test.ts` | Created. 10 scenarios, 1500 iterations, medium categories. Not yet runnable (crashes same as fast). |
| `packages/engine/test/e2e/mcts-fitl/fitl-mcts-strong.test.ts` | Created. 10 scenarios, 5000 iterations, strict categories. Not yet runnable (crashes same as fast). |
| `.github/workflows/engine-mcts-fitl-fast.yml` | Created. 20min timeout. |
| `.github/workflows/engine-mcts-fitl-default.yml` | Created. 30min timeout. |
| `.github/workflows/engine-mcts-fitl-strong.yml` | Created. 45min timeout. |
| `packages/engine/scripts/test-lane-manifest.mjs` | Modified. Added `isMctsFitlE2eTest`, `isMctsFitlProfileTest`, 4 new FITL lanes. |
| `packages/engine/scripts/run-tests.mjs` | Modified. Added 4 FITL MCTS lane entries. |
| `packages/engine/package.json` | Modified. Added 5 test scripts: `test:e2e:mcts:fitl`, `test:e2e:mcts:fitl:fast/default/strong`. |

**Branch**: `feature/fitl-mcts-competence-tests` (uncommitted — commit after spec approval)

## 6. Remaining Work from This Session

The test infrastructure is complete and verified (build, lint, typecheck pass). The acceptable move categories may need adjustment after the MCTS fixes land (tickets MCTSDECMAT-011, MCTSDECMAT-012). No other work remains from this session — everything else is in the ticket plan above.

## 7. Success Criteria

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:fast` — all 10 scenarios pass
2. `RUN_MCTS_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fast` — Texas Hold'em tests still pass (no regression)
3. MCTS search diagnostics show >80% materialization success rate for FITL move templates
4. Zero `expansionApplyMoveFailures` or `rolloutApplyMoveFailures` in normal operation (defensive catches should be rare, not the primary fix)
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — all green

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Retry logic makes materialization too slow for FITL's large move space | Budget cap: `templateCompletionsPerVisit × materializationRetriesPerCompletion` per template. Profile with diagnostics. |
| Compound SA completion changes behavior for Texas Hold'em | Texas Hold'em has no compound moves. Guard with existing MCTS test suite. |
| Defensive expansion masks real bugs | Diagnostic counters expose failure rates. A high `expansionApplyMoveFailures` count signals an upstream materialization problem, not a fixed issue. |
| Acceptable categories in FITL tests are wrong | MCTSDECMAT-011/012 explicitly tune categories based on actual MCTS behavior. The NPC rules are a starting heuristic, not ground truth for MCTS. |
| FITL decision trees exceed 256-step budget | Monitor `materializationUnsatisfiable` with diagnostics. If high, increase `maxCompletionDecisions` or add a per-game config. |

## 9. Non-Goals

- Game-specific MCTS heuristics or evaluation functions
- NPC/bot AI that follows FITL faction rules (Spec 30 scope)
- Visual presentation changes
- Backward compatibility with old MCTS config shapes
- Changes to `legalMoves()` enumeration (works correctly — templates are the intended output)
