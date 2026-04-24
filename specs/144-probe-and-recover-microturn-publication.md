# Spec 144: Probe-And-Recover Microturn Publication Contract

**Status**: DRAFT
**Priority**: P1 (blocks ARVN agent evolution campaigns; sole remaining `noLegalMoves` witness in `campaigns/fitl-arvn-agent-evolution/`)
**Complexity**: M (kernel publication probe, simulator rollback, trace event, F#18 amendment, convergence-witness re-bless)
**Dependencies**: Spec 140 [microturn-native-decision-protocol] (archived — establishes the publication contract this spec hardens), Spec 139 [constructibility-certificate-legality-contract] (archived — 144 is the microturn-native completion of its intent), Spec 143 [bounded-runtime-memory-and-simulation-cost] (archived — spec 143 self-healed seed 1006; this spec closes the residual class), Spec 134 [unified-move-legality-predicate] (preserved — still the authoritative legality oracle, invoked by the deepened probe)

**Source**:
- Campaign rerun report `reports/fitl-arvn-agent-evolution-seed-report-2026-04-22.md` (seeds 1000..1014, 1020, 1049, 1054)
- Live rerun on the current engine (2026-04-24): seeds 1001 and 1049-stepwise reproduce the same signature; all other report failures self-healed
- FITL rulebook sections 2.3.3 (Pass), 3.3.2 (March), 5.1.3 ("text that can be implemented must be"), 8.5–8.7 (non-player "IF NONE" fallback hierarchy) in `rules/fire-in-the-lake/`
- External prior art: [TAG Tabletop Games Framework](https://tabletopgames.ai/wiki/games/creating/actions_and_rules.html) — no undo/backtrack; IExtendedSequence pushes dead-end prevention onto game authors. [OpenSpiel](https://github.com/google-deepmind/open_spiel) — flat `State.LegalActions()` contract; same assumption. Our invariant (F#18) is stricter, so the engine must own the guarantee.

## Brainstorm Context

**Original framing.** Over approximately two weeks of work (spec 137 convergence-witness distillation, spec 139 constructibility certificates, spec 140 microturn-native decision protocol, spec 143 bounded runtime memory), the recurring symptom is FITL games terminating with `stopReason=noLegalMoves` during the ARVN-evolved agent tournament sweep. Spec 140 was supposed to eliminate this class entirely by making every published microturn decision atomically executable at its scope. The 2026-04-24 rerun confirmed that spec 140 closed most cases: seed 1006 now terminates normally (spec 143's grant-lifecycle fix was the missing piece), and 15 of the 18 report seeds pass cleanly. Two remain:

- **Seed 1001** reproduces `noLegalMoves` at turn 2 with `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations`, in the NVA `march` pipeline (`actionPipelines[10]`) granted by event card-59 shaded.
- **Seed 1049** terminates at turn 0 under direct `runGame` (VC sudden-win event) but diverges under `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs`, where it reaches turn 1 with 237 decisions and hits the same NVA-march constructibility invariant. The divergence is a harness bug (different agent/chance RNG plumbing), not an engine bug.

**Root cause.** `packages/engine/src/kernel/microturn/publish.ts:194` — `isSupportedContinuationResult` terminates in `isSupportedChoiceRequest(continuation.nextDecision)`, which is a type check (`type === 'chooseOne' || type === 'chooseN'`). It does **not** verify that the next `chooseOne`/`chooseN` has at least one legal option. A `confirm` on a `chooseN` whose resume opens a next-level `chooseN` with zero filtered options is therefore published as a legal action. The agent selects `confirm`, `applyPublishedDecision` succeeds, and the *next* `publishMicroturn` call finds the stack-top frame has zero legal options and throws. The simulator at `packages/engine/src/sim/simulator.ts:177-185` catches the error via `isNoBridgeableMicroturnError` and surrenders to `noLegalMoves`.

This violates Foundation #18 as written: "Every kernel-published legal action is constructible atomically at its microturn scope." The published `confirm` is not constructible; its downstream microturn is empty.

**What the rules say.** I read FITL sections 2 through 8:

- **§5.1.3** — "An executed Event's text that can be implemented must be. If not all of its text can be carried out, implement that which can." The rulebook *explicitly sanctions* "grant issued, cannot fully execute" as a legal state. The engine's job is to surface what remains actionable, not to refuse the event.
- **§2.3.3** — Pass is always available to the 1st/2nd Eligible Faction. "+1 Resource if an Insurgent Faction or +3 ARVN Resources if either COIN Faction." Pass is the universal exit.
- **§8.5.3 (VC March "IF NONE")** — "If no such March is possible... the VC instead Rally or, if that is not possible either, Pass." The non-player rules document the exact fallback pattern this spec implements generically.

Conclusion: the rules are not at fault. The engine is.

**Prior art surveyed.**

- [TAG](https://tabletopgames.ai/wiki/games/creating/actions_and_rules.html): IExtendedSequence stack-of-sub-decisions; the framework explicitly does **not** provide undo/backtrack/abandon semantics. Dead-end prevention is a game-author responsibility. "Implementation gap—developers using IExtendedSequence must ensure their `_computeAvailableActions()` logic never produces genuinely unexecutable choices."
- [OpenSpiel](https://github.com/google-deepmind/open_spiel): `State.LegalActions()` is authoritative; no documented recovery.
- Physical board games (Trouble, Backgammon): if no legal moves, turn is forfeited. FITL's Pass is a formalization of this.

Our F#18 commitment is stricter than TAG/OpenSpiel — we promise constructibility, not just a legal-actions list. That means **we must own the guarantee** rather than delegate it to game authors.

**Approach selected.** Hybrid: deepen the probe (primary) plus kernel-owned rollback (safety net). Rationale in § Design D3/D4.

**Alternatives explicitly rejected.**

- **Shallow probe + rollback only** — accepting that "legal" is probabilistic. Policy agents scoring the legal set would encounter ghost moves; agent-side dedup or post-hoc invalidation complicates F#5 (one rules protocol, many clients).
- **Unbounded recursive probe** — correct but too expensive; FITL march's confirm already fans out through resolve-per-destination × movingGuerrillas × movingTroops, and unbounded walks grow with game complexity.
- **Per-game author-provided "legal action" filter** — violates F#1 (engine agnosticism).
- **Treat `noLegalMoves` as acceptable** — non-starter; it breaks campaign tooling and masks real bugs.

**User constraints reflected.** Seed 1049 stepwise-vs-direct divergence is in scope. F#18 amendment is authorized. Compute cost must be bounded (mitigated by depth cap + memoization).

## Overview

Close the probe hole in `publishMicroturn` by deepening the continuation check one bounded level, and add a kernel-level rollback as a defense-in-depth safety net. After this spec:

1. Every candidate microturn decision published by the kernel is verified to lead to either a terminal state, an auto-resolvable microturn, or a player microturn with at least one legal option — recursively up to a bounded depth `K=3`.
2. If a published decision still proves unbridgeable at apply time (either because of a residual probe gap or because `depth > K`), the kernel rolls back to the nearest `actionSelection` frame, blacklists the offending action for the current (seat, turn), reconciles ready blocking free-operation grants for that seat, and re-publishes. If the post-rollback `actionSelection` microturn has zero legal actions, the kernel looks up a generic `tags: [pass]` action in the game spec and emits it as the single legal decision.
3. `stopReason: 'noLegalMoves'` becomes reachable only when rollback cannot identify a new action-selection recovery path, or when the nearest action-selection action is already blacklisted and no `tags: [pass]` fallback is declared. FITL declares `pass` (`data/games/fire-in-the-lake/30-rules-actions.md:159`); the I3 audit adds the generic `pass` tag to Texas Hold'em `check`.

Foundation #18 is amended to distinguish the published contract (which remains "every published action is constructible") from the runtime safety net (a deterministic rollback that catches residual probe gaps as self-describing diagnostic events, not as routine control flow).

## Problem Statement

### The specific witness

Seed 1001 at turn 2 (NVA's turn, NVA-evolved profile):

1. NVA's event-card resolution (`card-59`, shaded) grants a free NVA March.
2. NVA `actionSelection` microturn publishes `march` with `freeOperation: true`; 1 legal action.
3. The `chooseN` for `$targetSpaces` publishes 27 add options + conditionally `confirm`. The NVA-evolved profile selects `phu-bon-phu-yen:none`, then `central-laos:none`, then `confirm`.
4. `applyPublishedDecision` applies `confirm`, resuming effect execution. `insurgent-march-select-destinations` completes; `resolve-per-destination` begins.
5. The next `publishMicroturn` opens a `chooseN` for `$movingGuerrillas@{$destSpace}` (or `$movingTroops` per the else branch). At one of the two selected destinations, the `tokensInAdjacentZones` filter yields zero eligible tokens. The frame has zero legal options.
6. `publishMicroturn` throws `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations`. Simulator surrenders.

Seed 1049 under the stepwise diagnostic (not under the tournament path) reproduces the same structural failure with different target spaces (the-parrots-beak, pleiku-darlac).

### Why the probe doesn't catch it

```
publish.ts:167  isSupportedContinuationResult(def, state, move, continuation, runtime) {
publish.ts:194    return isSupportedChoiceRequest(continuation.nextDecision);
publish.ts:79   const isSupportedChoiceRequest = (request) =>
publish.ts:80     request.type === 'chooseOne' || request.type === 'chooseN';
```

For a candidate `confirm`, `continuation.nextDecision` is a freshly-opened `chooseN` whose `options` list reflects the filter applied to the current state. The probe only asks "is it a chooseN?" — yes — and returns `true`. Nobody checks `options.filter(o => o.legality !== 'illegal').length >= 1`.

At `add` candidates, `toChooseNStepDecisions` (publish.ts:475-528) *does* verify bridgeability by rebuilding the candidate move and calling `isSupportedFrameContinuationMove` recursively. The hole is specifically at `confirm`, where the probe trusts the shape check.

### Why spec 140's contract appeared to hold

Under spec 140's contract, every *actionSelection* candidate goes through `supportedActionMovesForState` → `isSupportedActionMove` → `isSupportedContinuationResult`. This catches action-level unbridgeability. What it misses is *intra-action* unbridgeability — decisions made mid-compound-turn that leave the state in a position where the kernel cannot publish its next microturn. Spec 140 treated the single-level probe as sufficient; the campaign data shows it is not.

## Goals

- **G1** — `publishMicroturn` verifies each candidate decision to a bounded recursion depth; no `chooseOne` / `chooseN` / `chooseNStep` confirm is published unless the resulting next microturn has ≥ 1 legal option (or terminates / auto-resolves cleanly).
- **G2** — If the probe ever proves insufficient (state-dependent branches deeper than `K`, or a future bug), the kernel rolls back deterministically. No `noLegalMoves` termination caused by a probe gap.
- **G3** — Rollback uses a generic game-spec action tagged `pass` when the post-rollback action-selection frame has no other legal options. FITL declares `pass`; the I3 audit adds the generic `pass` tag to Texas Hold'em `check` because that action is the rule-valid no-bet pass. Other conformance-corpus games will need one.
- **G4** — Seed 1001 reaches `stopReason=terminal` under direct `runGame`.
- **G5** — Seed 1049 stepwise diagnostic no longer diverges from `runGame`, because `diagnose-nolegalmoves.mjs` routes through `runGame` instead of hand-rolling its own loop.
- **G6** — FOUNDATIONS #18 amended to distinguish published contract from runtime safety net; no other Foundation changed.
- **G7** — Engine test coverage proves both paths: the deepened probe catches seed 1001, and a synthetic GameDef crafted to evade the probe at `K=3` exercises the rollback.
- **G8** — Policy-profile quality witnesses (`fitl-variant-arvn-evolved-convergence.test.ts`) re-bless against the new decision counts in the same change (F#14). Terminal outcomes stabilize; decision counts shift because some `confirm`s that were previously mis-published no longer appear.
- **G9** — Replay-identity preserved: traces containing `probeHoleRecovery` events replay byte-identically under the determinism test corpus.

## Non-Goals

- **No new agent features.** `Agent.chooseDecision` signature unchanged.
- **No GameDef YAML contract change.** DSL instructions unchanged.
- **No per-game rollback customization.** The rollback is engine-agnostic; it uses only `tags: [pass]` lookup from the generic action set.
- **No change to `advanceAutoresolvable`.** Chance, outcome-grant, and turn-retirement microturns still auto-resolve; rollback applies only to player microturn publication failures.
- **No attempt to prove the deepened probe is exhaustively complete.** The combination (deep probe + rollback) is the guarantee; either alone is insufficient.
- **No change to `evaluateMoveLegality`.** Spec 134's predicate remains the legality oracle; the deepened probe calls it unchanged.
- **No change to the hidden-information model.** F#4 is preserved.
- **No analytics-side compound-turn change.** `GameTrace.compoundTurns[]` still synthesized from decisions; rollback events are filtered out of the compound-turn aggregation.
- **No retroactive fix to pre-spec traces.** Historical traces replay from scratch under the new kernel (F#14).

## Required Investigation (Pre-Implementation)

Each investigation MUST produce a checked-in artifact before ticket work begins.

### I1 — Probe-depth audit for the FITL action set

For every FITL action that uses `chooseN`, nested `chooseOne`, or `forEach` with sub-choices, measure the maximum probe depth required to catch dead-end continuations. Output: a table at `campaigns/phase4-probe-recover/depth-audit.md` with one row per action, recording the observed deepest nested `chooseN`/`chooseOne` chain and the probe depth that would catch an induced dead end.

This validates `K=3` as the default. If any FITL action legitimately requires `K>3`, either raise the default or explicitly mark that action as "rollback-protected only" and document the reason.

Expected finding: `march-nva-profile` is the deepest at 2 nested levels (target-spaces → resolve-per-destination → moving-guerrillas/troops). `K=3` has one level of headroom.

### I2 — Memoization cost/benefit prototype

Build a prototype of the memoization cache (keyed on `(stateHash, frameId, decisionKey, candidateValue)`) on top of `GameDefRuntime.probeCache`. Measure on the 18-seed corpus:

- Cache hit rate per game
- Wall-clock delta with vs. without cache
- Peak cache size (to size the LRU)

Output: a measurement report at `campaigns/phase4-probe-recover/memoization-measurement.md`. If the hit rate is < 15%, remove memoization from the spec. If the hit rate is healthy but the total slowdown without memo is < 5%, either remove the cache or tune the LRU limit to the measured working set; record the decision in the I2 artifact before implementation.

### I3 — Generic `tags: [pass]` lookup + grant-clearing audit

Grep the current conformance corpus (`data/games/fire-in-the-lake/`, `data/games/texas-holdem/`) for actions tagged as fallback candidates:

- FITL: `pass` (defined at `30-rules-actions.md:159`; declared with `effects: []` today — no grant-clearing).
- Texas Hold'em: `fold` (line 244), `check` (line 259).

Output: a classification at `campaigns/phase4-probe-recover/pass-action-audit.md` documenting each game's fallback action, the condition under which it applies (e.g., "always legal to the 1st/2nd Eligible Faction"), and the engine-side lookup predicate (`action.tags.includes('pass')`).

The audit MUST additionally answer: when the rollback pops past a scope that opened a free-operation grant (stored in `state.turnOrderState.pendingFreeOperationGrants`), what clears the now-orphaned grant? Either (a) the game's pass action needs added grant-terminator effects, (b) the engine's rollback emits a grant-clearing effect as part of the pop, or (c) the grant harmlessly expires at turn retirement. Decide and document before ticket work begins — this decision gates the wording of D4. Any corpus game without a `tags: [pass]` action, or whose pass action cannot be made grant-safe, becomes a spec-reviser blocker.

### I4 — Seed 1001 reproduction as checked-in fixture

Extract seed 1001's pre-failure state (turn 2 boundary, post-card-59 resolution) into a fixture file at `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/`. The fixture includes:

- Compiled `GameDef` (snapshot hash for identity).
- Initial `GameState` loaded via `initialState(def, seed=1001)`.
- Recorded decision sequence up to the failure point (so tests can replay without the 245-decision prefix).

This decouples the regression test from the full simulator path and ensures the fix can be validated in < 1 second per test run.

## Design

### D1 — Domain types (new)

```ts
// packages/engine/src/kernel/microturn/probe.ts (new file)

export interface ProbeContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly runtime: GameDefRuntime;
  readonly move: Move;
  readonly depthBudget: number;  // remaining recursion budget
}

export type ProbeVerdict =
  | { kind: 'bridgeable' }
  | { kind: 'unbridgeable'; reason: ProbeUnbridgeableReason };

export type ProbeUnbridgeableReason =
  | 'noLegalOptions'         // next chooseOne/chooseN frame has zero options
  | 'applyThrewIllegal'      // candidate apply produced ILLEGAL_MOVE
  | 'nextFrameHadNoLegal'    // next microturn would throw constructibility
  | 'depthExhausted';        // recursion budget spent; inconclusive

// Lives here (probe-specific) to avoid bloating microturn/constants.ts.
export const MICROTURN_PROBE_DEPTH_BUDGET = 3 as const;
```

```ts
// packages/engine/src/kernel/microturn/rollback.ts (new file)

export interface RollbackResult {
  readonly state: GameState;
  readonly logEntry: ProbeHoleRecoveryLog;
}

// ProbeHoleRecoveryLog is a trace-only diagnostic event, NOT a Decision union
// variant and NOT a DecisionLog variant. It records a kernel-internal recovery
// step; it is not a player/chance/kernel decision, so adding it to the Decision
// union would violate F#19 (decision-granularity uniformity). It is stored in
// its own `GameTrace.probeHoleRecoveries` array.
export interface ProbeHoleRecoveryLog {
  readonly kind: 'probeHoleRecovery';
  readonly stateHashBefore: bigint;  // determinism audit anchor
  readonly stateHashAfter: bigint;
  readonly seatId: ActiveDeciderSeatId;
  readonly turnId: TurnId;
  readonly blacklistedActionId: ActionId;
  readonly rolledBackFrames: number;
  readonly reason: string;  // human-readable; includes the invariant message
}
```

New `GameState` field:

```ts
// packages/engine/src/kernel/types-core.ts

export interface GameState {
  // ... existing fields ...
  /**
   * Per-turn action blacklist maintained by the rollback safety net.
   * Cleared at turn retirement. Keys: `${turnId}:${seatId}`.
   * Values: list of actionIds that proved unbridgeable during this turn.
   */
  readonly unavailableActionsPerTurn?: Readonly<Record<string, readonly ActionId[]>>;
}
```

`DecisionLog` is **not** modified. It remains the single interface currently declared at `packages/engine/src/kernel/microturn/types.ts:290-309`, and the `Decision` union at `types.ts:263-269` remains exactly as is (six variants: actionSelection, chooseOne, chooseNStep, stochasticResolve, outcomeGrantResolve, turnRetirement). Probe-hole recoveries are trace-only events, kept separate from the decision stream.

New `GameTrace` fields (trace-only, non-optional per F#14):

```ts
// packages/engine/src/kernel/types-core.ts

export interface GameTrace {
  // ... existing fields ...
  readonly probeHoleRecoveries: readonly ProbeHoleRecoveryLog[];
  readonly recoveredFromProbeHole: number;  // convenience counter = probeHoleRecoveries.length
}
```

Both fields are **non-optional** per F#14; every `GameTrace` construction site (one source, six+ test — see D10) is migrated in the same change.

### D2 — Deep probe (change #1)

Replace the shallow bridgeability check in `publish.ts`:

```ts
// Before (publish.ts:194)
return isSupportedChoiceRequest(continuation.nextDecision);

// After
return isBridgeableNextDecision(
  { def, state, runtime: getRuntime(def, runtime), move, depthBudget: MICROTURN_PROBE_DEPTH_BUDGET },
  continuation.nextDecision,
);
```

Live-surface correction from ticket 144PROBEREC-001: `ChoicePendingRequest` currently contains only `chooseOne | chooseN`; stochastic continuations live on `DecisionContinuationResult.stochasticDecision` and remain handled by `publish.ts` before this probe is called. `ProbeContext` includes the current `move` because `resumeSuspendedEffectFrame` resolves selected values from move params.

`isBridgeableNextDecision` logic:

```
isBridgeableNextDecision(ctx, request):
  if ctx.depthBudget === 0:
    return true  // optimistic; rollback is the safety net

  switch request.type:
    case 'chooseOne':
      legal = request.options.filter(o => o.legality !== 'illegal')
      if legal.length === 0: return false
      // short-circuit on first legal option that resumes bridgeably
      return legal.some(option => probeOneBridge(ctx, request, option, budget-1))

    case 'chooseN':
      // at least one legal add OR a bridgeable confirm at current selection
      return hasLegalAddThatBridges(ctx, request, budget-1)
          || canConfirmBridgeably(ctx, request, budget-1)

```

`probeOneBridge` speculatively applies the candidate value through `resumeSuspendedEffectFrame`, inspects the resulting continuation, and recurses on its `nextDecision` (or returns `true` if terminal / auto-resolvable). Memoization lives at this entry point.

Key constraints:

- **Purity**: Identical to `applyMove` in its immutability contract — no state mutation escapes the probe. The existing `applyEffects` path is already pure; the probe reuses it.
- **Determinism (F#8)**: Short-circuit iteration order is deterministic (preserves the published `options` order).
- **Bounded (F#10)**: Budget decrements on each recursion. `K=3` default.
- **Memoization**: Cache hits are deterministic because the key is derived from `(stateHash, frameId, decisionKey, candidateValue)` and entries are purely functional.

### D3 — Memoization cache

Extend `GameDefRuntime` with a publication-probe cache. Name is deliberately distinct from the pre-existing session-scoped `probeCache` in `packages/engine/src/kernel/choose-n-session.ts:258` (which caches `SingletonProbeOutcome`s within a single `chooseN` session and is cleared per session). The new cache is run-scoped and caches bridgeability verdicts across publication calls:

```ts
// packages/engine/src/kernel/gamedef-runtime.ts

export interface GameDefRuntime {
  // ... existing fields ...
  readonly publicationProbeCache: LruCache<string, boolean>;  // NEW
}
```

`LruCache<K, V>` is a new minimal generic implementation at `packages/engine/src/shared/lru-cache.ts` (no external dependency per F#14) — a map + doubly-linked list, ~40 lines, with `get(k)`, `set(k, v)`, and `size` plus an `evictionLimit` constructor parameter. It is implemented and unit-tested in ticket 144PROBEREC-001 alongside the probe itself.

Cache key format:

```
probe:${stateHash}:${frameId}:${decisionKey}:${candidateValueStableKey}:${depthBudget}
```

`depthBudget` is in the key because the same (state, frame, candidate) at different remaining budgets can yield different verdicts (deeper budget = more information).

LRU size: 2 500 entries per run by default, tuned by the I2 measurement artifact from an observed 2 467-entry full-corpus peak and capped by spec 143's per-run memory contract. Memoization is strictly an accelerator — removing it produces identical verdicts. The factory `createGameDefRuntime` (gamedef-runtime.ts:61-74) is extended to instantiate the cache; all six existing `createGameDefRuntime` call sites (simulator, publish, apply (×2), resume) automatically receive it.

### D4 — Rollback safety net (change #2)

In `simulator.ts`, replace:

```ts
// Before (simulator.ts:179-184)
try {
  microturn = publishMicroturn(validatedDef, state, resolvedRuntime);
} catch (error) {
  if (isNoBridgeableMicroturnError(error)) {
    stopReason = 'noLegalMoves';
    break;
  }
  throw error;
}
```

with:

```ts
// After
try {
  microturn = publishMicroturn(validatedDef, state, resolvedRuntime);
} catch (error) {
  if (!isNoBridgeableMicroturnError(error)) throw error;
  const rollback = rollbackToActionSelection(
    validatedDef,
    state,
    resolvedRuntime,
    /* invariantMessage */ (error as Error).message,
  );
  if (rollback === null) {
    stopReason = 'noLegalMoves';
    break;
  }
  state = rollback.state;
  if (shouldRetainTrace) probeHoleRecoveries.push(rollback.logEntry);
  continue;  // re-enter the loop; next iteration will publishMicroturn against the rolled-back state
}
```

Recovery events accumulate in a **separate** `probeHoleRecoveries: ProbeHoleRecoveryLog[]` array maintained by the simulator (parallel to the existing `decisionLogs: DecisionLog[]`); they are **not** appended to `decisionLogs` (preserves F#19).

`rollbackToActionSelection` (new module `packages/engine/src/kernel/microturn/rollback.ts`):

1. Walks `state.decisionStack` from top down, finding the nearest frame with `context.kind === 'actionSelection'`. Captures the frame's `actionId` internally — no separate `resolveCurrentActionSelection` helper is exposed; the walk and the actionId capture happen in one pass.
2. If no such frame exists: returns `null` (truly stuck — which under spec 140's invariants should be unreachable, but the explicit `null` is the fail-safe).
3. Produces `newStack = state.decisionStack.slice(0, actionSelectionFrameIndex + 1)`.
4. Records the captured offending `actionId` in `state.unavailableActionsPerTurn[${turnId}:${seatId}]`.
5. Resets `state.activeDeciderSeatId`, `state.nextFrameId`, and any other stack-derived fields to values consistent with the popped stack.
6. Returns `{ state: newState, logEntry: ProbeHoleRecoveryLog }`. The log carries both `stateHashBefore` and `stateHashAfter` for determinism audit.

The `actionSelection` publisher (`publishActionSelection` at `publish.ts:586-611`) is extended to filter `supportedActionMovesForState` by the current turn's blacklist. The filter uses the generic `action.id` + `seatId` + `turnId` tuple — zero FITL-specific code.

### D5 — Generic Pass fallback

When `publishActionSelection` would produce zero legal actions (either because all actions are blacklisted or none are legal in state), it looks up the game-spec `pass` action:

```ts
const passAction = def.actions.find(a =>
  a.tags?.includes('pass') &&
  isActionApplicableForSeat(def, state, a, activeSeatForPlayer(def, state))
);
if (passAction !== undefined) {
  return publishActionSelectionAsSingletonPass(def, state, passAction);
}
throw microturnConstructibilityInvariant(
  'actionSelection has no bridgeable moves and no generic pass fallback declared'
);
```

This is the only engine ↔ game-spec coupling: the engine recognizes `tags: [pass]` as the terminal-fallback hint. It does not hard-code action names or faction-specific rules. FITL declares `pass`; the I3 audit adds the generic tag to Texas Hold'em `check`, not `fold`. Any future conformance-corpus game must declare a rule-valid pass fallback.

Note: the pass action runs through the normal apply pipeline — its effects, grants, and turn-retirement semantics are game-authored. The engine does not synthesize an "empty" pass; it publishes the game's own pass action as the single legal choice. Rollback may first expire ready blocking free-operation grants for the recovered seat so those grants cannot continue to block the generic fallback after the offending granted action has been blacklisted.

### D6 — Seed 1049 harness divergence fix

`campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` currently implements its own loop that imports `publishMicroturn`, `applyPublishedDecision`, and `advanceAutoresolvable` directly (at `diagnose-nolegalmoves.mjs:36-49`). The RNG mix constants and derivation formulas are **identical** to `runGame` (both use `CHANCE_RNG_MIX` and `AGENT_RNG_MIX = 0x9e3779b97f4a7c15n` with the same `seed ^ (BigInt(i+1) * AGENT_RNG_MIX)` shape). The actual divergence is on the **agent-dispatch player resolution**:

- Diagnostic (`diagnose-nolegalmoves.mjs:138`): `const player = state.activePlayer;`
- Simulator (`simulator.ts:191`): `const player = resolvePlayerIndexForSeat(validatedDef, microturn.seatId);`

In FITL, `state.activePlayer` is the faction whose turn it currently is, but during event resolution or interrupt windows the microturn decider can be a non-active faction. The diagnostic therefore dispatches the wrong agent (and wrong `agentRng`) for non-active-faction microturns, producing a different trajectory. Seed 1049 is the reproducer for this class.

Fix: rewrite `diagnose-nolegalmoves.mjs` to route through `runGame(def, seed, agents, maxTurns, playerCount, options, runtime)` with `options.decisionHook = (log) => captureDiagnosticOnFailure(log)` and `options.traceRetention = 'full'`. The diagnostic captures the state at the moment of failure via a hook, not by re-running the simulator loop. This guarantees direct `runGame` and the diagnostic are the same path.

A new `SimulationOptions.decisionHook` callback is added (`packages/engine/src/sim/sim-options.ts`). The hook receives every `DecisionLog` (including `probeHoleRecovery` events) for diagnostic consumption; it does not affect execution.

This change eliminates the 1049 divergence class entirely: under the new harness, direct `runGame` and the diagnostic are bit-identical.

### D7 — Foundation #18 amendment

Replace the existing F#18 in `docs/FOUNDATIONS.md`:

> **18. Constructibility Is Part of Legality**
>
> A move is not legal for clients unless it is constructible under the kernel's bounded deterministic rules protocol. Existence without a construction artifact is insufficient. No client-side search, no template completion, no satisfiability verdict distinct from publication, no `unknown` legal actions.
>
> *Publication contract*: Every kernel-published legal action is constructible atomically at its microturn scope. The publication probe verifies constructibility by inspecting the candidate's resulting next decision to a bounded depth (`MICROTURN_PROBE_DEPTH_BUDGET`); a candidate is not published unless its next decision terminates, auto-resolves, or has ≥ 1 legal option at each level within the budget.
>
> *Runtime safety net*: For residual probe gaps — state-dependent branches deeper than the budget, or future bugs — the kernel MUST roll back deterministically to the nearest `actionSelection` frame, blacklist the offending action for the current `(turnId, seatId)`, reconcile ready blocking free-operation grants for that seat, and re-publish. Rollback is an observable trace event (`ProbeHoleRecoveryLog`), not a published contract, and not a `Decision` union variant. If the publication pipeline produces an unbridgeable decision at apply time, that is a kernel bug and SHOULD be closed by deepening the probe.
>
> The microturn publication pipeline plus the rollback safety net together establish legality and executability; they cannot diverge.

The Appendix clause referring to Spec 139 / Spec 140 is extended with a one-line note:

> Spec 144 amended Foundation #18 to distinguish the published-legality contract from the runtime-recovery safety net, and formalized the engine-agnostic `tags: [pass]` fallback convention.

### D8 — Policy-profile quality witness re-bless

The following tests currently pin decision counts for the ARVN-evolved convergence:

- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` — pins counts for seeds 1020, 1049, 1054.
- Any other `policy-profile-quality` test pinning decision counts on the campaign corpus (audit during implementation).

Re-bless protocol per `.claude/rules/testing.md` (distillation over re-bless):

1. First attempt: reformulate each count-based assertion as an architectural invariant (e.g., "stopReason ∈ {terminal, maxTurns}", "winner seat ∈ declared seats"). Where possible, promote to `@test-class: architectural-invariant`.
2. If the test genuinely witnesses a specific trajectory (e.g., ARVN wins on seed 1020 with this profile), retarget it to the new decision count; keep it at `@test-class: convergence-witness` and document the re-bless reason in the commit body per the distillation protocol.

### D9 — New test files

- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` (`@test-class: architectural-invariant`)
  - For live choice continuations (`chooseOne`, `chooseN`, `chooseNStep`, terminal): crafted fixtures asserting the probe correctly returns bridgeable/unbridgeable. Zero-option frames produce unbridgeable verdicts. Stochastic continuations remain covered by `publish.ts`'s existing distribution handling.
  - Purity: same `(state, request)` → same verdict across repeated invocations.
  - Budget: `K=0` returns `bridgeable` (optimistic).
- `packages/engine/test/unit/kernel/microturn/rollback.test.ts` (`@test-class: architectural-invariant`)
  - `rollbackToActionSelection` correctly pops to nearest `actionSelection` frame.
  - Blacklist persists for the current turn and clears on turn retirement.
  - `null` return when no `actionSelection` frame exists.
  - Pass fallback: synthetic GameDef with `tags: [pass]` action publishes pass when all actions blacklisted.
  - Pass fallback absence: synthetic GameDef without pass action returns `null` → simulator reaches `noLegalMoves` (documented).
- `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts` (`@test-class: convergence-witness`, witness id `spec-144-seed-1001-nva-march`)
  - Loads the seed-1001 fixture from I4. Asserts `stopReason === 'terminal'`, `recoveredFromProbeHole === 0` (probe catches it, rollback does not fire).
- `packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts` (`@test-class: architectural-invariant`)
  - Synthetic GameDef crafted so probe at `K=3` cannot detect a dead end (the dead-end decision lives at depth 4). Asserts `stopReason === 'terminal'`, `recoveredFromProbeHole >= 1`.
- `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (`@test-class: architectural-invariant`)
  - Replays a trace containing `probeHoleRecovery` events; asserts byte-identical `finalState.stateHash` and identical `decisions[]` ordering.

### D10 — Affected files (migration inventory)

New files:
- `packages/engine/src/kernel/microturn/probe.ts` — deep probe core (D2).
- `packages/engine/src/kernel/microturn/rollback.ts` — rollback + `ProbeHoleRecoveryLog` type (D4).
- `packages/engine/src/shared/lru-cache.ts` — minimal generic LRU used by D3.
- `packages/engine/test/unit/shared/lru-cache.test.ts` — LRU unit tests.
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
- `packages/engine/test/unit/kernel/microturn/rollback.test.ts`
- `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts`
- `packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts`
- `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts`
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/` (fixture bundle)
- `campaigns/phase4-probe-recover/depth-audit.md` (I1 artifact)
- `campaigns/phase4-probe-recover/memoization-measurement.md` (I2 artifact)
- `campaigns/phase4-probe-recover/pass-action-audit.md` (I3 artifact)

Modified files (source):
- `packages/engine/src/kernel/microturn/publish.ts` — deepened probe; calls `probe.ts`.
- `packages/engine/src/kernel/gamedef-runtime.ts` — adds `publicationProbeCache` field + factory wiring.
- `packages/engine/src/kernel/types-core.ts` — extends `GameState` (optional `unavailableActionsPerTurn`) and `GameTrace` (`probeHoleRecoveries`, `recoveredFromProbeHole`). `DecisionLog` and the `Decision` union are NOT modified.
- `packages/engine/src/sim/simulator.ts` — rollback integration + maintains a parallel `probeHoleRecoveries` array.
- `packages/engine/src/sim/sim-options.ts` — adds optional `decisionHook`.
- `packages/engine/src/sim/compound-turns.ts` — no change to input shape (recoveries live outside `decisions[]`), but a one-line note may be warranted.
- `packages/engine/schemas/Trace.schema.json` — adds `ProbeHoleRecoveryLog` schema as a sibling of `DecisionLogSchema` plus the new `probeHoleRecoveries` / `recoveredFromProbeHole` fields on the trace schema. `DecisionLog` schema itself unchanged.
- `docs/FOUNDATIONS.md` — F#18 amendment + Appendix addendum.
- `docs/architecture.md` — one-paragraph note on the probe/rollback pairing.
- `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` — route through `runGame` (D6).

Modified files (tests — `GameTrace` construction-site migration for the non-optional `probeHoleRecoveries` and `recoveredFromProbeHole` fields):
- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` — re-bless per D8.
- `packages/engine/test/unit/serde.test.ts` — `GameTrace` literal fixture.
- `packages/engine/test/unit/schemas-top-level.test.ts` — `validGameTrace` literal.
- `packages/engine/test/unit/trace-enrichment.test.ts` — `makeMockTrace` helper (two sites).
- `packages/engine/test/unit/json-schema.test.ts` — `validRuntimeTrace` literal.
- `packages/engine/test/unit/sim/trace-eval.test.ts` — trace factory.
- `packages/engine/test/unit/sim/eval-report.test.ts` — trace factory.

Deleted files: none (spec does not retire any existing machinery).

## Edge Cases

- **Free-operation grants outstanding after rollback.** Free-operation grants live in `state.turnOrderState.pendingFreeOperationGrants` (`TurnFlowRuntimeState`). If the rollback pops past a `freeOperation: true` action's scope, the outstanding grant remains pending in that field. FITL's `pass` action is declared today with `effects: []` (no grant clearing). I3 decides among three paths: (a) extend FITL's `pass` action with explicit grant-terminator effects; (b) have the engine's rollback also emit a grant-clearing effect at pop time; (c) confirm the grant harmlessly expires at turn retirement. D4 is worded neutrally until I3 lands.

- **Rollback across compound action + special activity.** If the offending action is a compound `{ actionId: march, compound: { specialActivity: ambush } }`, both halves unwind together. The rollback walks up to the root `actionSelection` frame, not an intermediate `specialActivity` frame.

- **Rollback during an event-driven sub-microturn.** Events that push their own microturns (e.g., event card-59's free-march grant) are rolled back along with the parent. The event's text that "can be implemented" has already been implemented pre-microturn; the part that can't is skipped via §5.1.3 (rules-authored behavior, not engine behavior).

- **Probe depth exceeded on a pathological spec.** A malicious/malformed GameDef with deeply nested `chooseN` chains (depth > 3) where every leaf is a dead end would exhaust the probe budget on every candidate and rely on rollback for every turn. Detectable via high `recoveredFromProbeHole` counts in telemetry; diagnostic message includes the action pipeline path so the game author can fix it.

- **Agent-RNG reuse after rollback.** When the simulator re-publishes post-rollback, it re-invokes `agent.chooseDecision` on the new microturn with the *same* `agentRng` snapshot as the original call would have used. Ensures determinism under replay. The agent's `.rng` output is still advanced exactly once per decision applied (the rolled-back decision is treated as a non-event for agent RNG accounting).

- **Nested rollback within a single turn.** If the first rollback leads to a second unbridgeable action, the process repeats. Bound: no more than `|actions|` rollbacks per turn (once all actions are blacklisted, the pass fallback fires). Turns remain bounded.

- **`stopReason: 'noLegalMoves'` becomes rare.** Only reachable if rollback cannot identify a new action-selection recovery path, or if the nearest action-selection action is already blacklisted and no pass fallback is declared. Under spec 140, a missing action-selection frame should be impossible for any game that starts from `initialState`; under FITL's spec, pass fallback absence is not the case. So `noLegalMoves` becomes a game-spec quality signal: if it fires, the game spec has a genuine structural bug.

## Testing Strategy

Coverage matrix (in addition to the new test files in D9):

| Invariant | Test file | Class |
|---|---|---|
| Deep probe rejects zero-option continuations | `deep-probe.test.ts` | architectural-invariant |
| Rollback is deterministic across replay | `probe-hole-recovery-replay-identity.test.ts` | architectural-invariant |
| Blacklist clears at turn retirement | `rollback.test.ts` | architectural-invariant |
| Pass fallback lookup is engine-agnostic | `rollback.test.ts` (synthetic GameDef) | architectural-invariant |
| Seed 1001 reaches terminal under direct runGame | `fitl-march-dead-end-recovery.test.ts` | convergence-witness |
| Post-1049-harness-fix: direct vs stepwise agreement | new diagnostic smoke test | architectural-invariant |
| ARVN-evolved convergence on seeds 1020/1049/1054 | `fitl-variant-arvn-evolved-convergence.test.ts` (re-blessed) | convergence-witness |

## Foundations Alignment

| Foundation | How the spec respects it |
|---|---|
| **F#1 Engine Agnosticism** | Probe reads only DSL AST; rollback uses generic `tags: [pass]` lookup. No FITL/Texas/Asymmetric game branches. |
| **F#2 Evolution-First Design** | GameDef YAML unchanged; existing evolution pipeline unaffected. |
| **F#3 Visual Separation** | `visual-config.yaml` contract unchanged. |
| **F#4 Authoritative State** | Rollback state is kernel-owned; no client-visible change to hidden-info contract. |
| **F#5 One Rules Protocol** | `publishMicroturn` remains the single source of legal actions; rollback loops back through it. |
| **F#6 Schema Ownership Stays Generic** | No new per-game schema. |
| **F#7 Specs Are Data** | No new executable-code surfaces. |
| **F#8 Determinism** | Probe is pure; rollback is a deterministic function of `(state, offendingAction)`; replay-identity test proves it. |
| **F#9 Replay, Telemetry, Auditability** | New `ProbeHoleRecoveryLog` event is structured and replay-faithful; `recoveredFromProbeHole` counter enables campaign-level telemetry. |
| **F#10 Bounded Computation** | Probe depth bounded (`K=3`); rollback stack-depth bounded by game state; LRU cache bounded. |
| **F#11 Immutability** | All new code uses new-object returns; no mutation. |
| **F#12 Compiler/Kernel Boundary** | No compiler change; probe is a kernel-runtime check. |
| **F#13 Artifact Identity** | GameDef hash unchanged; traces containing new events carry the same identity keys. |
| **F#14 No Backwards Compatibility** | Convergence witnesses re-blessed in same change; no compatibility shim. |
| **F#15 Architectural Completeness** | Root cause (shallow probe) fixed; safety net covers residual class; no workaround. |
| **F#16 Testing as Proof** | Each invariant listed in Testing Strategy has a test. |
| **F#17 Strongly Typed Identifiers** | New types use branded `TurnId`, `ActionId`, `SeatId`. |
| **F#18 Constructibility Is Part of Legality** | Amended by this spec (D7) to distinguish published contract from safety net. |
| **F#19 Decision-Granularity Uniformity** | Preserved. `ProbeHoleRecoveryLog` is trace-only — stored in its own `GameTrace.probeHoleRecoveries` array, NOT appended to `GameTrace.decisions[]`, and NOT a `Decision` union variant. The microturn decision stream remains six kinds (`actionSelection`, `chooseOne`, `chooseNStep`, `stochasticResolve`, `outcomeGrantResolve`, `turnRetirement`). |

## Migration Waves

Ticket sequence (prefix `144PROBEREC-`):

1. **144PROBEREC-001 — Minimal LRU + deep probe + memoization cache.** Implements `packages/engine/src/shared/lru-cache.ts` + unit tests, `probe.ts`, extends `GameDefRuntime` with `publicationProbeCache`, rewires `publish.ts` to call the new probe. Adds `deep-probe.test.ts`. Depends on I1 & I2 artifacts landing first.

2. **144PROBEREC-002 — Rollback safety net + blacklist state + trace event + test-fixture migration.** Implements `rollback.ts`, extends `GameState` (`unavailableActionsPerTurn`) and `GameTrace` (`probeHoleRecoveries`, `recoveredFromProbeHole` — both non-optional per F#14). Rewires `simulator.ts` (including the parallel `probeHoleRecoveries` accumulator). Migrates all seven `GameTrace` construction sites listed in D10 (one source, six test fixtures). Adds `rollback.test.ts` and the synthetic `fitl-probe-hole-rollback-safety-net.test.ts`. Depends on I3 artifact.

3. **144PROBEREC-003 — F#18 amendment + convergence-witness re-bless + seed-1001 regression test.** Updates `docs/FOUNDATIONS.md`, `docs/architecture.md`, re-blesses `fitl-variant-arvn-evolved-convergence.test.ts`, adds `fitl-march-dead-end-recovery.test.ts` using the I4 fixture. Depends on 001 + 002 + I4.

4. **144PROBEREC-004 — Diagnostic harness rewire (seed 1049 divergence fix).** Adds `SimulationOptions.decisionHook`, rewrites `diagnose-nolegalmoves.mjs` to route through `runGame` — closing the `state.activePlayer` vs `resolvePlayerIndexForSeat(microturn.seatId)` gap (see D6). Adds smoke test asserting direct-vs-diagnostic parity. Can land in parallel with 003.

5. **144PROBEREC-005 — Determinism replay-identity proof.** Adds `probe-hole-recovery-replay-identity.test.ts`; ticket 002 absorbed the `Trace.schema.json` extension because the live focused test lane requires `schema:artifacts:check`. Depends on 002.

Estimated complexity per ticket: S–M each (one day of focused implementation + test).

## Outcome (to be filled on completion)

- Completed: _pending_
- Deviations: _pending_
- Verification:
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo schema:artifacts`
  - Full 18-seed campaign rerun with post-spec engine: `stopReason === 'terminal'` for all seeds (including 1001), `recoveredFromProbeHole === 0` for all seeds (probe catches everything).
  - `grep -rn "isSupportedChoiceRequest" packages/engine/src/` — only the internal probe uses it (or the call site is deleted).

## Future Work

- **MCTS / tree-search agent** (carried over from spec 140 future work): the deeper probe makes search-guided agents more reliable because speculative rollouts operate on the same constructibility contract as the publication path.
- **Adaptive probe depth**: if telemetry shows certain games consistently need `K=4` or `K=5`, the depth could become per-game-spec configurable under the generic `gameMetadata.probeDepth` field.
- **Probe-gap closure automation**: when `recoveredFromProbeHole > 0` in a CI run, automatically generate a minimal failing fixture and open a ticket. The existing `distillation-over-re-bless` protocol handles the resulting test distinctions.

## Tickets

- `archive/tickets/144PROBEREC-001.md` — Deep probe + minimal LRU + memoization cache (I1/I2)
- `archive/tickets/144PROBEREC-002.md` — Rollback safety net + blacklist state + GameTrace migration (I3)
- `tickets/144PROBEREC-003.md` — F#18 amendment + seed-1001 regression fixture (I4) + convergence-witness re-bless
- `tickets/144PROBEREC-004.md` — Diagnostic harness rewire + `SimulationOptions.decisionHook` (seed 1049)
- `tickets/144PROBEREC-005.md` — Determinism replay-identity proof
