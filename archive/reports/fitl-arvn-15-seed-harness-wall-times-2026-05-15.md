# FITL ARVN 15-Seed Harness Wall-Time Report

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Date**: 2026-05-15
**Status**: Measurement report. No profiling or root-cause analysis performed here.
**Audience**: Project maintainer and follow-on profiling work.
**Scope**: `campaigns/fitl-arvn-agent-evolution` full 15-seed tier, seeds `1000` through `1014`.

---

## 1. TL;DR

The current `campaigns/fitl-arvn-agent-evolution/harness.sh` does complete the full 15-seed tier with its default parallel tournament settings:

- Command: `bash campaigns/fitl-arvn-agent-evolution/harness.sh`
- Harness seed tier: `15` from `campaigns/fitl-arvn-agent-evolution/seed-tier.txt`
- Tournament settings: `players=4`, `evolved-seat=arvn`, `maxTurns=200`, `concurrency=8`
- Result: `completed=15`, `truncated=0`, `errors=0`
- End-to-end wall clock including build, full engine regression gate, and tournament: `5:17.15`

However, per-seed timing shows a clear outlier:

- Seed `1005`: `185.6s`, terminal, `418` decisions.
- Next slowest: seed `1011` at `83.7s`.

Conclusion: the merged harness is fixed enough to finish end-to-end at default concurrency, but the tier still contains a pathological slow seed. Seed `1005` should be the first profiling target.

---

## 2. Context

The user asked whether the latest PR merge had actually made the full 15-seed FITL harness run in reasonable time. The relevant harness is:

```text
campaigns/fitl-arvn-agent-evolution/harness.sh
```

The live harness:

- reads the seed count from `campaigns/fitl-arvn-agent-evolution/seed-tier.txt`;
- currently resolves that tier to `15`;
- runs seeds `1000..1014` through `run-tournament.mjs`;
- builds the engine first;
- runs `pnpm -F @ludoforge/engine test` as the regression gate;
- then runs the tournament with default `CONCURRENCY=8`, unless overridden.

The goal of this report is only to preserve wall-time evidence and enough command context for later profiling. It does not diagnose why seed `1005` is slow.

---

## 3. Harness Results

### 3.1 Default Harness Run

Command:

