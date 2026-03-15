# Spec 63 — chooseN Performance Optimization

**Prerequisite for**: Spec 62 Phase 2 (MCTS decision expansion)

## 0. Problem Statement

### 0.1 C(n,k) Legality Probing Explosion

`mapChooseNOptions()` in `legal-choices.ts` enumerates all C(n,k) combinations to tag per-option legality, subject to `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024`. When total combinations exceed this cap, every option falls back to `'unknown'` legality.

FITL routinely exceeds the cap. A chooseN with 20 options and cardinality range 1–3:

```
C(20,1) + C(20,2) + C(20,3) = 20 + 190 + 1140 = 1350 > 1024
```

With wider ranges (cardinality 1–8), the count reaches ~185K combinations. The result: the UI cannot distinguish legal from illegal options, forcing the player to guess-and-confirm. This defeats the purpose of per-option legality hints.

### 0.2 advanceChooseN Redundant Pipeline Walks

Each `add` or `remove` command in `advanceChooseN()` re-runs the full discovery pipeline:

1. `prepareLegalChoicesContext()` — rebuilds adjacency graph, runtime table index, seat resolution
2. `legalChoicesDiscover()` — re-evaluates preflight conditions, action applicability, stage effects, query evaluation
3. `mapChooseNOptions()` — re-enumerates the option domain and probes legality
4. `computeTierAdmissibility()` — re-filters tiers against current selection

`GameDefRuntime` already caches the adjacency graph, runtime table index, zobrist table, and rule card memos — those structural caches are not rebuilt per toggle. The redundancy is in re-executing the **effect pipeline** (preflight → stage evaluation → query evaluation → `buildChooseNPendingChoice()`) twice per toggle. Steps 1–2 are **invariant** across add/remove operations — the game state, partial move, and decision context haven't changed. Only the transient selection set changes, which affects steps 3–4 (tier admissibility and per-option legality). Re-running the effect pipeline on every interaction wastes 3–5x the necessary work.

### 0.3 Impact

- **UI responsiveness**: FITL event card choices with 15–25 options stutter on each selection toggle
- **MCTS integration**: `completeDecisionIncrementally()` (Spec 62) calls `advanceChooseN` in tight rollout loops — redundant work multiplies across thousands of iterations
- **Scalability**: Games with larger option domains (evolution-generated specs) will hit the cap even harder

## 1. Architecture Overview

Two complementary optimizations address the two distinct problems:

```
Current pipeline (per add/remove):
  prepareLegalChoicesContext()     ← INVARIANT, wasted
  → legalChoicesDiscover()        ← INVARIANT, wasted
    → mapChooseNOptions()         ← C(n,k) explosion
      → enumerateCombinations()   ← O(C(n,k)) probes
    → computeTierAdmissibility()  ← must recompute (selection-dependent)

Optimized pipeline:
  createChooseNSession()          ← once per chooseN decision
    → prepareLegalChoicesContext()
    → legalChoicesDiscover()
    → snapshot invariant state
  advanceChooseNWithSession()     ← per add/remove, uses snapshot
    → independentProbe()          ← O(n) probes (replaces C(n,k))
    → computeTierAdmissibility()  ← recomputed (selection-dependent)
```

**Optimization 1 — Independent probing** replaces the C(n,k) enumeration in `mapChooseNOptions()` with O(n) single-option probes. Each unselected option is tested independently against the current selection. This eliminates the combinatorial cap entirely.

**Optimization 2 — Session snapshot** captures the invariant parts of the discovery pipeline once and reuses them across add/remove interactions. Only selection-dependent computations (tier admissibility, per-option probing) run on each interaction.

Both optimizations are independent and compose naturally. Independent probing can ship first with immediate benefit; the session snapshot amplifies gains for interactive and MCTS use cases.

## 2. Independent Probing (replaces C(n,k) enumeration)

### 2.1 Algorithm

Replace the exhaustive enumeration in `mapChooseNOptions()` with per-option independent probes:

```
for each unselected option O in domain:
  probe selection = [...currentSelected, O]
  result = evaluateProbeMove(probe selection)
  if result is illegal:
    mark O as 'illegal' with reason
  else if currentSelected.length === maxCardinality - 1:
    mark O as 'legal' (definitive — this is the final pick)
  else:
    mark O as 'legal' (optimistic — interactions with future picks not tested)
```

### 2.2 Correctness Argument

**Optimistic marking is safe** because:

