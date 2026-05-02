# Auto-Resolve Cascade Investigation — Phase 1 (AUTORESCASC-001)

**Date**: 2026-04-28
**Branch**: `implemented-147` (post-LIFECYCFIX-001 at `8ca1df07`)
**Status**: Phase 1 diagnostic complete; **the ticket's core mechanism does not reproduce** in current code. See "Findings" and "Recommendation" below.

---

## Scope

Phase 1 of `tickets/AUTORESCASC-001-investigate-and-bound-auto-resolve-cascade.md`: identify the exact predicate that pushes `turnRetirement` decisions onto the decision stack such that `advanceAutoresolvable` cascades through them, processing the entire FITL deck without surfacing a player decision.

The Phase Gates clause requires Phase 1 sign-off before any code change in Phase 2.

## Methodology

1. Read `packages/engine/src/kernel/microturn/{advance,apply,publish,types,drive}.ts`, `phase-advance.ts`, `turn-flow-eligibility.ts`, `turn-flow-lifecycle.ts`, `apply-move.ts`, and `sim/simulator.ts`.
2. Searched for every production-code construction site of `TurnRetirementContext` — the frame the autoresolve loop must see on top of `decisionStack` to fire its `turnRetirement` branch.
3. Built a custom probe (`/tmp/probe-cascade.mjs`) that runs `runGame` at `seed=42`, all 4 baseline FITL profiles, with `traceRetention='full'`, captures full `decisionLogs`, and analyzes:
   - longest contiguous `turnRetirement` chain
   - first player vs first auto-resolved decision indices
   - kind histogram across the trace
   - terminal stop reason and zone counts
4. Cross-checked the ticket's original evidence ("`decisionLogs.length = 0`") by varying `traceRetention`.

## Findings

### 1. No production code path constructs a `TurnRetirementContext`

`grep -rn "turnRetirement" packages/engine/src` shows that the literal `kind: 'turnRetirement'` appears only in:

- `microturn/advance.ts:48` — constructing a **Decision** to apply (consumes a context already on the stack).
- `microturn/publish.ts:360, 773` — translating an existing **TurnRetirementContext frame** into a published microturn (consumes a context already on the stack).
- `microturn/types.ts`, `schemas-core.ts` — type/schema declarations.
- `microturn/apply.ts:208, 764`, `microturn/drive.ts:629` — applying a `turnRetirement` Decision (consumes the decision being applied).

There is **no construction site** in the kernel, simulator, compiler, eligibility module, phase-advance, or turn-flow-lifecycle that pushes a `TurnRetirementContext` onto `state.decisionStack`. The `dist/test/**` directory contains synthetic constructions in unit tests (`atomic-legal-actions.test.js`, `rollback.test.js`, `microturn-publication.test.js`), but none of those are reachable from `runGame`.

This means the `turnRetirement` branch of `isAutoresolvableKind` (`microturn/advance.ts:7-8`) is **dead code on the simulator pipeline**. `advanceAutoresolvable` cannot cascade through `turnRetirement` decisions because none ever reach the decision stack from `runGame`.

### 2. The simulator pipeline is `applyMove → advanceToDecisionPoint`, not `advanceAutoresolvable → turnRetirement`

The actual mechanism that pumps phases (and historically drained the deck via `applyTurnFlowCardBoundary`) is:

```
simulator main loop
  └─ applyPublishedDecisionFromCanonicalState
       └─ applyMove
            └─ advanceToDecisionPoint  (phase-advance.ts:653)
                 └─ while (terminal == null):
                      ├─ legalMoves(state) → if any, break
                      ├─ expireBlockingPendingFreeOperationGrants
                      ├─ coupPhaseImplicitPass
                      └─ advancePhase           ← consumes 1 card per `isLastPhase` call
```

`advanceToDecisionPoint` is bounded by `maxAutoAdvancesPerMove = 2 * playerCount * totalPhaseCount + 1` (≈ 105 for FITL). It cannot consume an entire deck on its own; it would throw `DECISION_POINT_STALL_LOOP_DETECTED` first. The pre-LIFECYCFIX-001 deck-drain symptom came from the **silent deletion** in `applyTurnFlowCardBoundary` combined with this loop, not from a `turnRetirement` cascade in `advanceAutoresolvable`.

### 3. Probe results post-LIFECYCFIX-001 contradict the ticket's evidence