```bash
/usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

Harness output:

```text
compositeScore=-3.1333
avgMargin=-5.8
winRate=0.2667
wins=4
completed=15
truncated=0
errors=0
concurrency=8
```

Timing output:

```text
Elapsed (wall clock) time (h:mm:ss or m:ss): 5:17.15
User time (seconds): 1308.54
System time (seconds): 89.17
Percent of CPU this job got: 440%
Maximum resident set size (kbytes): 11957644
Exit status: 0
```

Runner log summary:

```text
Trace mode: last
WASM policy runtime: enabled
GameDef cache: hit
Evolved seat: arvn (player index 1)
Seat profiles: us-baseline, arvn-evolved, nva-baseline, vc-baseline
Seed concurrency: 8
```

All 15 seeds reached `stop=terminal`.

### 3.2 Serial Harness Attempt

Before the per-seed diagnostic, the harness was also run with serial tournament execution:

```bash
/usr/bin/time -v env CONCURRENCY=1 bash campaigns/fitl-arvn-agent-evolution/harness.sh
```

This passed the build and full engine test gate, then entered the 15-seed tournament. It was manually terminated after `12:13.16` elapsed wall clock because the harness emits per-seed summaries only after the tournament completes, so it provided no useful outlier visibility while running serially.

Termination details:

```text
status=RUNNER_FAIL
runner_exit_code=143
Elapsed (wall clock) time (h:mm:ss or m:ss): 12:13.16
Maximum resident set size (kbytes): 3240728
```

This serial run was not used as a failure verdict for the harness. It motivated the bounded per-seed diagnostic in Section 4.

---

## 4. Per-Seed Wall Times

### 4.1 Method

A temporary diagnostic script was written outside the repo at:

```text
/tmp/fitl-seed-timer.mjs
```

It reused the compiled engine and the campaign runner modules, loaded the same FITL GameDef, initialized the same policy WASM runtime, and ran each seed in a fresh worker using:

- `players=4`
- `evolvedSeat=arvn`
- `seatProfiles=us-baseline, arvn-evolved, nva-baseline, vc-baseline`
- `maxTurns=200`
- `traceMode=none`
- seeds `1000..1014`

The first pass used a `180000 ms` per-seed timeout so that one outlier could not block the whole tier. Seed `1005` hit that timeout by a small margin, so it was rerun alone with a `600000 ms` timeout and completed in `185.641s`.

Important caveat: the diagnostic used `traceMode=none`, while the default harness uses `traceMode=last`. The diagnostic is therefore best interpreted as a per-seed runtime isolation probe, not a byte-for-byte replacement for the harness.

### 4.2 Results

| Seed | Wall Time | Status | Stop Reason | Decisions | ARVN Margin |
|---:|---:|---|---|---:|---:|
| 1000 | 10.418s | OK | terminal | 157 | -6 |
| 1001 | 42.066s | OK | terminal | 195 | -6 |
| 1002 | 51.100s | OK | terminal | 289 | -2 |
| 1003 | 44.831s | OK | terminal | 226 | 4 |
| 1004 | 56.384s | OK | terminal | 340 | 4 |
| 1005 | 185.641s | OK | terminal | 418 | -19 |
| 1006 | 16.812s | OK | terminal | 230 | -13 |
| 1007 | 14.412s | OK | terminal | 219 | -3 |
| 1008 | 69.438s | OK | terminal | 166 | -17 |
| 1009 | 61.197s | OK | terminal | 306 | 7 |
| 1010 | 30.141s | OK | terminal | 325 | -9 |
| 1011 | 83.720s | OK | terminal | 213 | -6 |
| 1012 | 59.404s | OK | terminal | 215 | -12 |
| 1013 | 68.860s | OK | terminal | 257 | 5 |
| 1014 | 26.350s | OK | terminal | 214 | -14 |

### 4.3 Outlier Ranking

Sorted by wall time:

| Rank | Seed | Wall Time | Decisions | Notes |
|---:|---:|---:|---:|---|
| 1 | 1005 | 185.641s | 418 | Primary outlier; first profiling target. |
| 2 | 1011 | 83.720s | 213 | Secondary slow seed. |
| 3 | 1008 | 69.438s | 166 | Secondary slow seed. |
| 4 | 1013 | 68.860s | 257 | Secondary slow seed. |
| 5 | 1009 | 61.197s | 306 | Secondary slow seed. |
| 6 | 1012 | 59.404s | 215 | Near secondary cluster. |
| 7 | 1004 | 56.384s | 340 | Near secondary cluster. |
| 8 | 1002 | 51.100s | 289 | Mid-tier. |
| 9 | 1003 | 44.831s | 226 | Mid-tier. |
| 10 | 1001 | 42.066s | 195 | Mid-tier. |
| 11 | 1010 | 30.141s | 325 | Fast relative to decision count. |
| 12 | 1014 | 26.350s | 214 | Fast. |
| 13 | 1006 | 16.812s | 230 | Fast. |
| 14 | 1007 | 14.412s | 219 | Fast. |
| 15 | 1000 | 10.418s | 157 | Fastest. |

Seed `1005` is more than 2.2x slower than the next slowest seed and more than 17x slower than the fastest seed.

---

## 5. Full Per-Seed Diagnostic JSON

```json
{
  "maxTurns": 200,
  "timeoutMs": 180000,
  "results": [
    {
      "seed": 1000,
      "elapsedMs": 10417.612458,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 157,
      "margins": { "us": -6, "arvn": -6, "nva": -14, "vc": 6 },
      "error": null
    },
    {
      "seed": 1001,
      "elapsedMs": 42066.178914,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 195,
      "margins": { "us": -8, "arvn": -6, "nva": -14, "vc": 5 },
      "error": null
    },
    {
      "seed": 1002,
      "elapsedMs": 51100.312297,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 289,
      "margins": { "us": -11, "arvn": -2, "nva": -14, "vc": 2 },
      "error": null
    },
    {
      "seed": 1003,
      "elapsedMs": 44831.331184,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 226,
      "margins": { "us": -7, "arvn": 4, "nva": -14, "vc": -4 },
      "error": null
    },
    {
      "seed": 1004,
      "elapsedMs": 56384.39244,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 340,
      "margins": { "us": -9, "arvn": 4, "nva": -14, "vc": 2 },
      "error": null
    },
    {
      "seed": 1005,
      "status": "TIMEOUT",
      "elapsedMs": 180176.224421,
      "error": "exceeded 180000 ms"
    },
    {
      "seed": 1006,
      "elapsedMs": 16812.137243,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 230,
      "margins": { "us": -9, "arvn": -13, "nva": -14, "vc": 5 },
      "error": null
    },
    {
      "seed": 1007,
      "elapsedMs": 14411.878193,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 219,
      "margins": { "us": -13, "arvn": -3, "nva": -14, "vc": 1 },
      "error": null
    },
    {
      "seed": 1008,
      "elapsedMs": 69438.009311,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 166,
      "margins": { "us": -8, "arvn": -17, "nva": -14, "vc": 2 },
      "error": null
    },
    {
      "seed": 1009,
      "elapsedMs": 61196.979066,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 306,
      "margins": { "us": -17, "arvn": 7, "nva": -14, "vc": 2 },
      "error": null
    },
    {
      "seed": 1010,
      "elapsedMs": 30140.783565,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 325,
      "margins": { "us": -14, "arvn": -9, "nva": -13, "vc": 4 },
      "error": null
    },
    {
      "seed": 1011,
      "elapsedMs": 83719.78745,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 213,
      "margins": { "us": -15, "arvn": -6, "nva": -14, "vc": 5 },
      "error": null
    },
    {
      "seed": 1012,
      "elapsedMs": 59404.338767,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 215,
      "margins": { "us": -17, "arvn": -12, "nva": -14, "vc": 4 },
      "error": null
    },
    {
      "seed": 1013,
      "elapsedMs": 68860.041262,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 257,
      "margins": { "us": -16, "arvn": 5, "nva": -14, "vc": 1 },
      "error": null
    },
    {
      "seed": 1014,
      "elapsedMs": 26350.490152,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 214,
      "margins": { "us": -15, "arvn": -14, "nva": -14, "vc": 4 },
      "error": null
    }
  ]
}
```

Focused rerun for seed `1005`:

```json
{
  "maxTurns": 200,
  "timeoutMs": 600000,
  "results": [
    {
      "seed": 1005,
      "elapsedMs": 185640.863317,
      "status": "OK",
      "stopReason": "terminal",
      "completed": true,
      "truncated": false,
      "decisionCount": 418,
      "margins": { "us": -12, "arvn": -19, "nva": -13, "vc": 1 },
      "error": null
    }
  ]
}
```

---

## 6. Follow-Up Profiling Targets

Suggested profiling order:

1. Seed `1005`: primary outlier, `185.6s`, `418` decisions.
2. Seed `1011`: secondary outlier, `83.7s`, only `213` decisions.
3. Seed `1008`: secondary outlier, `69.4s`, only `166` decisions.
4. Compare against seed `1000`: fastest seed, `10.4s`, `157` decisions.
5. Compare against seed `1010`: relatively fast despite `325` decisions.

The comparison between `1008`/`1011` and `1010` may be useful because raw decision count alone does not explain runtime. The profiling question should focus on which decision classes, preview paths, microturn options, or state shapes dominate elapsed time.

---

## 7. Current Verdict

The full 15-seed harness is operational at default concurrency. It is not clean from a performance perspective:

- The harness finishes in about five minutes on this machine.
- Seed `1005` remains a severe outlier and dominates the wall-clock budget.
- Several secondary seeds take around one minute or more.
- Later profiling should treat this report as the timing baseline and avoid inferring root cause from decision count alone.
