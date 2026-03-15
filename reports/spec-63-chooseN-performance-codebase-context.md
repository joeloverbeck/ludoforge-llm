# Spec 63 — chooseN Performance Optimization: Codebase Context Report

**Purpose**: Provide an external LLM with sufficient codebase context to reason about correctness, edge cases, and alternative approaches for the two optimizations proposed in Spec 63.

---

## 1. System Overview

LudoForge-LLM is a system for evolving board games using LLMs. Game designers (or LLMs) write **Structured Game Specifications** — a DSL embedded in Markdown with fenced YAML blocks — which compile into executable **GameDef JSON**. A deterministic kernel engine runs the games.

### Core Constraints

- **Deterministic**: same seed + same actions = same result. All state transitions are pure functions.
- **Enumerable**: legal moves must be listable — no free-text moves.
- **Finite**: all choices are bounded (tokens from zones, ints from ranges, enums).
- **Immutable**: every state transition returns a new state object; no mutation.
- **Bounded iteration**: `forEach` over finite collections, `repeat N` with compile-time bounds, no general recursion. Trigger chains capped at depth K.

### Key Data Flow

```
GameDef JSON
  → initialState(def, seed)
  → kernel loop:
      legalMoves(def, state) → enumerate legal Move objects
      legalChoicesEvaluate(def, state, partialMove) → ChoiceRequest (pending/complete/illegal)
      applyMove(def, state, move) → new GameState
      terminalResult(def, state) → winner/draw/null
```

The kernel is stateless — all state lives in `GameState` and `GameDef` objects passed as arguments.

### Two Test Games

1. **Fire in the Lake (FITL)** — 4-faction COIN-series wargame. Complex piece sourcing with prioritized tiers, event cards with multi-option selections. This is where chooseN performance matters most.
2. **Texas Hold'em** — poker tournament validating engine-agnosticism.

---

## 2. chooseN Pipeline Architecture

### What chooseN Is

`chooseN` is a decision type where a player selects a subset of options from a domain. Unlike `chooseOne` (pick exactly one), `chooseN` allows selecting between `min` and `max` items. The selection is built incrementally via `add`, `remove`, and `confirm` commands.

### Full Data Flow

```
User selects action with chooseN parameter
  ↓
game-store.ts: selectAction()
  → bridge.legalChoices(partialMove)
    → game-worker-api.ts: legalChoicesEvaluate()
      → legal-choices.ts: legalChoicesEvaluate(def, state, partialMove)
        → prepareLegalChoicesContext()          [builds adjacency graph, runtime table index, seat resolution]
        → legalChoicesWithPreparedContextStrict()
          → resolveActionApplicabilityPreflight()  [action preconditions]
          → executeDiscoveryEffectsStrict()         [walk effect pipeline]
            → effects-choice.ts: chooseN handler   [builds ChoicePendingRequest with options]
              → resolveChooseNCardinality()         [min/max bounds]
              → computeTierAdmissibility()          [prioritized tier filtering]
              → buildChooseNPendingChoice()          [constructs pending request]
          → mapChooseNOptions()                     [C(n,k) legality probing ← THE BOTTLENECK]
  ↓
ChoicePendingRequest returned to UI with per-option legality hints

User toggles an option (add/remove)
  ↓
game-store.ts: addChooseNItem() / removeChooseNItem()
  → advanceChooseN() in game-store.ts
    → bridge.advanceChooseN(partialMove, decisionKey, currentSelected, command)
      → game-worker-api.ts: advanceChooseN()
        → advance-choose-n.ts: advanceChooseN(def, state, partialMove, decisionKey, currentSelected, command)
          → findPendingChooseN()
            → legalChoicesEvaluateWithTransientChooseNSelections()  [FULL PIPELINE RE-RUN]
              → prepareLegalChoicesContext()                        [REDUNDANT]
              → legalChoicesWithPreparedContextStrict()             [REDUNDANT]
                → mapChooseNOptions()                              [C(n,k) AGAIN]
          → validates command (add/remove/confirm)
          → recomputePendingChooseN()  [calls findPendingChooseN AGAIN with updated selection]
  ↓
Updated ChoicePendingRequest returned to UI
```

### Key Observation

Every `add` or `remove` calls `findPendingChooseN()` **twice**: once to validate the current selection state, and once (via `recomputePendingChooseN()`) to get the updated options after the selection change. Each call runs the **entire discovery pipeline** from scratch.

---

## 3. Current Performance Bottleneck — The C(n,k) Explosion

