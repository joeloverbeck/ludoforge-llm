# FITL ARVN Evolution Seed Report

Date: 2026-04-23

## Scope

I rebuilt `@ludoforge/engine` from the current tree, reran the live ARVN evolution tournament sweep for `1000..1014`, and reran the ARVN-evolved witness seeds `1020`, `1049`, and `1054`.

- Live campaign seed tier on disk: `campaigns/fitl-arvn-agent-evolution/seed-tier.txt` is currently `1`
- Requested campaign sweep recorded here: `1000..1014`
- Additional witness seeds checked: `1020`, `1049`, `1054`
- Authority for the summary tables below: the current `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` / direct `runGame(...)` path against the rebuilt engine

## Summary

The architectural changes did affect the recorded seed results.

Across the requested `1000..1014` range:

- `1001` still ends with `noLegalMoves`
- `1006` no longer lands as the old `noLegalMoves` witness and now throws a runtime `ILLEGAL_MOVE`
- every other rerun seed in `1000..1014` terminates normally with a VC win

The current results for the campaign range are:

| Seed | Why checked | Stop reason | Turns | Decisions | Winner | ARVN margin |
| --- | --- | --- | ---: | ---: | --- | ---: |
| 1000 | Current evolution tier | `terminal` | 5 | 524 | `vc` | -3 |
| 1001 | Requested range | `noLegalMoves` | 2 | 245 | - | -15 |
| 1002 | Requested range | `terminal` | 5 | 572 | `vc` | 2 |
| 1003 | Requested range | `terminal` | 4 | 482 | `vc` | -27 |
| 1004 | Requested range | `terminal` | 5 | 575 | `vc` | -16 |
| 1005 | Requested range | `terminal` | 5 | 582 | `vc` | -16 |
| 1006 | Requested range | `error` | - | - | - | - |
| 1007 | Requested range | `terminal` | 5 | 533 | `vc` | -15 |
| 1008 | Requested range | `terminal` | 5 | 503 | `vc` | 4 |
| 1009 | Requested range | `terminal` | 5 | 581 | `vc` | -5 |
| 1010 | Requested range | `terminal` | 5 | 590 | `vc` | -7 |
| 1011 | Requested range | `terminal` | 5 | 570 | `vc` | -20 |
| 1012 | Requested range | `terminal` | 5 | 544 | `vc` | -13 |
| 1013 | Requested range | `terminal` | 5 | 595 | `vc` | -10 |
| 1014 | Requested range | `terminal` | 5 | 534 | `vc` | -15 |

The additional witness-seed results are:

| Seed | Why checked | Stop reason | Turns | Decisions | Winner | ARVN margin |
| --- | --- | --- | ---: | ---: | --- | ---: |
| 1020 | ARVN-evolved witness seed | `terminal` | 5 | 444 | `vc` | -16 |
| 1049 | ARVN-evolved witness seed | `terminal` | 0 | 42 | `vc` | -15 |
| 1054 | ARVN-evolved witness seed | `terminal` | 5 | 528 | `vc` | -7 |

## Campaign-range notes

### Seed 1000

- This is still the only seed the live evolution harness would use right now.
- It still terminates normally.
- Final margins: `us=-11`, `arvn=-3`, `nva=-14`, `vc=6`

### Seed 1001

- Still reproduces `noLegalMoves`.
- Final margins at stop: `us=-8`, `arvn=-15`, `nva=-14`, `vc=11`
- The failure still happens on NVA's turn at `turnCount=2`.
- The publish step still fails with:
  - `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations`
- Last successful player decision before the failure:
  - seat: `nva`
  - decision kind: `chooseNStep`
  - published legal action count: `28`
  - selected stable move key:
    - `chooseNStep:decision:doc.actionPipelines.10.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces:confirm:null`

### Seed 1006

- The older April 22 `noLegalMoves` note is no longer current.
- In the live tournament rerun, this seed now fails as a runtime error before a normal stop reason is recorded.
- Direct reruns currently throw:
  - `Illegal move: actionId=march reason=moveNotLegalInCurrentState`
  - detail: `active seat has unresolved required free-operation grants`
- The failing move still sits inside NVA `march` / `chooseNStep` flow around `tay-ninh:none`, but the failure class is now `ILLEGAL_MOVE`, not the earlier bridgeability-only `noLegalMoves` result.

### Other campaign-range seeds

- `1002`, `1003`, `1004`, `1005`, `1007`, `1008`, `1009`, `1010`, `1011`, `1012`, `1013`, and `1014` all still terminate normally with VC wins.
- Only `1002` and `1008` still give ARVN a positive final margin (`2` and `4` respectively), but neither crosses the win threshold before the VC terminal result.
- The main drift across these seeds is in decision counts, not winner class.

## Witness-seed notes

### Seed 1020

- Still terminates normally, matching the ARVN-evolved witness expectation on stop-reason class.
- Final margins: `us=-9`, `arvn=-16`, `nva=-14`, `vc=2`

### Seed 1049

- Under direct `runGame(...)`, this still terminates immediately on turn `0` with a VC win.
- Current direct-run metrics: `42` decisions, final margins `us=-12`, `arvn=-15`, `nva=-14`, `vc=1`
- However, the focused stepwise diagnostic path now diverges:
  - `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1049 --max-turns 200 --evolved-seat arvn`
  - current result there: `stopReason=noLegalMoves` after `237` decisions
  - failure class: `MICROTURN_CONSTRUCTIBILITY_INVARIANT`
- That means the direct tournament path and the manual microturn diagnostic path are no longer interchangeable for this seed.

### Seed 1054

- Still terminates normally with a VC win on turn `5`.
- Current direct-run metrics: `528` decisions, final margins `us=-6`, `arvn=-7`, `nva=-15`, `vc=0`

## Current Interpretation

The old report conclusions need to be narrowed:

- The campaign tooling itself is no longer stale for this report. `run-tournament.mjs` runs successfully against the current engine.
- The direct ARVN-evolved witness expectations in `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` are currently aligned with the rebuilt engine for `1020`, `1049`, and `1054`.
- The meaningful drift is elsewhere:
  - campaign decision counts shifted across most seeds
  - seed `1006` changed failure class from the earlier reported `noLegalMoves` witness to a runtime `ILLEGAL_MOVE`
  - seed `1049` now exposes a discrepancy between direct `runGame(...)` and the stepwise diagnostic script

## Practical Conclusion

The seed report should now be read as follows:

- authoritative rerun results are the direct tournament / `runGame(...)` results in the tables above
- `1001` remains the clean reproduced `noLegalMoves` campaign witness
- `1006` is now a stronger signal than before, because it no longer fails as a simple terminal classification issue and instead trips a runtime legality bug
- `1049` should not be treated as a stable debugging witness without first deciding whether the report should trust direct `runGame(...)` or the manual microturn diagnostic path for that seed