1. Confirm checks that `canConfirm` is true (cardinality bounds satisfied) and returns the completed selection. Legality of the current selection was already validated by the most recent `findPendingChooseN()` call during the preceding add/remove command. No additional full-selection re-probe occurs at confirm time. If an optimistically-marked option participates in an illegal combination, the preceding add/remove step catches it via the probe.
2. Independent probing catches the most common illegality patterns: options that are individually invalid (wrong zone, wrong faction, insufficient resources) regardless of what else is selected.
3. Interaction effects (option A is only legal if option B is also selected) are rare in practice and typically constrained to tier-based prioritization, which is handled by `computeTierAdmissibility()` separately.

### 2.3 Probe Classification Cases

Each independent probe classifies the option into one of the following:

1. **illegal** → exact illegal — the option cannot participate in any legal selection
2. **satisfiable + confirmable** → exact legal — the option is definitively legal
3. **satisfiable + needs-more** → unresolved — the option may be legal pending further selections
4. **stochastic/ambiguous** → unknown — the probe cannot determine legality
5. **authority mismatch** → option becomes `unknown` with `resolution: 'ambiguous'` — this occurs when the probe reaches a decision owned by a different player (see `CHOICE_PROBE_AUTHORITY_MISMATCH` in `legal-choices.ts:321-334`), preventing the engine from determining satisfiability without that player's input

### 2.4 Witness Search Cost Model

Each witness search node performs the same satisfiability classification as the current exhaustive enumerator (`classifyProbeMoveSatisfiability`). The improvement is twofold: (a) the search needs only one confirmable completion per option, not exhaustive coverage, and (b) deterministic budgets bound the total work. For options with easy witnesses (common case), resolution is fast. For adversarial constraint patterns, the budget caps cost and the option degrades to `provisional`.

### 2.5 Complexity

- **Before**: O(C(n, k)) probes where k ranges over [min, max] cardinality — exponential in the worst case
- **After**: O(n) probes — one per unselected option
- **No cap needed**: The 1024 combination limit (`MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS`) becomes unnecessary and can be removed

### 2.6 Files

| File | Changes |
|------|---------|
| `packages/engine/src/kernel/legal-choices.ts` | Replace enumeration loop in `mapChooseNOptions()` with independent probe loop. Remove `enumerateCombinations()` and `countCombinationsCapped()` if no other callers. Remove or deprecate `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS`. |

## 3. Session Snapshot (eliminates redundant pipeline walks)

### 3.1 ChooseNSession Type

A new type capturing the invariant state of a chooseN decision:

```typescript
interface ChooseNSession {
  /** Adjacency graph, runtime table index, seat resolution */
  readonly preparedContext: LegalChoicesPreparedContext;

  /** Full option domain from evalQuery() before tier filtering.
   *  Tier admissibility is selection-dependent and must be recomputed
   *  from computeTierAdmissibility() on each toggle — it is NOT part
   *  of the cached template. The session caches the domain and invariant
   *  metadata; it recomputes tier filtering and per-option legality. */
  readonly baseDomain: readonly MoveParamScalar[];

  /** Resolved cardinality bounds */
  readonly cardinality: ChooseNCardinality;

  /** The discovery result (action context, preflight, stage effects) */
  readonly discoverySnapshot: LegalChoicesDiscoveryResult;

  /** State hash at session creation — for staleness detection */
  readonly stateHash: bigint;

  /** The decision key this session was created for */
  readonly decisionKey: DecisionKey;
}
```

### 3.2 What Is NOT Cached

The following depend on `currentSelected` and must be recomputed on each add/remove:

- **Tier admissibility** — which tiers are active depends on what has already been selected (see Section 4)
- **Per-option legality** — the independent probe result changes as the selection set grows/shrinks
- **Qualifier filtering** — qualifier-based grouping narrows based on selections within the active tier

### 3.3 API

```typescript
/** Create a session snapshot — call once when a chooseN decision point is reached */
function createChooseNSession(
  def: GameDef,
  state: GameState,
  partialMove: ReadonlyPartialMove,
  decisionKey: DecisionKey
): ChooseNSession;

/** Advance a chooseN using a pre-built session — avoids redundant pipeline walks */
function advanceChooseNWithSession(
  session: ChooseNSession,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand
): AdvanceChooseNResult;
```

The existing `advanceChooseN()` function remains unchanged for backward compatibility. Callers that don't need session optimization continue to work as before.

### 3.4 Session Lifecycle

```
User selects an action with chooseN parameter
  → createChooseNSession()         // snapshot invariant state
  → advanceChooseNWithSession()    // first interaction (or initial options display)

User toggles option (add/remove)
  → advanceChooseNWithSession()    // reuses session, O(n) probes only

User confirms
  → advanceChooseNWithSession()    // validates full selection via session

Game state changes (applyMove, undo, reset)
  → session invalidated            // must create new session
```

