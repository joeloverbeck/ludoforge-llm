# Spec 144 I2 Publication Probe Memoization Measurement

Date: 2026-04-24

## Verdict

Keep the run-local `publicationProbeCache` with the default LRU limit of 10,000 entries.

The bounded 18-seed calibration showed a 59.81% cache hit rate and a peak cache size of 493 entries. The measured wall-clock delta in this sandbox was noisy and slightly slower with cache enabled, but the hit-rate threshold is well above the 15% removal threshold and the observed peak is far below the default limit.

## Corpus

Seeds: `1000..1014`, `1020`, `1049`, `1054`

Profile mapping: `us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`

Command shape:

```bash
node --input-type=module -e '<compile FITL, monkeypatch LruCache get/set counters, runGame for the seed list>'
```

The full 500-turn doubled comparison and a 25-turn doubled comparison were both attempted first and exceeded the interactive timeout without producing a complete summary. The checked-in numbers below are therefore a one-turn calibration over the same seed corpus, not a full-campaign timing claim.

## Results

| Mode | Max turns | Wall clock | Cache gets | Hits | Sets | Hit rate | Peak cache size |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cache enabled | 1 | 96,339 ms | 12,400 | 7,416 | 4,984 | 59.81% | 493 |
| cache disabled | 1 | 88,080 ms | 15,627 | 0 | 15,627 | 0% | 0 |

Wall-clock delta, disabled vs enabled: `-8.57%` in this sandbox. This is not treated as a removal signal because the bounded run is dominated by FITL compile/startup and one-turn policy overhead rather than full publication-probe work.

## Per-Seed Stop Summary

All cached and uncached runs produced the same stop reasons and decision counts.

| Seed | Stop reason | Turns | Decisions |
| ---: | --- | ---: | ---: |
| 1000 | maxTurns | 1 | 156 |
| 1001 | maxTurns | 1 | 143 |
| 1002 | maxTurns | 1 | 107 |
| 1003 | maxTurns | 1 | 109 |
| 1004 | maxTurns | 1 | 143 |
| 1005 | maxTurns | 1 | 89 |
| 1006 | maxTurns | 1 | 126 |
| 1007 | maxTurns | 1 | 132 |
| 1008 | maxTurns | 1 | 168 |
| 1009 | maxTurns | 1 | 117 |
| 1010 | maxTurns | 1 | 123 |
| 1011 | maxTurns | 1 | 139 |
| 1012 | maxTurns | 1 | 133 |
| 1013 | maxTurns | 1 | 148 |
| 1014 | maxTurns | 1 | 85 |
| 1020 | maxTurns | 1 | 132 |
| 1049 | terminal | 0 | 42 |
| 1054 | maxTurns | 1 | 173 |

## Sizing Decision

Peak observed size was 493 entries. The default 10,000-entry limit remains conservative for longer runs while staying bounded per run. Ticket 002 will reset this cache across run forks by construction because ticket 001 adds it as a `runLocal` runtime member.
