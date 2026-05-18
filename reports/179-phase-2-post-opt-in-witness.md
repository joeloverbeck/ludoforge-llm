# Spec 179 Phase 2 — Post-Opt-In FITL ARVN Witness

**Status**: RED — blocked on witness contract reset.
**Date**: 2026-05-17
**Repo HEAD**: `e3a7eb4647d0d8ba3b5c6ff8b4307bbd9496cebb`
**Profile source baseline commit**: `data/games/fire-in-the-lake/92-agents.md` last committed at `4415d65a4f7828a66c0df65d1c2f3ecb69b57763`
**Profile state measured**: working tree with `arvn-evolved.preview.outcomeGrantContinuation.enabled=true`, `extraDepthCap=4`, `capClass=postGrant16`, plus permanent `penalizeOpponentMargin` and supporting opponent-margin features.

## Commands

```bash
/usr/bin/time -f WALL_TIME_SECONDS=%e node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs /tmp/179ACTSELPRE-005-red-witness-traces
node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs /tmp/179ACTSELPRE-005-red-witness-traces
```

Raw traces are ignored ephemeral evidence. The 15-seed red witness trace set was preserved at `/tmp/179ACTSELPRE-005-red-witness-traces` during implementation.

## Run Summary

Baseline: `reports/179-phase-0-pre-opt-in-baseline.md`.

| Metric | Phase 0 baseline | Phase 2 post-opt-in | Delta | Gate |
|---|---:|---:|---:|---|
| Wall time | 53.16s | 54.88s | +1.72s / +3.24% | PASS (<= 5%) |
| Completed seeds | 15 / 15 | 15 / 15 | 0 | PASS |
| Composite score | -3.2 | -3.2 | 0 | diagnostic |
| Average margin | -5.2 | -5.2 | 0 | diagnostic |
| Win rate | 0.2 | 0.2 | 0 | diagnostic |

Last-line JSON:

```json
{"compositeScore":-3.2,"avgMargin":-5.2,"winRate":0.2,"wins":3,"completed":15,"truncated":0,"errors":0,"seeds":15,"playerCount":4,"evolvedSeat":"arvn","evolvedProfile":"arvn-evolved","maxTurns":500,"concurrency":8,"profileCompletionOverride":null,"wasmEnabled":true,"gamedefCacheHit":false,"decisionBreakdown":{"strategic":72.8,"tactical":17.8667,"strategicAvgGap":-24.6337,"tacticalAvgGap":88.0597,"tiedDecisions":81.6667,"totalDecisions":90.6667}}
```

## Action Distribution

Main-phase action-selection distribution across 159 decisions:

| Action | Count | Percent |
|---|---:|---:|
| Govern | 119 | 74.8% |
| Train | 23 | 14.5% |
| Event | 10 | 6.3% |
| Transport | 6 | 3.8% |
| Resolve Honolulu Pacify | 1 | 0.6% |
| Patrol | 0 | 0.0% |
| Sweep | 0 | 0.0% |
| Assault | 0 | 0.0% |

The diagnostic also reported 268 coup-phase forced decisions and 933 microturn decisions.

## Ready Ref Stats

```text
traces: 15
mainPhaseActionSelectionDecisions: 159
decisionsWithReadyRefStats: 159

| Preview ref | Decisions reporting stats | Ready / candidate ratio | Decisions with distinct=1 (uniform) | Decisions with distinct>1 (differentiating) | Avg range |
|---|---:|---:|---:|---:|---:|
| `preview.victoryCurrentMargin.currentMargin` | 13 / 159 (8.2%) | 83.3% | 13 (100.0%) | 0 (0.0%) | 0.00 |
| `preview.victoryCurrentRank.currentRank` | 13 / 159 (8.2%) | 83.3% | 12 (92.3%) | 1 (7.7%) | 0.08 |
| `victoryCurrentMargin.currentMargin.nva` | 146 / 159 (91.8%) | 93.2% | 146 (100.0%) | 0 (0.0%) | 0.00 |
| `victoryCurrentMargin.currentMargin.self` | 146 / 159 (91.8%) | 93.2% | 100 (68.5%) | 46 (31.5%) | 0.81 |
| `victoryCurrentMargin.currentMargin.vc` | 146 / 159 (91.8%) | 93.2% | 130 (89.0%) | 16 (11.0%) | 0.32 |
| `victoryCurrentRank.currentRank.self` | 146 / 159 (91.8%) | 93.2% | 134 (91.8%) | 12 (8.2%) | 0.10 |
```

## Trace Surface Verification

`previewUsage.outcomeGrantContinuation` was present and enabled in every main-phase action-selection decision, but no candidate entered post-grant continuation:

```json
{
  "traces": 15,
  "decisions": 159,
  "withBlock": 159,
  "enabledBlocks": 159,
  "extraDepthReached": 0,
  "exitCounts": {
    "completed": 0,
    "postGrantCap": 0,
    "stochastic": 0
  },
  "featureStats": {}
}
```

Additional TS-only probes also produced zero continuation counts:

- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm`
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm --profile-completion arvn-evolved=agentGuided`

Both probes showed the opt-in block present with `exitCounts.completed=0`, `postGrantCap=0`, and `stochastic=0`. This classifies the red witness as not merely WASM-route masking.

## Acceptance Verdict

| Gate | Result | Verdict |
|---|---|---|
| `currentMargin.nva` differentiates on >= 50% of reporting decisions | 0 / 146 (0.0%), avg range 0.00 | FAIL |
| `currentMargin.vc` differentiates on >= 50% of reporting decisions | 16 / 146 (11.0%), avg range 0.32 | FAIL |
| Avg range >= 0.5 for both opponent refs | NVA 0.00, VC 0.32 | FAIL |
| Slow-tier wall-time regression <= 5% | +3.24% | PASS |
| `previewUsage.outcomeGrantContinuation` non-zero exit counts | all exit counts 0 | FAIL |