### 3.5 Staleness Detection

The session stores a `stateHash` (Zobrist hash from `GameState`). On each `advanceChooseNWithSession()` call, the current state hash is compared. If they differ, the session is stale and the function throws a descriptive error rather than silently producing wrong results.

### 3.6 Files

| File | Changes |
|------|---------|
| `packages/engine/src/kernel/advance-choose-n.ts` | `ChooseNSession` type, `createChooseNSession()`, `advanceChooseNWithSession()` |
| `packages/engine/src/kernel/legal-choices.ts` | Extract session-creation logic from `mapChooseNOptions()` internals |
| `packages/runner/src/worker/game-worker-api.ts` | Session lifecycle: create session on chooseN entry, invalidate on state change, pass to `advanceChooseNWithSession()` |

## 4. Tier Admissibility Dynamics

### 4.1 Why Tiers Cannot Be Cached

FITL piece sourcing uses prioritized tiers: "Available first, then map." After selecting all Available pieces, the map tier unlocks. This means:

```
Initial state (0 selected):
  Tier 0 (Available): [piece_1, piece_2, piece_3]  ← active
  Tier 1 (Map):       [piece_4, piece_5]            ← locked

After selecting piece_1, piece_2, piece_3:
  Tier 0 (Available): []                             ← exhausted
  Tier 1 (Map):       [piece_4, piece_5]            ← NOW active
```

`computeTierAdmissibility()` handles this correctly by iterating tiers and returning the first non-exhausted tier's remaining values. Since the active tier depends on what has been selected, it must run fresh on every add/remove.

### 4.2 Session Boundary

The session caches everything **up to** the tier computation:
- Prepared context (adjacency, runtime, seats) — invariant
- Base option domain (full list before tier filtering) — invariant
- Cardinality bounds — invariant
- Discovery snapshot (action context, preflight) — invariant

The current implementation already tracks statically illegal options (`fixedIllegalOptionKeys`) and excludes them from combination enumeration, reducing the effective domain. The hybrid resolver preserves and extends this optimization.

Tier admissibility and independent probing run fresh each time, using the cached invariants as input.

## 5. Implementation Phases

### Phase 1: Independent Probing

**Scope**: Contained change to `mapChooseNOptions()` in `legal-choices.ts`.

**Deliverables**:
1. Replace the combination enumeration loop with an independent probe loop
2. Remove or gate `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS` (keep as dead code guard if preferred)
3. Update `legal-choices.test.ts` with:
   - Test that 20+ option domains complete without falling back to `'unknown'`
   - Test that individually-illegal options are correctly marked
   - Test that optimistic marking applies when `selected.length < max - 1`
4. Verify all existing `advance-choose-n.test.ts` tests pass unchanged
5. Verify FITL E2E tests pass

**Benefit**: Immediate — all FITL chooseN decisions get accurate per-option legality hints.

### Phase 2: Session Snapshot

**Scope**: New types and functions in `advance-choose-n.ts`, extraction in `legal-choices.ts`, worker integration.

**Deliverables**:
1. `ChooseNSession` type and `createChooseNSession()` in `advance-choose-n.ts`
2. `advanceChooseNWithSession()` using the session for fast re-evaluation
3. Session lifecycle in `game-worker-api.ts` (create on chooseN entry, invalidate on state mutation)
4. Staleness detection via state hash comparison
5. Benchmark test: `advanceChooseNWithSession` is 3–5x faster than `advanceChooseN` for a 15-option domain with 5 add/remove cycles
6. All existing tests pass unchanged

**Benefit**: Faster interactive chooseN and faster MCTS rollout via `completeDecisionIncrementally()`.

### Phase 3 (Optional): Lazy Per-Option Probing in UI

**Scope**: Runner-side optimization — probe on hover/focus rather than eagerly for all options.

**Deliverables**:
1. Initial display shows all options as `'unknown'`
2. On hover or keyboard focus, probe the specific option and update legality
3. Batch probing for visible options on scroll

**Benefit**: Sub-millisecond initial render for very large domains (50+ options). Deferred — only needed if Phase 1 + 2 are insufficient.

## 6. Spec 62 Compatibility

### 6.1 MCTS Skips mapChooseNOptions

MCTS uses `legalChoicesDiscover()` directly and never calls `mapChooseNOptions()`. The independent probing change (Phase 1) has zero impact on MCTS code paths.

### 6.2 MCTS Treats chooseN as Atomic Sampling

In MCTS rollout, `completeDecisionIncrementally()` samples chooseN selections via Fisher-Yates shuffle from the legal domain. It does not iterate add/remove commands — it constructs the complete selection in one step.