### Where It Happens

`mapChooseNOptions()` in `legal-choices.ts` (lines 236–399) determines per-option legality by enumerating all possible combinations of unselected options and probing each one.

### The Algorithm (Current)

```typescript
// legal-choices.ts lines 270-283
// Count total combinations across all valid cardinality sizes
let totalCombinations = 0;
for (let size = minAdditionalSelections; size <= maxAdditionalSelections; size += 1) {
  totalCombinations += countCombinationsCapped(
    uniqueOptions.length, size,
    MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS - totalCombinations + 1,
  );
  if (totalCombinations > MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS) {
    // BAIL OUT: return all options as 'unknown'
    return request.options.map((option) => ({
      value: option.value,
      legality: 'unknown',
      illegalReason: null,
    }));
  }
}
```

When the combination count is within the 1024 cap, it enumerates every combination:

```typescript
// legal-choices.ts lines 299-381
for (let size = minAdditionalSelections; size <= maxAdditionalSelections; size += 1) {
  enumerateCombinations(uniqueOptions.length, size, (indices) => {
    const additionalSelected = indices.map((index) => uniqueOptions[index]!);
    const selectedChoice = [...request.selected, ...additionalSelected];
    // Probe the full pipeline with this hypothetical selection
    const probed = evaluateProbeMove({ ...partialMove, params: { ...partialMove.params, [request.decisionKey]: selectedChoice } });
    // Update per-option legality based on probe result
    for (const option of additionalSelected) {
      const status = optionLegalityByKey.get(optionKey(option));
      // ... update legality to legal/illegal/unknown based on probe outcome
    }
  });
}
```

### The Cap

```typescript
const MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024;
```

### Real FITL Examples

FITL routinely exceeds the cap:

| Scenario | Options (n) | Cardinality Range | Combinations | Exceeds Cap? |
|----------|-------------|-------------------|--------------|--------------|
| Piece sourcing (small) | 10 | 1–3 | 175 | No |
| Event card (medium) | 20 | 1–3 | 1,350 | Yes |
| Event card (large) | 20 | 1–8 | ~185,000 | Yes |
| Generated spec (stress) | 30 | 1–5 | ~174,000 | Yes |

When the cap is exceeded, **all options** get `legality: 'unknown'`, making the UI unable to guide the player.

### Helper Functions

```typescript
// legal-choices.ts lines 166-181 — capped combination counter
const countCombinationsCapped = (n: number, k: number, cap: number): number => {
  if (k < 0 || k > n) return 0;
  const normalizedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= normalizedK; i += 1) {
    result = (result * (n - normalizedK + i)) / i;
    if (result > cap) return cap;
  }
  return Math.floor(result);
};

// legal-choices.ts lines 183-205 — recursive combination enumeration
const enumerateCombinations = (n: number, k: number, visit: (indices: readonly number[]) => void): void => {
  const current: number[] = [];
  const walk = (start: number, remaining: number): void => {
    if (remaining === 0) { visit(current); return; }
    const upper = n - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(index);
      walk(index + 1, remaining - 1);
      current.pop();
    }
  };
  walk(0, k);
};
```

---

## 4. Redundant Pipeline Walks

### What Happens on Each add/remove

`advanceChooseN()` in `advance-choose-n.ts` calls `findPendingChooseN()` which calls `legalChoicesEvaluateWithTransientChooseNSelections()`:

```typescript
// advance-choose-n.ts lines 31-93
const findPendingChooseN = (def, state, partialMove, decisionKey, currentSelected, runtime) => {
  const request = legalChoicesEvaluateWithTransientChooseNSelections(
    def, state, partialMove,
    { [decisionKey]: currentSelected },  // transient selections injected
    undefined, runtime,
  );
  // ... validates request is a pending chooseN for the expected decisionKey
  return request;
};
```

This triggers the full pipeline in `legal-choices.ts`:

```typescript
// legal-choices.ts lines 919-939
export function legalChoicesEvaluateWithTransientChooseNSelections(
  def, state, partialMove, transientChooseNSelections, options?, runtime?
) {
  validateTurnFlowRuntimeStateInvariants(state);
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);  // ← REBUILT EVERY TIME
  return legalChoicesWithPreparedContextStrict(context, partialMove, true, {
    ...options,
    transientChooseNSelections,
  });
}
```

### What `prepareLegalChoicesContext()` Rebuilds (Unnecessarily)

