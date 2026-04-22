# FITL ARVN Evolution Seed Report

Date: 2026-04-22

## Scope

I checked the current campaign seed tier, then extended the sweep to the full `1000..1014` range you said is normally used during the ramp-up. I also kept the earlier ARVN-evolved policy-quality witness seeds that previously expected `noLegalMoves`.

- Live campaign seed tier on disk: `campaigns/fitl-arvn-agent-evolution/seed-tier.txt` is currently `1`
- Requested campaign sweep recorded here: `1000..1014`
- Additional witness seeds checked: `1020`, `1049`, `1054`

## Summary

Across the requested `1000..1014` range, two seeds currently end with `noLegalMoves`: `1001` and `1006`.

All other checked seeds in `1000..1014` terminate normally with VC wins.

The current results for the campaign range are:

| Seed | Why checked | Stop reason | Turns | Decisions | Winner | ARVN margin |
| --- | --- | --- | ---: | ---: | --- | ---: |
| 1000 | Current evolution tier | `terminal` | 5 | 547 | `vc` | -3 |
| 1001 | Requested range | `noLegalMoves` | 2 | 251 | - | -15 |
| 1002 | Requested range | `terminal` | 5 | 580 | `vc` | 2 |
| 1003 | Requested range | `terminal` | 4 | 488 | `vc` | -27 |
| 1004 | Requested range | `terminal` | 5 | 592 | `vc` | -16 |
| 1005 | Requested range | `terminal` | 5 | 596 | `vc` | -16 |
| 1006 | Requested range | `noLegalMoves` | 1 | 186 | - | -23 |
| 1007 | Requested range | `terminal` | 5 | 538 | `vc` | -15 |
| 1008 | Requested range | `terminal` | 5 | 518 | `vc` | 4 |
| 1009 | Requested range | `terminal` | 5 | 594 | `vc` | -5 |
| 1010 | Requested range | `terminal` | 5 | 604 | `vc` | -7 |
| 1011 | Requested range | `terminal` | 5 | 571 | `vc` | -20 |
| 1012 | Requested range | `terminal` | 5 | 548 | `vc` | -13 |
| 1013 | Requested range | `terminal` | 5 | 615 | `vc` | -10 |
| 1014 | Requested range | `terminal` | 5 | 547 | `vc` | -15 |

The additional witness-seed results are:

| Seed | Why checked | Stop reason | Turns | Decisions | Winner | ARVN margin |
| --- | --- | --- | ---: | ---: | --- | ---: |
| 1020 | ARVN-evolved witness seed | `terminal` | 5 | 458 | `vc` | -16 |
| 1049 | ARVN-evolved witness seed | `terminal` | 0 | 45 | `vc` | -15 |
| 1054 | ARVN-evolved witness seed | `terminal` | 5 | 543 | `vc` | -7 |

The old convergence-witness expectation that `1049` and `1054` should end in `noLegalMoves` is stale relative to the current codebase:

- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts`
- `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts`

Both tests still expect:

- `1020 -> terminal`
- `1049 -> noLegalMoves`
- `1054 -> noLegalMoves`

But the current direct simulator runs produced terminal VC wins for all three.

## Campaign-range notes

### Seed 1000

- This is the only seed the live evolution harness would use right now.
- It terminates normally.
- Final margins: `us=-11`, `arvn=-3`, `nva=-14`, `vc=6`

### Seed 1001

- Reproduces `noLegalMoves`.
- Final margins at stop: `us=-8`, `arvn=-15`, `nva=-14`, `vc=11`
- The failure happens on NVA's turn at `turnCount=2`.
- The publish step fails with:
  - `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations`
- Last successful player decision before the failure:
  - seat: `nva`
  - decision kind: `chooseNStep`
  - published legal action count: `28`
  - selected stable move key:
    - `chooseNStep:decision:doc.actionPipelines.10.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces:confirm:null`
  - pre-decision snapshot:
    - `turnCount=2`
    - `phaseId=main`
    - `activePlayer=2`
    - seat standings: `us=-8`, `arvn=-15`, `nva=-14`, `vc=11`
    - notable globals: `nvaResources=30`, `aid=12`, `patronage=23`, `trail=4`, `leaderBoxCardCount=3`

### Seed 1006

- Reproduces `noLegalMoves`.
- Final margins at stop: `us=-6`, `arvn=-23`, `nva=-14`, `vc=4`
- The failure happens on NVA's turn at `turnCount=1`.
- The publish step fails with:
  - `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations`
- Last successful player decision before the failure:
  - seat: `nva`
  - decision kind: `chooseNStep`
  - published legal action count: `5`
  - selected stable move key:
    - `chooseNStep:decision:doc.actionPipelines.10.stages[1].effects.0.forEach.effects.0.if.else.0.chooseN::$movingGuerrillas@tay-ninh:none[0]:confirm:null`
  - pre-decision snapshot:
    - `turnCount=1`
    - `phaseId=main`
    - `activePlayer=2`
    - seat standings: `us=-6`, `arvn=-23`, `nva=-14`, `vc=4`
    - notable globals: `nvaResources=32`, `vcResources=3`, `arvnResources=40`, `aid=10`, `patronage=15`, `trail=4`, `leaderBoxCardCount=1`

### Other campaign-range seeds

- `1002`, `1003`, `1004`, `1005`, `1007`, `1008`, `1009`, `1010`, `1011`, `1012`, `1013`, and `1014` all terminated normally with VC wins.
- Only `1002` and `1008` gave ARVN a positive final margin (`2` and `4` respectively), but neither crossed the win threshold before the VC terminal result.

## Witness-seed notes

### Seed 1020

- Still terminates normally, matching the old witness on stop-reason class.
- Final margins: `us=-9`, `arvn=-16`, `nva=-14`, `vc=2`

### Seed 1049

- No `noLegalMoves` reproduction.
- It now terminates immediately on turn `0` with a VC win after `45` microturn decisions.
- Last recorded decision before termination:
  - `playerId=0`
  - decision kind/action: `chooseNStep`
  - published legal action count: `2`
  - pre-decision snapshot: `turnCount=0`, `phaseId=main`, `activePlayer=0`
- Final margins: `us=-12`, `arvn=-15`, `nva=-14`, `vc=1`

### Seed 1054

- No `noLegalMoves` reproduction.
- It terminates normally with a VC win on turn `5`.
- Last recorded decision before termination:
  - `playerId=3`
  - action: `attack`
  - published legal action count: `4`
  - pre-decision snapshot: `turnCount=5`, `phaseId=main`, `activePlayer=3`
- Final margins: `us=-6`, `arvn=-7`, `nva=-15`, `vc=0`

## `noLegalMoves` pattern in the requested range

For the current `1000..1014` sweep, both `noLegalMoves` cases share the same immediate symptom:

- active seat at failure: `nva`
- failure class: `MICROTURN_CONSTRUCTIBILITY_INVARIANT`
- message: `chooseNStep context has no bridgeable continuations`

That is narrower and more useful than the earlier broad concern of "some seeds end in no legal move". In the current codebase, the reproduced failures are specifically NVA-side `chooseNStep` bridgeability failures.

## Tooling status

Two campaign scripts are stale against the current engine/agent APIs:

### `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`

The runner still reads `trace.moves`, but the current simulator returns `trace.decisions`. The live run fails at:

- `run-tournament.mjs:348-354`
- `run-tournament.mjs:373`
- `run-tournament.mjs:389-401`

Observed failure on seed `1000`:

`Seed 1000 error: Cannot read properties of undefined (reading 'filter')`

### `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs`

The diagnostic script still calls `agent.chooseMove(...)`, but the current `PolicyAgent` exposes `chooseDecision(...)`.

Relevant stale call:

- `diagnose-nolegalmoves.mjs:101-105`

Observed failure on both `1049` and `1054`:

`Agent threw at move 0: agent.chooseMove is not a function`

## Practical conclusion

Before resuming `campaigns/fitl-arvn-agent-evolution/*` as-is, the campaign tooling should be updated to the current simulator and agent interfaces. Separately, the old convergence-witness expectations for seeds `1049` and `1054` should be re-baselined, because they no longer describe the current runtime behavior.
