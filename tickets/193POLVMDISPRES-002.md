# 193POLVMDISPRES-002: Perf witness re-capture across 5 regressed FITL workloads (P3)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — measurement-only ticket consuming the Spec 192 baseline harness; output is JSON summaries and an appended report section.
**Deps**: `tickets/193POLVMDISPRES-001.md`

## Problem

Spec 193 §8 P3: after the typed-verdict refactor lands (ticket 001), re-run the Spec 192 baseline harness on the five regressed FITL workloads to record measured gain and determine whether the per-spec acceptance threshold is met (≥10% individual wall-clock reduction OR ≥10% combined reduction in `PolicyBytecodeVmUnsupportedError`-attributed self-time).

The measurement gates two downstream decisions:
- Whether ticket 003 (P2 negative cache) is implemented or closed-with-Declined.
- Whether the Spec 192 §4.5 escalation trigger fires (recommending `Bytecode-VM expansion` or `WASM expansion` follow-up).

## Assumption Reassessment (2026-05-24)

1. Spec 192's baseline harness scripts under `packages/engine/scripts/perf-baseline/` are operational: `capture-cpu-prof.mjs`, `summarize-cpu-prof.mjs`, `capture-alloc-prof.mjs`, `capture-per-decision-cost.mjs`, `run-baseline.mjs`. Pre-Ticket-001 baselines exist at `reports/perf-baseline/<workload>-8203b4d023.json` and `reports/perf-baseline/<workload>-775e93568e.json` per Spec 192 ticket -003.
2. The five regressed workloads per Spec 192 §Aggregate Gain Projection: `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`. (The sixth workload `arvn-tournament-wasm-equivalence` is the flat control lane — not a recovery target, not re-measured.)
3. Spec 192 §4.2 per-workload protocol: 3 wall-clock runs, median + CV, plus CPU-prof + alloc-prof + per-decision-cost summaries persisted to `reports/perf-baseline/<workload>-<HEAD-sha>.json`.
4. Spec 192 §7 noise threshold: CV > 15% triggers 5-run sampling OR "noisy — defer" flag. Apply per workload.
5. Spec 192 trajectory-identity test passes (gated by ticket 001's acceptance) — ensures the harness measurements are replay-identical and uninstrumented runs match instrumented runs at the terminal state.
6. The harness already records `PolicyBytecodeVmUnsupportedError` in the CPU-prof top-30 self-time table (per `reports/perf-baseline/parity-drive-8203b4d023.json` lines 33-49). Post-ticket-001, the class is deleted; the harness should record either zero entries for the symbol OR record the replacement symbol (the `'unsupported'` early-return path) — verify either case and document in the report sub-section.

## Architecture Check

1. **No code changes, no architectural risk**: this ticket consumes existing harness infrastructure. The architectural soundness derives from Spec 192's already-established methodology. Foundation 8 / Foundation 16 satisfied by re-using a determinism-proven harness.
2. **Measurement is a checked-in artifact**: per-workload JSON summaries are durable evidence (mirrors Spec 192 ticket -003 disposition). Updates to the trigger report (`reports/fitl-perf-baseline-2026-05-24.md`) provide a navigable record from the original baseline through ticket 001's remediation to its measured gain.
3. **Gate semantics for ticket 003 are explicit**: the report sub-section records whether the per-spec acceptance threshold (Spec 193 §8 P3) is met; ticket 003's `Gate condition` references this explicit verdict, not auditor judgment.

## What to Change

### 1. Run the baseline harness on each of the five regressed workloads at HEAD (post-ticket-001)

For each of `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`:

```bash
node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>
```

(or the orchestrator-equivalent confirmed during implementation against the actual script signature). Capture 3-run median wall-clock + CV; capture CPU-prof + alloc-prof + per-decision-cost summaries.

If any workload's CV exceeds 15%, re-run with 5-run sampling per Spec 192 §7. If CV remains >15% after the 5-run re-run, flag the workload "noisy — defer" in the report sub-section; do not contribute to aggregate gain projection.

### 2. Persist per-workload JSON summaries

Output checked in to `reports/perf-baseline/<workload>-<HEAD-sha>.json` (matching Spec 192 ticket -003 format). The harness should produce these automatically; confirm format alignment with the pre-Ticket-001 baseline files (`reports/perf-baseline/<workload>-8203b4d023.json`).

Verify each JSON's `cpuProfTop30SelfTime` does NOT contain `PolicyBytecodeVmUnsupportedError` entries (the class is deleted in ticket 001); confirm the replacement code path (the `'unsupported'` early-return at `vm.ts:384` / `vm.ts:498` and the `resolveVmFallbackFeature` sentinel return at `policy-evaluation-core.ts:1388, 1390-1391, 1394`) accounts for the recovered time.

### 3. Compute measured gain per workload

For each regressed workload, compute:
- **Wall-clock reduction**: `(pre_median - post_median) / pre_median * 100`, comparing against `reports/perf-baseline/<workload>-8203b4d023.json` (pre-ticket-001 HEAD baseline).
- **`PolicyBytecodeVmUnsupportedError`-attributed self-time reduction**: combined self-time of the pre-deletion entries vs. post-deletion replacement (typically zero) divided by total CPU time.

Per-spec acceptance threshold (Spec 193 §8 P3): ≥10% individual wall-clock reduction OR ≥10% combined `PolicyBytecodeVmUnsupportedError`-attributed self-time reduction across the five regressed workloads.

### 4. Update the trigger report with a P3 measurement sub-section

Append to `reports/fitl-perf-baseline-2026-05-24.md` a new sub-section under the Findings Table (or as a sibling section after §Aggregate Gain Projection):

```
## Spec 193 P3 Measurement (YYYY-MM-DD)

**HEAD SHA**: <post-ticket-001 SHA>
**Workloads measured**: 5 (regressed lanes; flat wasm-equivalence not re-measured)

| Workload | Pre-001 median (ms) | Post-001 median (ms) | Wall-clock reduction | Unsupported-err self-time reduction | Threshold met (≥10% either)? |
|---|---:|---:|---:|---:|---|
| `parity-drive` | ... | ... | ... | ... | Yes/No |
| `bounded-termination-1002` | ... | ... | ... | ... | Yes/No |
| `diagnose-parity-runGame-1001` | ... | ... | ... | ... | Yes/No |
| `policy-preview-parity-arvn-1008` | ... | ... | ... | ... | Yes/No |
| `arvn-tournament-parallel` | ... | ... | ... | ... | Yes/No |

**Per-spec acceptance threshold**: <met / partially met / not met>
**Ticket 003 (P2) disposition**: <Implement / Close-Declined> per the gate condition in `tickets/193POLVMDISPRES-003.md`
**Spec 192 §4.5 escalation trigger**: <fires / does not fire>
```

The disposition recorded here is the explicit gate verdict ticket 003 consumes.

### 5. Record measured gain in the commit body

The commit landing this ticket records the per-workload measurement table and the threshold-met verdict in the commit body, per Spec 193 §8 P3 acceptance. This is a Git-history-resident record in addition to the in-repo report and JSON summaries.

## Files to Touch

- `reports/perf-baseline/parity-drive-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/bounded-termination-1002-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/diagnose-parity-runGame-1001-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/policy-preview-parity-arvn-1008-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/arvn-tournament-parallel-<HEAD-sha>.json` (new — captured by harness)
- `reports/fitl-perf-baseline-2026-05-24.md` (modify — append P3 measurement sub-section per change item 4)

## Out of Scope

- No engine source changes (ticket 001 owns those; ticket 003 owns the conditional negative cache).
- No re-measurement of the flat `arvn-tournament-wasm-equivalence` control lane (Spec 192 §Stop-Criterion confirms it as a guardrail, not a recovery target).
- No tightening of perf gates / lane budgets — that lands per Spec 193 §11 "Lane budget reversion" deferred-follow-up.
- No bytecode-VM expansion decision — only flagged if Spec 192 §4.5 escalation trigger fires; the actual expansion would be a separate spec.

## Acceptance Criteria

### Tests That Must Pass

1. Trajectory-identity test (Spec 192) remains green during harness runs (re-verified by the harness's own determinism checks).
2. All five JSON summaries land in `reports/perf-baseline/` with structure matching the Spec 192 baseline format (verify against `reports/perf-baseline/parity-drive-8203b4d023.json` as canonical template).
3. CV < 15% on all measured workloads (Spec 192 §7 noise threshold; if exceeded, document the re-run / defer decision in the report sub-section).
4. `reports/fitl-perf-baseline-2026-05-24.md` updated with the P3 measurement sub-section.
5. `pnpm run check:ticket-deps` green.

### Invariants

1. `PolicyBytecodeVmUnsupportedError` does NOT appear in any post-ticket-001 CPU profile's top-30 self-time table (the class is deleted; absence is the witness that ticket 001's refactor landed correctly).
2. State-hash byte-identity preserved across all five workloads (Foundation 8 — proven by the harness's own replay-identity machinery).

## Test Plan

### New/Modified Tests

No new test files authored — this ticket runs the Spec 192 harness and captures its output. The harness itself contains the determinism / smoke checks per Spec 192 ticket -002.

### Commands

1. `pnpm turbo build` (engine build prerequisite).
2. For each workload: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>` (or the actual orchestrator script signature; confirm during implementation).
3. Manual verification: spot-check at least one output JSON for `cpuProfTop30SelfTime` shape parity against the Spec 192 baseline files.
4. `pnpm run check:ticket-deps` (ticket integrity gate).