```typescript
// legal-choices.ts lines 868-891
const prepareLegalChoicesContext = (def, state, partialMove, runtime?) => {
  const action = findAction(def, partialMove.actionId);
  return {
    def,
    state,
    action,
    adjacencyGraph: runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones),   // O(|zones|²)
    runtimeTableIndex: runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def), // O(|tables|)
    seatResolution: createSeatResolutionContext(def, state.playerCount),          // lightweight
  };
};
```

Note: When `runtime` (a `GameDefRuntime`) is provided, adjacency graph and runtime table index are cached. The worker API does pass `runtime` (line 343 in `game-worker-api.ts`), so those two are already cached. But the rest of the pipeline — preflight, effect execution, option probing — still runs from scratch.

### Double Execution Per Command

For an `add` command, `advanceChooseN()` calls:
1. `findPendingChooseN(def, state, partialMove, decisionKey, currentSelected)` — validates current state
2. `recomputePendingChooseN(def, state, partialMove, decisionKey, [...selected, newValue])` — which calls `findPendingChooseN` again with the updated selection

That's **two full pipeline walks per toggle**, each including `mapChooseNOptions()` with its C(n,k) enumeration.

---

## 5. Key Source Code — Annotated Excerpts

### 5.1 `legal-choices.ts` — Core Discovery API

**Public API** (lines 893-939):

```typescript
// Discover without option legality evaluation (used by MCTS)
export function legalChoicesDiscover(def, state, partialMove, options?, runtime?): ChoiceRequest {
  validateTurnFlowRuntimeStateInvariants(state);
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
  return legalChoicesWithPreparedContextStrict(context, partialMove, false, options);
  //                                                                 ^^^^^ no option probing
}

// Discover WITH option legality evaluation (used by UI)
export function legalChoicesEvaluate(def, state, partialMove, options?, runtime?): ChoiceRequest {
  validateTurnFlowRuntimeStateInvariants(state);
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
  return legalChoicesWithPreparedContextStrict(context, partialMove, true, options);
  //                                                                 ^^^^ evaluates option legality
}

// Same as legalChoicesEvaluate but injects transient chooseN selections
export function legalChoicesEvaluateWithTransientChooseNSelections(
  def, state, partialMove, transientChooseNSelections, options?, runtime?
): ChoiceRequest {
  // ... same pipeline, but passes transientChooseNSelections through to effect context
}
```

**Transient Selections Mechanism**: The `transientChooseNSelections` parameter is threaded through `LegalChoicesInternalOptions` into the effect context (`transientDecisionSelections`). When `effects-choice.ts` processes a `chooseN` effect, it reads these transient selections instead of looking in `move.params`. This is how the UI can show "what would the options look like if these items were selected" without modifying the actual move.

**Option Legality Routing** (lines 401-460):

```typescript
const mapOptionsForPendingChoice = (evaluateProbeMove, classifyProbeMoveSatisfiability, partialMove, request) => {
  if (request.type === 'chooseN') {
    return mapChooseNOptions(evaluateProbeMove, classifyProbeMoveSatisfiability, partialMove, request);
    // ↑ C(n,k) enumeration for chooseN
  }
  // For chooseOne: simple O(n) per-option probing
  return request.options.map((option) => {
    const probed = evaluateProbeMove({ ...partialMove, params: { ...partialMove.params, [request.decisionKey]: option.value } });
    // ... classify legality
  });
};
```

Note the asymmetry: `chooseOne` already does O(n) independent probing. Only `chooseN` uses the C(n,k) enumeration.

### 5.2 `advance-choose-n.ts` — Interactive Selection API

```typescript
// Public API — lines 108-218
export function advanceChooseN(
  def: GameDef, state: GameState, partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
  runtime?: GameDefRuntime,
): AdvanceChooseNResult {
  // Step 1: Validate current selection is consistent
  const pending = findPendingChooseN(def, state, partialMove, decisionKey, currentSelected, runtime);

  if (command.type === 'add') {
    // Validate: not duplicate, in domain, currently legal
    // Then recompute with [...selected, newValue]
    return recomputePendingChooseN(def, state, partialMove, decisionKey, [...pending.selected, command.value], runtime);
  }

  if (command.type === 'remove') {
    // Validate: value is selected
    // Then recompute without the removed value
    return recomputePendingChooseN(def, state, partialMove, decisionKey,
      pending.selected.filter((v) => scalarKey(v) !== scalarKey(command.value)), runtime);
  }

  // command.type === 'confirm'
  if (!pending.canConfirm) throw ...;
  return { done: true, value: [...pending.selected] };
}
```

