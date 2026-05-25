# Spec 194 Phase 3 Zobrist Perf Witness

**Date**: 2026-05-25
**Head**: 32e4d98e50
**Boundary**: Phase 3 observation-only witness after ticket `archive/tickets/194ZOBDECSTA-002.md`; no engine source or test files were edited.
**Verdict**: Target met by the individual wall-clock gate. The combined Zobrist-trio self-time gate was not met.

## Commands

- Main checkout build: `pnpm turbo build` — passed.
- Phase 1 capture rerun in temp worktree `/tmp/ludoforge-spec194-phase3`: `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs` — passed for all five regressed workloads.
- Spec 192 baseline harness rerun in temp worktree `/tmp/ludoforge-spec194-phase3`: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload> --runs 1` — passed for all five regressed workloads after rerunning outside the sandbox.
- Temp worktree setup: `pnpm install`, `pnpm turbo build`, then `cargo build --manifest-path packages/engine-wasm/policy-vm/Cargo.toml --target wasm32-unknown-unknown --release` before the ARVN tournament workload because cached build replay did not materialize the WASM binary in the temp worktree.

The retained Spec 192 harness normally supports three wall-clock runs. This Phase 3 witness used one wall-clock run per workload plus the harness CPU/allocation/per-decision sidecars so the five-workload recapture could complete in the current ticket loop. The report treats the wall-clock values as measured current-head witness values, not as a new long-term calibrated baseline.

## Per-Workload Measured Self-Times At Post-002 HEAD

Current self-times are summed from the Spec 192 harness `cpuProfTop30SelfTime` rows for `digestEncodedDecisionStackFrame`, `encodeDecisionStackFrameDigestInput`, and `zobristKey`.

| Workload | Current wall-clock ms | digest ms | encode ms | zobristKey ms | Current trio ms |
|---|---:|---:|---:|---:|---:|
| `parity-drive` | 103260.260 | 18778.129 | 8021.469 | 10064.617 | 36864.215 |
| `bounded-termination-1002` | 439813.822 | 68666.053 | 27881.008 | 41478.140 | 138025.201 |
| `diagnose-parity-runGame-1001` | 222725.082 | 26887.319 | 15637.775 | 17226.222 | 59751.316 |
| `policy-preview-parity-arvn-1008` | 198973.936 | 28243.612 | 12743.366 | 11362.251 | 52349.229 |
| `arvn-tournament-parallel` | 180111.508 | 18342.453 | 8584.633 | 7995.088 | 34922.174 |

## Delta Against 2026-05-24 Baseline

Baseline wall-clock values come from `reports/fitl-perf-baseline-2026-05-24.md` workload table. Baseline Zobrist-trio values come from that report's Findings Table row 2.

| Workload | Baseline wall-clock ms | Current wall-clock ms | Wall-clock delta ms | Wall-clock reduction | Baseline trio ms | Current trio ms | Trio delta ms | Trio reduction |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `parity-drive` | 157458.458 | 103260.260 | 54198.198 | 34.42% | 37500.000 | 36864.215 | 635.785 | 1.70% |
| `bounded-termination-1002` | 565648.950 | 439813.822 | 125835.128 | 22.25% | 142300.000 | 138025.201 | 4274.799 | 3.00% |
| `diagnose-parity-runGame-1001` | 308794.162 | 222725.082 | 86069.080 | 27.87% | 72200.000 | 59751.316 | 12448.684 | 17.24% |
| `policy-preview-parity-arvn-1008` | 260264.807 | 198973.936 | 61290.871 | 23.55% | 51200.000 | 52349.229 | -1149.229 | -2.24% |
| `arvn-tournament-parallel` | 257342.062 | 180111.508 | 77230.554 | 30.01% | 32800.000 | 34922.174 | -2122.174 | -6.47% |

Aggregate current Zobrist-trio self-time is `321912.135 ms` versus `336000.000 ms` at the 2026-05-24 baseline, a `14087.865 ms` / `4.19%` reduction.

## Encoded-Surface Delta Against Phase 1 Baseline

The Phase 1 baseline aggregate mean encoded chars per miss was `23647.62` in `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`. The post-002 capture rerun reported aggregate mean encoded chars per miss `22793.48`, an `854.14` chars / `3.61%` shrink.

| Workload | Phase 1 chars/miss | Current chars/miss | Delta | Shrink |
|---|---:|---:|---:|---:|
| `parity-drive` | 23676.33 | 22811.71 | 864.62 | 3.65% |
| `bounded-termination-1002` | 23605.47 | 22770.50 | 834.97 | 3.54% |
| `diagnose-parity-runGame-1001` | 23672.30 | 22804.76 | 867.54 | 3.66% |
| `policy-preview-parity-arvn-1008` | 23632.40 | 22781.48 | 850.92 | 3.60% |
| `arvn-tournament-parallel` | 23616.93 | 22780.70 | 836.23 | 3.54% |

## Gain Target Evaluation

Spec 194 §8 P3 target: `>=10% individual wall-clock reduction OR >=15% combined Zobrist-trio self-time reduction across the five regressed workloads`.

| Gate | Result |
|---|---|
| Individual wall-clock reduction >=10% | Met for all five workloads: 34.42%, 22.25%, 27.87%, 23.55%, 30.01%. |
| Combined Zobrist-trio self-time reduction >=15% | Missed: 4.19% aggregate reduction. |

**Target met**: the OR gate is satisfied by the individual wall-clock reductions.

## Final State Hash Determinism Check

The Phase 1 capture script rerun compares profiled and unprofiled final state hashes for each workload. All five matched.

| Workload | Profiled final state hash | Unprofiled final state hash | Match |
|---|---|---|---|
| `parity-drive` | `15731826444209991459` | `15731826444209991459` | yes |
| `bounded-termination-1002` | `18191714523269899736` | `18191714523269899736` | yes |
| `diagnose-parity-runGame-1001` | `15443374985514672353` | `15443374985514672353` | yes |
| `policy-preview-parity-arvn-1008` | `1809700423170548125` | `1809700423170548125` | yes |
| `arvn-tournament-parallel` | `2429369674077347843` | `2429369674077347843` | yes |

## Archive Recommendation

Archive Spec 194. Phase 3 met the spec target through the individual wall-clock gate, and no engine source/test drift was introduced by the Phase 3 witness.