## Adjacent Findings

- No `preview.feature.vcGuerrillaCount`, `preview.feature.vcBaseCount`, or `preview.feature.vcFriendlyCapCount` ready-ref rows were emitted by this profile configuration, so the optional feature-lift spot check could not be evaluated from the 005 witness.
- A sampled ARVN `assault` candidate in the TS-only probe completed at preview depth 2 after one `chooseOne` synthetic decision and did not reach `outcomeGrantResolve`; its opponent-margin refs stayed ready but uniform. Ticket 007 later classified this as a witness contract mismatch rather than a profile-weight or WASM-route activation problem.

## 007 Contract Reassessment

Ticket 007 reopened the activation gap against `docs/FOUNDATIONS.md` and the live one-rules-protocol contract. The important finding is that this Phase 2 witness targets ordinary FITL ARVN operation candidates, while `outcomeGrantResolve` is the resolver for pending free-operation grants. The current witness therefore does not exercise the frame type that Spec 179 extended.

Fresh bounded probes on 2026-05-17:

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm
```

The saved trace contained no `outcomeGrantResolve` moves:

```json
{
  "actionSelection": 20,
  "chooseNStep": 12,
  "chooseOne": 25,
  "outcomeGrantResolve": 0
}
```

A temporary profile trial that heavily weighted ARVN `assault` caused the one-seed witness to choose `assault` on 4 / 5 main-phase action-selection decisions, but `previewUsage.outcomeGrantContinuation.exitCounts` still remained zero. That rules out simple action-mix starvation: ordinary operation action resolution does not publish `outcomeGrantResolve`.

Kernel and FITL contract anchors:

- `packages/engine/src/kernel/microturn/publish.ts` publishes `outcomeGrantResolve` from an `OutcomeGrantResolveContext`.
- `packages/engine/src/kernel/microturn/apply.ts` applies an `outcomeGrantResolve` decision only when `turnOrderState.runtime.pendingFreeOperationGrants` contains the grant.
- `packages/engine/src/kernel/effects-turn-flow.ts` appends pending grants from `grantFreeOperation` / event free-operation grant flow.
- `data/games/fire-in-the-lake/30-rules-actions.md` declares ordinary `train`, `patrol`, `sweep`, `assault`, `rally`, `march`, `attack`, and `terror` actions as main-phase operations; `freeOperationActionIds` makes those actions grantable by event/free-operation flow, but does not make ordinary operation candidates publish grant-resolution frames.

The ticket therefore stopped as blocked rather than changing engine/profile code. The user approved a bounded reset/discovery path; `archive/tickets/179ACTSELPRE-008.md` later completed that reset and selected the deferral path because no usable production event/free-operation-grant witness exists.

## 008 Reset Verdict

Ticket 008 reran the bounded production probes and did not find a usable FITL event/free-operation replacement witness for Spec 179's `outcomeGrantResolve` opt-in.

Fresh bounded probes on 2026-05-17:

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --trace-default all --concurrency 1 --no-wasm
node --input-type=module -e "<production card-46 shaded event/free-operation probe>"
```

The one-seed TS FITL trace still contained zero evolved-player `outcomeGrantResolve` moves and zero post-grant continuation exits:

```json
{
  "actionSelection": 20,
  "chooseNStep": 12,
  "chooseOne": 25,
  "outcomeGrantResolve": 0,
  "outcomeGrantContinuationExitCounts": {
    "completed": 0,
    "postGrantCap": 0,
    "stochastic": 0
  }
}
```

The production card-46 shaded probe used the existing FITL free-operation event path. It published a root `actionSelection` event candidate, applied that event, and verified that the event issued a pending free-operation grant:

```json
{
  "eventCandidate": "card-46 shaded",
  "pendingFreeOperationGrant": {
    "seat": "nva",
    "actionIds": ["infiltrate"],
    "phase": "ready",
    "remainingUses": 1
  },
  "previewUsage.outcomeGrantContinuation.exitCounts": {
    "completed": 0,
    "postGrantCap": 0,
    "stochastic": 0
  },
  "eventCandidatePreviewDrive": {
    "kind": "completed",
    "depth": 1,
    "syntheticDecisions": []
  }
}
```

That classifies the live FITL event/free-operation path as `no usable replacement witness found`, not `usable witness found`. Event declarations and `grantFreeOperation` do create pending free-operation grants, but the production path exposes those grants as free-operation `actionSelection` moves rather than an `outcomeGrantResolve` frame that the Spec 179 opt-in can continue through. A source sweep found no production builder for `OutcomeGrantResolveContext`; the only concrete constructed `outcomeGrantResolve` frame in the repo is the synthetic architecture fixture at `packages/engine/test/architecture/preview-post-grant/post-grant-fixture.ts`.

No generic engine defect was fixed under ticket 008 because the bounded production probe proved a contract mismatch, not a failing generic `outcomeGrantResolve` behavior. The generic synthetic architecture test still proves the opt-in substrate when such a frame exists; current production FITL does not provide a closing witness for that frame type.

## Follow-Up Owner

`archive/tickets/179ACTSELPRE-008.md` completed the Phase 2 witness contract reset. No valid replacement witness exists in the current FITL event/free-operation path, so Spec 179 remains deferred. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180's bounded standing-projection route as the ordinary-operation successor; implementation started with the focused failing witness now archived at `archive/tickets/180STDVECOBSROL-001.md`. Spec 180 completed the replacement surface, and tickets 005, 006, and 007 are now archived.
