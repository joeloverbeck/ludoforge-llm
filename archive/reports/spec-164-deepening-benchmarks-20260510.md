# Spec 164 deepening benchmark sweep

Generated: 2026-05-10T10:03:37.438Z

Command:

```bash
pnpm -F @ludoforge/engine build
node packages/engine/scripts/spec-164-deepening-benchmark.mjs --date 20260510
```

This report is empirical evidence for future default-change work. It is not a
green/red acceptance gate for production profile migration.

## FITL arvn-evolved

Baseline:

- command label: FITL arvn-evolved singlePass standard256
- seed/maxTurns/playerCount: 1000/600/4
- stopReason/decisions: terminal/160
- wall clock: 22299.10 ms
- preview decisions: 100
- broad coverage: evaluated=0, ready=0, unavailable=0
- deep coverage: evaluated=0, ready=0, unavailable=0, triggers={}
- final ready/unavailable roots: 876/234
- tiebreakAfterPreviewNoSignal decisions: 3
- broad-no-signal decisions flipped to preview-driven: 0

Treatment:

- command label: FITL arvn-evolved continuedDeepening deep1024 Db=4 Dd=16
- seed/maxTurns/playerCount: 1000/600/4
- stopReason/decisions: terminal/160
- wall clock: 21479.47 ms
- preview decisions: 100
- broad coverage: evaluated=64, ready=44, unavailable=20
- deep coverage: evaluated=20, ready=20, unavailable=0, triggers={"allRequestedRefsDepthCapped":3}
- final ready/unavailable roots: 896/214
- tiebreakAfterPreviewNoSignal decisions: 0
- broad-no-signal decisions flipped to preview-driven: 3

Timing delta: -3.7%

## Texas Holdem representative profile

Baseline:

- command label: Texas Holdem baseline preview disabled
- seed/maxTurns/playerCount: 42/200/4
- stopReason/decisions: terminal/16
- wall clock: 150.64 ms
- preview decisions: 0
- broad coverage: evaluated=0, ready=0, unavailable=0
- deep coverage: evaluated=0, ready=0, unavailable=0, triggers={}
- final ready/unavailable roots: 0/0
- tiebreakAfterPreviewNoSignal decisions: 0
- broad-no-signal decisions flipped to preview-driven: 0

Treatment:

- command label: Texas Holdem diagnostic continuedDeepening standard256 Db=4 Dd=8
- seed/maxTurns/playerCount: 42/200/4
- stopReason/decisions: terminal/16
- wall clock: 138.26 ms
- preview decisions: 0
- broad coverage: evaluated=0, ready=0, unavailable=0
- deep coverage: evaluated=0, ready=0, unavailable=0, triggers={}
- final ready/unavailable roots: 0/0
- tiebreakAfterPreviewNoSignal decisions: 0
- broad-no-signal decisions flipped to preview-driven: 0

Timing delta: -8.2%

The current Texas production profile has no microturn-scoped
`preview.option.*` considerations, so the diagnostic continued-deepening run
records preview-decision count 0. This preserves the no-production-default
boundary and documents that Texas does not currently supply a meaningful
deepening signal surface.

## Summary

- FITL ref-flip count: 3
- Texas ref-flip count: 0
- Production profile defaults changed: no
- Follow-up input: any future default migration should start from the FITL
  ready-signal recovery row and separately introduce a Texas profile signal
  surface before treating Texas deepening as meaningful.