Running `seed=42, profilesAll, maxTurns=1, traceRetention='full'`:

```
[probe-summary] stopReason=maxTurns turnsCount=1 decisions.length=159
[probe-summary] kindHistogram={"actionSelection":65,"chooseNStep":44,"chooseOne":50}
[probe-summary] longestTurnRetirementChain=0 startsAt=-1 len=0
[probe-summary] firstPlayerDecisionIdx=0
[probe-summary] firstAutoresolvedDecisionIdx=-1
[probe-final-state] played=12 deck=64 lookahead=1 leader=5
```

- **159 player decisions** are recorded — not zero.
- **No `turnRetirement` decisions whatsoever** in the trace (`longestTurnRetirementChain = 0`).
- **No `stochasticResolve` or `outcomeGrantResolve` decisions** in this slice (`firstAutoresolvedDecisionIdx = -1`).
- **Cards accumulate correctly**: `played=12, deck=64, lookahead=1, leader=5` (total 82, plus the 5 in leader from coup hand-offs = 87 cards visible; combined with hand zones / setup the multiset is conserved per LIFECYCFIX-001).

### 4. The original "`decisionLogs.length = 0`" evidence is an instrumentation artifact

When the same probe runs with `traceRetention: 'fullTraceWithFinalState'` (instead of `'full'`), `simulator.ts:301` returns `decisions: []` because `shouldRetainTrace = traceRetention === 'full'`. The trace's `decisions` field is empty even though the simulator did publish many microturns and apply many decisions internally.

The ticket's quoted figure ("decisionLogs.length = 0") almost certainly came from a probe that did not pass `traceRetention: 'full'`. The simulator's main loop is in fact making and recording the exact player decisions the ticket says are missing.

### 5. The cascade premise is mechanistically impossible in current code

For `advanceAutoresolvable` to cascade through `turnRetirement` events, every iteration would need a `TurnRetirementContext` on top of `state.decisionStack`. After applying the first one (`microturn/apply.ts:764-786`), `decisionStack` is set to `[]` (line 777) and the next iteration's `top` is `undefined`, terminating the loop. So even if a `turnRetirement` context were pushed once, the loop would process it once and exit — not cascade through 67 cards.

## Evidence Classification

Per the implement-ticket workflow's evidence rubric:

- **Incidence verified?** No. The current build (post-LIFECYCFIX-001) does not produce `decisionLogs.length = 0`; it produces 159 player decisions for the same `seed=42, maxTurns=1` slice. The cited symptom does not reproduce.
- **Mechanism verified?** No. There is no production code path that constructs a `TurnRetirementContext` frame, so the autoresolve loop's `turnRetirement` branch is unreachable from `runGame`.
- **Root cause of historical symptom?** The pre-LIFECYCFIX-001 "deck pumped without decisions" effect was the **silent card deletion** in `applyTurnFlowCardBoundary` plus `advanceToDecisionPoint`'s phase-pumping. LIFECYCFIX-001 (`turn-flow-lifecycle.ts`, landed 2026-04-28) made cards accumulate in `played:none`, eliminating the symptom.

## Cross-checks

- **Probe seed=42 maxTurns=1**: 159 decisions, 0 turnRetirement, cards accumulate.
- **Code search**: confirmed no production-code construction of `TurnRetirementContext` (sibling test files have synthetic constructions only).
- **LIFECYCFIX-001 outcome section** explicitly states: "AUTORESCASC-001: The auto-resolve cascade that pumps the entire deck through the lifecycle in one chain remains owned by AUTORESCASC-001. This ticket fixes the per-card deletion mechanism only." — yet the per-card deletion mechanism IS the chain that pumped the deck. The "remaining" cascade described in AUTORESCASC-001 has no separate mechanism in the current code.

## Recommendation

Apply the **1-3-1 rule** (CLAUDE.md, "Already-satisfied deliverable" branch of implement-ticket).

### Problem

AUTORESCASC-001 claims a cascade in `advanceAutoresolvable` that processes `turnRetirement` events to drain the deck without player decisions. After LIFECYCFIX-001 lands and after careful code reassessment, that mechanism does not exist in production code paths and the cited symptom does not reproduce.

### Three options