**Types**:

```typescript
export type ChooseNCommand =
  | { type: 'add'; value: MoveParamScalar }
  | { type: 'remove'; value: MoveParamScalar }
  | { type: 'confirm' };

export type AdvanceChooseNResult =
  | { done: false; pending: ChoicePendingChooseNRequest }
  | { done: true; value: readonly MoveParamScalar[] };
```

### 5.3 `prioritized-tier-legality.ts` — Tier Admissibility

```typescript
export function computeTierAdmissibility(
  tiers: readonly (readonly PrioritizedTierEntry[])[],
  alreadySelected: readonly MoveParamScalar[],
  qualifierMode: 'none' | 'byQualifier',
): PrioritizedTierAdmissibility {
  const selectedKeys = new Set(alreadySelected.map((value) => scalarKey(value)));

  if (qualifierMode === 'none') {
    // Simple mode: return first non-exhausted tier's remaining values
    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
      const remainingValues = tier.filter((e) => !selectedKeys.has(scalarKey(e.value))).map((e) => e.value);
      if (remainingValues.length > 0) {
        return { admissibleValues: remainingValues, activeTierIndices: [tierIndex] };
      }
    }
    return { admissibleValues: [], activeTierIndices: [] };
  }

  // byQualifier mode: group by qualifier key, unlock groups across tiers
  // ... more complex logic tracking activeQualifierKeys across tiers
}
```

**Output type**:

```typescript
export interface PrioritizedTierAdmissibility {
  readonly admissibleValues: readonly MoveParamScalar[];
  readonly activeTierIndices: readonly number[];
}
```

### 5.4 `choose-n-cardinality.ts` — Bounds Resolution

```typescript
export function resolveChooseNCardinality(
  chooseN: ChooseNDef,
  evalCtx: ReadContext,
  onIssue: (issue: ChooseNCardinalityIssue) => never,
): ChooseNCardinality {
  // Supports two modes:
  // 1. Fixed: { n: 3 } → min=3, max=3
  // 2. Range: { min: 1, max: 5 } → evaluates min/max as ValueExpr
  // Validates: non-negative integers, min <= max
}

export function canConfirmChooseNSelection(selectedCount: number, min: number, max: number): boolean {
  return selectedCount >= min && selectedCount <= max;
}
```

### 5.5 `effects-choice.ts` — chooseN Effect Handler (relevant excerpt)

The `buildChooseNPendingChoice()` function (lines 239-283) constructs the `ChoicePendingRequest`:

```typescript
const buildChooseNPendingChoice = ({ normalizedOptions, selectedSequence, prioritizedTierEntries, ... }) => {
  const selectedKeys = new Set(selectedSequence.map((v) => choiceOptionKey(v)));
  const prioritizedAdmissibility = buildPrioritizedAdmissibility(prioritizedTierEntries, qualifierMode, selectedSequence);
  const hasAddCapacity = selectedSequence.length < maxCardinality;

  return {
    kind: 'pending', complete: false,
    decisionKey, name, type: 'chooseN',
    options: normalizedOptions.map((value) => {
      const isSelected = selectedKeys.has(choiceOptionKey(value));
      const isPrioritizedIllegal = prioritizedAdmissibility !== null
        && !prioritizedAdmissibility.admissibleKeys.has(choiceOptionKey(value));
      return {
        value,
        // Already-selected items, at-capacity, and tier-blocked items are marked illegal
        // Everything else starts as 'unknown' (to be refined by mapChooseNOptions)
        legality: isSelected || !hasAddCapacity || isPrioritizedIllegal ? 'illegal' : 'unknown',
        illegalReason: null,
      };
    }),
    targetKinds,
    min: minCardinality, max: maxCardinality,
    selected: [...selectedSequence],
    canConfirm: canConfirmChooseNSelection(selectedSequence.length, minCardinality, maxCardinality),
  };
};
```

Key insight: The effect handler already marks tier-blocked options as `illegal`. The `mapChooseNOptions()` step refines the remaining `'unknown'` options via pipeline probing.

---

## 6. Tier Admissibility Dynamics

### Why Tiers Cannot Be Cached Across Interactions

FITL uses prioritized tiers for piece sourcing: "Available pieces first, then pieces from the map." The active tier depends on the current selection:

```
Initial state (0 selected):
  Tier 0 (Available): [piece_1, piece_2, piece_3]  ← active
  Tier 1 (Map):       [piece_4, piece_5]            ← locked

After selecting piece_1, piece_2, piece_3 (Tier 0 exhausted):
  Tier 0 (Available): []                             ← exhausted
  Tier 1 (Map):       [piece_4, piece_5]            ← NOW active
```

`computeTierAdmissibility()` iterates tiers top-to-bottom, returning the first tier with remaining (unselected) values. When a tier is fully exhausted, the next tier unlocks. This means:

1. Adding an option can exhaust a tier, unlocking the next one.
2. Removing an option can un-exhaust a tier, re-locking a previously active one.

### Qualifier Mode Complexity

In `byQualifier` mode, tier unlocking is per-qualifier-group rather than per-tier. A tier can be partially active (some qualifier groups unlocked, others still locked by higher tiers). This makes caching even less feasible — the active set depends on the exact set of selected items and their qualifier values.

### Session Boundary

The spec proposes caching everything **above** the tier computation:
- `LegalChoicesPreparedContext` (adjacency graph, runtime table index, seat resolution) — invariant
- Full option domain (before tier filtering) — invariant
- Cardinality bounds — invariant
- Discovery snapshot (action context, preflight, stage effects) — invariant

Tier admissibility and per-option probing must run fresh on each add/remove.

---

## 7. Runner Integration

### game-worker-api.ts — Worker API

The worker maintains mutable state (`def`, `state`, `runtime`, `history`) and exposes an async API consumed by the store via Comlink:

```typescript
// game-worker-api.ts lines 328-346
async advanceChooseN(
  partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
): Promise<AdvanceChooseNResult> {
  return withInternalErrorMapping(() => {
    const current = assertInitialized(def, state);
    return advanceChooseN(
      current.def, current.state, current.partialMove,
      decisionKey, currentSelected, command,
      runtime ?? undefined,  // passes GameDefRuntime for adjacency/table caching
    );
  });
}
```

The worker currently has no concept of a "chooseN session." Each call is stateless from the worker's perspective — it delegates directly to the kernel function.

### game-store.ts — Zustand Store

The store's `advanceChooseN` helper (lines 724-785) orchestrates the UI flow:

```typescript
const advanceChooseN = async (command) => {
  await runActionOperation(async (ctx) => {
    // 1. Validate current state
    const validationError = validatePendingChoiceType(state.choicePending.type, 'chooseN');

    // 2. Call bridge (→ worker → kernel)
    const result = await bridge.advanceChooseN(
      state.partialMove,
      currentPending.decisionKey,
      currentPending.selected,
      command,
    );

    if (!result.done) {
      // 3a. Update UI with new pending choice
      guardSetAndDerive(ctx, { choicePending: result.pending, error: null });
      return;
    }

    // 3b. Selection confirmed — push to choice stack and discover next choice
    const nextMove = buildMove(state.selectedAction, [...choiceStack, nextChoice]);
    const choiceRequest = await bridge.legalChoices(nextMove);
    // ... update store
  });
};
```

The store exposes three user-facing actions:
- `addChooseNItem(choice)` → `advanceChooseN({ type: 'add', value: choice })`
- `removeChooseNItem(choice)` → `advanceChooseN({ type: 'remove', value: choice })`
- `confirmChooseN()` → `advanceChooseN({ type: 'confirm' })`

### Session Integration Point (Spec 63 Phase 2)

The worker API would need to:
1. Detect when a chooseN decision is reached (from `legalChoices` result).
2. Create a `ChooseNSession` and hold it in worker-local state.
3. Pass the session to `advanceChooseNWithSession()` instead of `advanceChooseN()`.
4. Invalidate the session on `applyMove`, `undo`, or `reset` (any state mutation).

---

## 8. Spec 62 (MCTS) Relationship

### MCTS Skips mapChooseNOptions

MCTS uses `legalChoicesDiscover()` (the `shouldEvaluateOptionLegality = false` path), which never calls `mapChooseNOptions()`. The independent probing change has **zero impact** on MCTS code paths.

### MCTS Treats chooseN as Atomic Sampling

In MCTS rollout, `completeDecisionIncrementally()` (from Spec 62) samples chooseN selections via Fisher-Yates shuffle from the legal domain. It constructs the complete selection in one step — it does not iterate add/remove commands.

### Orthogonality

The two specs are complementary:
- **Spec 62** optimizes MCTS search (rollout-free evaluation, incremental decisions)
- **Spec 63** optimizes interactive chooseN (per-option legality, session caching)

