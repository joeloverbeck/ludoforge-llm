# Spec 144 I2 Publication Probe Memoization Measurement

Date: 2026-04-24

## Verdict

Tune and retain the run-local `publicationProbeCache`.

The full 18-seed, `maxTurns=500` comparison completed inside the explicit 25-minute timeout. Cache-enabled and cache-disabled modes produced identical stop reasons, turn counts, and decision counts for every seed. The cache hit rate was 36.45%, above the 15% removal threshold, but the tuned-build disabled run was 0.26% faster in this sandbox. That falls under the ticket's "remove or tune" trigger, so the default LRU limit is tuned from 10,000 to 2,500 entries.

The tuned limit is evidence-backed: the observed peak cache size was 2,467 entries, so 2,500 preserves the observed full-corpus working set while removing unused headroom. The cache remains `runLocal`; retaining it preserves deterministic verdict parity and keeps a bounded accelerator available for repeated publication probes.

## Corpus

Seeds: `1000..1014`, `1020`, `1049`, `1054`

Profile mapping: `us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`

Command used:

```bash
timeout 25m node campaigns/phase4-probe-recover/measure-memoization.mjs --max-turns 500 --seed-list 1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1020,1049,1054 --modes enabled,disabled
```

Precondition:

```bash
pnpm -F @ludoforge/engine build
```

The measurement script compiles production FITL once, runs each seed through compiled `runGame`, and instruments `LruCache` prototype calls. `LruCache` is production-used only by `GameDefRuntime.publicationProbeCache`, so the counters measure the publication probe cache. Disabled mode makes `set` a no-op while still counting attempted gets and sets.

## Summary

| Mode | Max turns | Wall clock | Cache gets | Hits | Sets | Hit rate | Peak cache size |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cache enabled | 500 | 344,923 ms | 52,642 | 19,187 | 33,455 | 36.45% | 2,467 |
| cache disabled | 500 | 344,034 ms | 73,447 | 0 | 73,447 | 0.00% | 0 |

Wall-clock delta, disabled vs enabled: `-0.26%` in this sandbox. The measured wall-clock difference is small and order-sensitive, but it is still below the ticket's 5% benefit threshold, so the runtime default is tuned rather than left unchanged.

## Per-Seed Results

| Seed | Enabled stop | Disabled stop | Turns | Decisions | Enabled wall ms | Disabled wall ms | Enabled hit rate | Enabled peak size |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | terminal | terminal | 5 | 524 | 18,472 | 18,558 | 32.44% | 2,064 |
| 1001 | noLegalMoves | noLegalMoves | 2 | 245 | 7,690 | 7,380 | 51.94% | 2,064 |
| 1002 | terminal | terminal | 5 | 572 | 19,282 | 18,302 | 39.60% | 2,251 |
| 1003 | terminal | terminal | 4 | 482 | 13,803 | 13,157 | 41.38% | 2,251 |
| 1004 | terminal | terminal | 5 | 575 | 17,781 | 17,221 | 33.18% | 2,251 |
| 1005 | terminal | terminal | 5 | 582 | 22,376 | 21,711 | 38.99% | 2,297 |
| 1006 | terminal | terminal | 5 | 460 | 18,905 | 17,774 | 30.97% | 2,297 |
| 1007 | terminal | terminal | 5 | 533 | 16,164 | 16,073 | 39.14% | 2,297 |
| 1008 | terminal | terminal | 5 | 503 | 22,679 | 22,217 | 37.85% | 2,297 |
| 1009 | terminal | terminal | 5 | 581 | 19,752 | 19,988 | 30.99% | 2,297 |
| 1010 | terminal | terminal | 5 | 590 | 21,056 | 21,536 | 39.32% | 2,297 |
| 1011 | terminal | terminal | 5 | 570 | 19,751 | 20,293 | 41.78% | 2,297 |
| 1012 | terminal | terminal | 5 | 544 | 42,887 | 44,101 | 36.50% | 2,297 |
| 1013 | terminal | terminal | 5 | 595 | 18,852 | 19,345 | 29.45% | 2,467 |
| 1014 | terminal | terminal | 5 | 534 | 23,183 | 22,914 | 39.65% | 2,467 |
| 1020 | terminal | terminal | 5 | 444 | 15,945 | 16,484 | 29.56% | 2,467 |
| 1049 | terminal | terminal | 0 | 42 | 1,606 | 1,661 | 9.38% | 2,467 |
| 1054 | terminal | terminal | 5 | 528 | 24,710 | 25,295 | 32.16% | 2,467 |

## Determinism and Cache Decision

Probe verdicts and published decisions were identical with and without memoization for the measured corpus: every seed matched stop reason, turn count, and decision count.

The cache remains a bounded accelerator, not a legality source. The final decision is:

- retain `publicationProbeCache` as a `runLocal` runtime member
- tune `PUBLICATION_PROBE_CACHE_LIMIT` to `2_500`
- leave probe semantics unchanged