### 6.3 Session Snapshot Is Caller-Managed

The `ChooseNSession` is created and held by the caller (worker API or MCTS). No kernel API changes are needed. The kernel remains stateless.

### 6.4 No Direct MCTS Impact

This spec does not affect Spec 62's MCTS implementation. MCTS uses `legalChoicesDiscover()` with atomic chooseN sampling (Spec 62 Section 3.3) and never calls `mapChooseNOptions()` or `advanceChooseN()`. This spec improves the interactive UI path exclusively. If a future spec adds iterative chooseN expansion to MCTS, the probe cache and witness search infrastructure could be reused, but that is not planned.

## 7. Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `packages/engine/src/kernel/legal-choices.ts` | 1, 2 | Replace enumeration in `mapChooseNOptions()` with independent probes (Phase 1). Extract session-creation helper (Phase 2). Note: `computeTierAdmissibility()` is called from `buildChooseNPendingChoice()` in `effects-choice.ts`, not from `mapChooseNOptions()`. The hybrid resolver in `legal-choices.ts` receives options with tier filtering already applied. |
| `packages/engine/src/kernel/advance-choose-n.ts` | 2 | `ChooseNSession` type, `createChooseNSession()`, `advanceChooseNWithSession()` |
| `packages/runner/src/worker/game-worker-api.ts` | 2 | Session lifecycle: create on chooseN entry, invalidate on state change |
| `packages/engine/test/unit/kernel/legal-choices.test.ts` | 1 | Independent probing tests: large domains, illegal detection, optimistic marking |
| `packages/engine/test/unit/kernel/advance-choose-n.test.ts` | 2 | Session-based API tests: creation, reuse, staleness detection, benchmark |

## 8. Existing Infrastructure to Reuse

| What | Where | Used For |
|------|-------|----------|
| `prepareLegalChoicesContext()` | `legal-choices.ts` | Builds adjacency graph, runtime table index, seat resolution — becomes session input |
| `computeTierAdmissibility()` | `prioritized-tier-legality.ts` | Tier unlocking logic — runs fresh per interaction, not cached in session |
| `evaluateProbeMove()` | `legal-choices.ts` | Single-option legality probe — reused as-is for independent probing |
| `resolveChooseNCardinality()` | `choose-n-cardinality.ts` | Min/max resolution — computed once and stored in session |
| `normalizeChoiceDomain()` | `effects-choice.ts` | Option normalization — computed once during session creation. Extract the selection-invariant portion of `buildChooseNPendingChoice()` (option domain from `evalQuery()`, cardinality bounds, prioritized tier entries) into a reusable template structure. The selection-dependent portion (tier admissibility via `computeTierAdmissibility()`, per-option legality) remains as a lightweight recompute path. |
| `legalChoicesDiscover()` | `legal-choices.ts` | Full discovery pipeline — executed once for session snapshot |

## 9. Success Criteria

1. `mapChooseNOptions()` completes in O(n) probes for all FITL chooseN decisions — no options fall back to `'unknown'` due to the combination cap
2. `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS` cap is no longer the limiting factor for legality resolution
3. `advanceChooseNWithSession()` is 3–5x faster than `advanceChooseN()` for a 15-option domain with 5 add/remove cycles (measured via test benchmark)
4. All existing `advance-choose-n.test.ts` and `legal-choices.test.ts` tests pass unchanged
5. FITL compilation and E2E tests pass
6. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — all green

## 10. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Optimistic legality confuses UI (option looks legal but confirm rejects) | Low | Confirm checks `canConfirm` (cardinality bounds). The preceding add/remove already validated legality via `findPendingChooseN()`. UI shows a clear error message with the specific illegality reason. Players learn quickly that optimistic hints are not guarantees. |
| Session becomes stale if state changes unexpectedly | Low | Session stores `stateHash`; every `advanceChooseNWithSession()` call compares hashes and throws on mismatch. Worker invalidates session on `applyMove`, undo, and reset. |
| Independent probing misses interaction effects between options | Medium | Only affects the legality hint, never game correctness. Confirm is the authoritative check. In practice, interaction effects are rare and mostly captured by tier admissibility. |
| Performance regression for small domains (< 10 options) | Very Low | Independent probing is O(n) which equals or beats C(n,k) for all n ≥ 1. For n=5, k=2: C(5,2)=10 probes vs 5 independent probes. Strictly better. |
| `evaluateProbeMove()` cost dominates even with O(n) probes | Low | Each probe is already optimized (no state cloning, early exit on first illegal condition). For 20 options, 20 probes is well within interactive latency budgets (< 50ms). |