Spec 63's session snapshot could benefit MCTS if it ever needs per-option legality for smarter sampling (e.g., UCB-weighted option selection), but this is not required for Spec 62's current design.

---

## 9. Test Coverage

### Existing Test Files Covering chooseN

| File | Lines | Focus |
|------|-------|-------|
| `advance-choose-n.test.ts` | 530 | Core `advanceChooseN` API: add/remove/confirm commands, error cases, cardinality validation |
| `legal-choices.test.ts` | 3,672 | Comprehensive `legalChoicesEvaluate` tests including chooseN pending requests, but no tests specifically targeting the C(n,k) enumeration or cap behavior |
| `move-decision-sequence.test.ts` | — | Decision sequence with chooseN steps |
| `decision-sequence-satisfiability.test.ts` | — | Satisfiability classification for chooseN |
| `choice-option-policy.test.ts` | — | Option legality policy |
| `legality-surface-parity.test.ts` | — | Parity between discover and evaluate paths |
| `choice-authority-runtime-invariants.test.ts` | — | Authority mismatch during probing |

### Notable Test Gaps

- No test exercises the `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS` cap directly (no test with 20+ options and wide cardinality range).
- No test measures performance or probing count.
- No test for the `'unknown'` fallback behavior when the cap is hit.
- The `legal-choices.test.ts` file does not search for `MAX_CHOOSE_N` or `mapChooseNOptions` or `enumerateCombinations` — confirmed via grep.

### Test Infrastructure

Tests use the Node.js built-in test runner (`node:test` with `describe`/`it`). Fixtures are inline — tests construct minimal `GameDef` and `GameState` objects directly:

```typescript
const makeBaseDef = (overrides?: Partial<GameDef>): GameDef => ({
  metadata: { id: 'test', players: { min: 2, max: 2 } },
  seats: [{ id: '0' }, { id: '1' }],
  // ... minimal defaults
  ...overrides,
}) as GameDef;
```

---

## 10. Questions for Deep Research

### Correctness Concerns

1. **Optimistic legality with interaction effects**: Are there real FITL chooseN decisions where selecting option A makes option B illegal (or vice versa) in a way NOT captured by tier admissibility? If so, independent probing would mark B as `'legal'` when it should be `'illegal'` (or `'unknown'`). The confirm step catches this, but the UI would mislead the player.

2. **Probe with `[...currentSelected, O]` vs `[O]`**: The spec proposes probing each option O by extending the current selection. If `currentSelected` has 3 items and max is 5, the probe tests a selection of size 4. But the *actual* legality of O might depend on what the remaining picks are (size 5 selection). Is probing at size `selected+1` sufficient, or should we probe at `maxCardinality`?

3. **Removal legality**: After removing an option, the remaining selection might become invalid in a tier-admissibility sense (e.g., a map-tier piece was selected while available pieces exist). The current code re-runs the full pipeline, which catches this. Will session-based evaluation handle removal correctly, especially with `byQualifier` tiers?

### Edge Cases

4. **Zero unselected options**: If `currentSelected.length === maxCardinality`, there are no options to probe. The current code handles this (all options marked `'illegal'`). The independent probe loop should short-circuit.

5. **Stochastic decisions after chooseN**: `classifyProbeOutcomeLegality` treats `pendingStochastic` as `'unknown'`. Independent probing preserves this classification. Are there chooseN decisions followed by stochastic outcomes in FITL?

6. **Free operation overlap**: The `freeOperationAmbiguousOverlap` handling in `legalChoicesWithPreparedContextStrict` (lines 832-866) adds complexity. Does this interact with chooseN sessions?

### Alternative Approaches

7. **Hybrid probing**: Instead of pure independent probing, could we do independent probing first (O(n)) and then, only for options marked `'legal'`, do a small targeted combination check among the `'legal'` subset? This would catch interaction effects with bounded cost.

8. **Incremental tier computation**: Since `computeTierAdmissibility` only depends on `alreadySelected`, could the session store the tier structure and provide an O(1) incremental update (add one selected item → check if tier is now exhausted)?

9. **Lazy probing from the UI**: Phase 3 proposes UI-side lazy probing. Could the kernel instead return a "probe handle" that the UI calls per-option, avoiding the need for batch O(n) probing?

10. **Shared probe context**: The `evaluateProbeMove` function (used in `mapChooseNOptions`) creates a new discovery context per probe. Could the session optimization share the `ReadContext` across probes, avoiding repeated preflight resolution?
