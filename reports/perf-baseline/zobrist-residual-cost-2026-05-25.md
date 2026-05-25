# Zobrist Residual-Cost Profile

**Date**: 2026-05-25
**Head**: 0003afbc8b
**Command**: `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`
**Boundary**: Observation-only; no engine source or test files changed. Existing hot-path buckets expose `count` and `totalMs`, so this report uses mean per-call timing rather than medians.

## Per-Workload Zobrist Counters

| Workload | Identity hit rate | Content hit rate | Encode-call rate | Mean encode ms/call | Mean digest ms/call | Mean encoded chars/miss | Encode total ms | Digest total ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `parity-drive` | 67.30% | 1.03% | 32.70% | 0.102248 | 0.191307 | 23676.33 | 11506.745 | 21307.753 |
| `bounded-termination-1002` | 67.22% | 1.08% | 32.78% | 0.096712 | 0.186633 | 23605.47 | 6314.887 | 12054.238 |
| `diagnose-parity-runGame-1001` | 67.31% | 1.01% | 32.69% | 0.101704 | 0.19018 | 23672.3 | 11436.16 | 21168.524 |
| `policy-preview-parity-arvn-1008` | 67.27% | 1.08% | 32.73% | 0.102879 | 0.190056 | 23632.4 | 8497.831 | 15529.086 |
| `arvn-tournament-parallel` | 67.24% | 1.07% | 32.76% | 0.101199 | 0.189548 | 23616.93 | 6600.018 | 12229.612 |

## Profiled vs Unprofiled Wall Clock

| Workload | Profiled wall-clock s | Unprofiled wall-clock s | Overhead ratio | Final state hash |
|---|---:|---:|---:|---|
| `parity-drive` | 108.817 | 104.245 | 1.0439x | `15731826444209991459` |
| `bounded-termination-1002` | 64.081 | 65.158 | 0.9835x | `18191714523269899736` |
| `diagnose-parity-runGame-1001` | 111.861 | 112.037 | 0.9984x | `15443374985514672353` |
| `policy-preview-parity-arvn-1008` | 78.173 | 77.032 | 1.0148x | `1809700423170548125` |
| `arvn-tournament-parallel` | 60.826 | 58.659 | 1.0369x | `2429369674077347843` |

## Hypothesis Verdicts

- **H1 (refined)**: aggregate identity-cache hit rate was 67.28%. The report treats the low-hit hypothesis as accepted below 25%; higher values refine the hypothesis rather than proving object identity churn is the only driver.
- **H2 (refined)**: aggregate encode-call rate was 32.72% and content-cache hit rate after identity miss was 1.05%. Content hits still require the encode pass because the encoded JSON string is the cache key.
- **H3 (refined)**: aggregate encode total was 44355.641 ms versus FNV-1a digest total 82289.213 ms, with mean encode 0.101246 ms/call and mean digest 0.189823 ms/call.

## Phase 2 Lever Selection

**Selected lever**: 2B - Encoded-surface reduction

Evidence trail: the decision matrix is applied to the aggregate Phase 1 measurements. Identity-cache hit rate is 67.28%, encode-call rate is 32.72%, mean encoded chars per miss is 23647.62, and encode-vs-digest totals are 44355.641 ms vs 82289.213 ms.

## Raw Counter Summary

| Workload | Weak hits | Content hits | Content misses | Total calls | Encode calls | Digest calls |
|---|---:|---:|---:|---:|---:|---:|
| `parity-drive` | 231604 | 1158 | 111380 | 344142 | 112538 | 111380 |
| `bounded-termination-1002` | 133896 | 708 | 64588 | 199192 | 65296 | 64588 |
| `diagnose-parity-runGame-1001` | 231570 | 1138 | 111308 | 344016 | 112446 | 111308 |
| `policy-preview-parity-arvn-1008` | 169774 | 892 | 81708 | 252374 | 82600 | 81708 |
| `arvn-tournament-parallel` | 133862 | 698 | 64520 | 199080 | 65218 | 64520 |
