# 154POLBCDISP-003 Measurement

Date: 2026-05-04

## Decision

Delete the explicit `candidateFeature`, `stateFeature`, and
`candidateAggregate` fallback handlers from
`packages/engine/src/agents/policy-evaluation-core.ts`, along with the now-unused
`findLibraryRef` helper.

The delete arm regressed the keep median by `40.08 ms` (`2.69%`), which is below
the ticket's `<=5%` delete threshold. The delete arm also stayed below the
repaired reset gate's `<=1800 ms` ceiling.

## Commands

Build before measurement:

```bash
pnpm -F @ludoforge/engine build
```

Per-card measurement command for both arms:

```bash
pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js
```

## Samples

Recalibrated ceiling at measurement time: `1800 ms`.

| Arm | Samples (`duration_ms`) | Median |
| --- | --- | --- |
| keep explicit handlers | `1460.23`, `1488.11`, `1504.53` | `1488.11 ms` |
| delete explicit handlers | `1645.26`, `1528.19`, `1514.11` | `1528.19 ms` |

Delta: `+40.08 ms` delete vs keep.
Percent change: `+2.69%` delete vs keep.
Verdict: delete wins under the `<=5%` rule.

## Caveats

Samples were taken serially in the same checkout after an engine build. No other
build, test, or profile lane was intentionally running during the measurements.
The report records the Node test subtest `duration_ms` value because that is the
timed per-card workload asserted by the gate; the process-level TAP duration is
not the ticket-owned metric.