**Option 1 — Close as already-satisfied; archive the ticket; rely on LIFECYCREG-001 for the regression net.** (Recommended.)
- Pros: matches the evidence (mechanism doesn't exist; symptom doesn't reproduce post-LIFECYCFIX-001). Avoids implementing fixes for a phantom bug. Keeps repo coherent — the underlying real bug (card deletion) has been fixed; LIFECYCREG-001 already owns architectural-invariant regression coverage including the "decision-per-card invariant" that would catch any future analog of this class. Removes a stale ticket from the active queue.
- Cons: any genuine cascade trigger that exists at higher seed/turn slices would not be exhaustively swept by Phase 1 (probe ran only `seed=42, maxTurns=1`). Mitigation: LIFECYCREG-001's `decision-per-card-presence.test.ts` will run 50-seed × 30-turn property sweeps and would catch a future regression.
- Repository deliverables: write this Phase 1 report (done), update AUTORESCASC-001's status to COMPLETED with a "no code changes — already-satisfied" Outcome section that cites this report, archive the ticket. **No engine code changes.**

**Option 2 — Rewrite the ticket to a small dead-code cleanup.** Remove the `turnRetirement` branch from `microturn/advance.ts:isAutoresolvableKind` (and the corresponding apply branch in `microturn/apply.ts`/`drive.ts`) since they're unreachable from `runGame`. Tighten `MAX_AUTO_RESOLVE_CHAIN` to a smaller bound documented per the legitimate composition of stochastic + outcome-grant chains.
- Pros: removes ~40 lines of dead code, eliminates Foundation 14 backwards-compat cruft.
- Cons: the dead code is also referenced from synthetic unit tests (`atomic-legal-actions.test.ts`, `rollback.test.ts`, `microturn-publication.test.ts`) that pin the contract for future use. Removing it would also ripple into `schemas-core.ts` (`TurnRetirementContextSchema`, decision-context unions). Risk-reward unfavorable for a speculative cleanup; better deferred until a real driver appears.

**Option 3 — Proceed with the original ticket plan.** Add invariant guards, decision-per-card tests, tighten the chain bound. Substantial test surface for a non-reproducing bug, plus duplicates the architectural-invariant work owned by LIFECYCREG-001 (item 2: "Decision-per-card presence test").
- Pros: nothing tangible — adds defensive layers.
- Cons: violates CLAUDE.md's "Don't add features… beyond what the task requires" and DRY (LIFECYCREG-001 already owns this exact invariant). Costly verification (the property sweep is the slowest part of LIFECYCREG-001) without proportional value.

### Recommendation

**Option 1**. Close AUTORESCASC-001 as already-satisfied. Archive it with this report cited as the Phase 1 deliverable. LIFECYCREG-001 (PENDING) carries the architectural-invariant regression net.

If a future probe at higher seed/turn slices ever reveals a real cascade mechanism, a fresh ticket should be opened with concrete reproduction evidence; AUTORESCASC-001 should not be reopened on speculative grounds.

## Out-of-scope notes

- **MAX_AUTO_RESOLVE_CHAIN tightening (ticket §3 of "Implementation Plan")**: not actionable until a legitimate auto-resolve composition is observed. No probe in this Phase 1 produced any auto-resolved decisions (`firstAutoresolvedDecisionIdx = -1`), so the empirical bound is currently 0. Re-document the constant as a Foundation-10 budget guard, not a design constraint, when a future ticket has data.
- **Trace contract test (ticket §4)**: subsumed by LIFECYCREG-001 item 2 ("Decision-per-card presence test").
- **Dead-code cleanup of `turnRetirement` autoresolve branch**: deferred per Option 2 cons. If revisited later, it should be a separate ticket scoped to the cleanup specifically, with consideration of the synthetic test fixtures.

## Phase 2 disposition

Phase 2 (Implementation) is **not pursued**. The Phase 1 evidence makes the proposed Phase 2 work either unnecessary (cascade doesn't exist) or duplicative (regression net owned by LIFECYCREG-001).

## Probe artifact

The probe script lives at `/tmp/probe-cascade.mjs` (not checked in). It is a small (~140 line) wrapper around `runGame` that captures the fields summarized in §3. Reproducible via:

```bash
pnpm -F @ludoforge/engine build
node /tmp/probe-cascade.mjs --seed 42 --maxTurns 1 --verbose
```

Results above are from a clean run on `8ca1df07`.
