# 195POLEVACON-003: Perf witness re-capture across 5 regressed FITL workloads (P3)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — measurement-only ticket consuming the Spec 192 baseline harness; output is JSON summaries and an appended report section.
**Deps**: `archive/tickets/195POLEVACON-001.md`

## Problem

Spec 195 §8 P3: after the inner-selector substructure-sharing wrapper lands (ticket 001) and the outer-state isolation invariant is proven (ticket 002), re-run the Spec 192 baseline harness on the five regressed FITL workloads to record measured gain attributable to the `policy-evaluation-core.ts:2040` site alone and determine whether the per-spec acceptance threshold is met (**≥5% individual wall-clock reduction on the heavy plan-primary workloads**, with GC self-time reduction counted toward the total).

The measurement gates two downstream decisions per Spec 195 §4.6 and §8 P3:
- Whether the two deferred inner-equivalent sites (`microturn-option-eval.ts:121`, `plan-proposal.ts:513`) are promoted to a P4 in this spec, or pushed to Spec 195-FOLLOWUP.
- Whether the staged-scope decision in §4.6 needs revisiting (e.g., the P1 site alone is insufficient and Option B `PolicyEvaluationScope` extraction becomes required for follow-on sites).

## Assumption Reassessment (2026-05-25)

1. Spec 192's baseline harness scripts under `packages/engine/scripts/perf-baseline/` are operational and were exercised by `archive/tickets/193POLVMDISPRES-002.md` at HEAD `a8f00d0d22`. Verified: `run-baseline.mjs`, `capture-cpu-prof.mjs`, `summarize-cpu-prof.mjs`, `capture-alloc-prof.mjs`, `capture-per-decision-cost.mjs`.
2. The five regressed workloads per Spec 192 §Aggregate Gain Projection and Spec 195 §8 P3: `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`. Verified against `packages/engine/scripts/perf-baseline/lib/workloads.mjs` — all five workload keys present. (The sixth workload `arvn-tournament-wasm-equivalence` is the flat control lane — not a recovery target, not re-measured.)
3. **Baseline reference for "gain attributable to the line 2040 site alone"**: the last clean baseline before any Spec 195 work landed is post-Spec-193 (HEAD `a8f00d0d22`). Verified: `reports/perf-baseline/<workload>-a8f00d0d22.json` exists for all five regressed workloads. Comparing post-001 against post-193 isolates the Spec 195 P1 mechanism's contribution; comparing post-001 against pre-Spec-190 (`*-775e93568e.json`) would conflate the cross-spec recovery.
4. The trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) and the Spec 189 `policy-eval-cache-binding-dedup.test.ts` witness must both remain green during harness runs — verified as green in `archive/tickets/195POLEVACON-001.md` Outcome.
5. Spec 192 §4.2 per-workload protocol: 3 wall-clock runs, median + CV, plus CPU-prof + alloc-prof + per-decision-cost summaries persisted to `reports/perf-baseline/<workload>-<HEAD-sha>.json`.
6. Spec 192 §7 noise threshold: CV > 15% triggers 5-run sampling OR "noisy — defer" flag. Apply per workload.
7. **`PolicyEvaluationContext` is the symbol to track in the CPU-prof top-30 self-time tables**. Pre-001 entries in `reports/perf-baseline/<workload>-8203b4d023.json` show 8.5s / 5.4% in `parity-drive` and 32.3s / 5.7% in `bounded-termination-1002`. Post-001 entries should reflect the heavy-substructure-reuse path — the constructor may still appear but with reduced self-time on the inner-fall-through fraction. Adjacent GC self-time should also drop on the same workloads.
8. The untracked pre-existing perf byproducts at `reports/perf-baseline/{alloc-prof,cpu-prof,per-decision}/` and the smoke JSONs `parity-drive-a35be6032b-smoke.json` (post-001 smoke at SHA `a35be6032b`) / `parity-drive-e8c4d26237-smoke.json` (post-002 smoke at SHA `e8c4d26237`) are leftover smoke captures from the 001/002 implementation sessions. They are NOT this ticket's deliverables; this ticket produces full (non-smoke) 3-run baselines at the post-002 HEAD.

## Architecture Check

1. **No code changes, no architectural risk**: this ticket consumes existing harness infrastructure. The architectural soundness derives from Spec 192's already-established methodology. Foundation #8 / Foundation #16 satisfied by re-using a determinism-proven harness.
2. **Measurement is a checked-in artifact**: per-workload JSON summaries are durable evidence (mirrors `archive/tickets/193POLVMDISPRES-002.md` and Spec 192 ticket -003 disposition). The appended sub-section to the trigger report provides a navigable record from the original 2026-05-24 baseline through ticket 001's remediation to its measured gain.
3. **Gate semantics for the §4.6 promotion decision are explicit**: the report sub-section records whether the per-spec acceptance threshold (Spec 195 §8 P3) is met per workload; the §4.6 promotion verdict (P4-in-spec vs. Spec 195-FOLLOWUP vs. no follow-up) is recorded explicitly in the sub-section so any future ticket consuming this verdict references a written disposition, not auditor judgment.
4. **Engine-agnostic** (Foundation #1): measurement infrastructure is generic; the workloads happen to be FITL/ARVN but the harness itself is game-agnostic.

## What to Change

### 1. Run the baseline harness on each of the five regressed workloads at post-002 HEAD

For each of `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`:

```bash
pnpm turbo build
node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>
```

Capture 3-run median wall-clock + CV; capture CPU-prof + alloc-prof + per-decision-cost summaries.

If any workload's CV exceeds 15%, re-run with 5-run sampling per Spec 192 §7 via the `--runs 5` flag (`node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload> --runs 5`). If CV remains >15% after the 5-run re-run, flag the workload "noisy — defer" in the report sub-section; do not contribute to aggregate gain projection.

### 2. Persist per-workload JSON summaries

Output checked in to `reports/perf-baseline/<workload>-<HEAD-sha>.json` (matching Spec 192 ticket -003 format and the post-Spec-193 captures at `*-a8f00d0d22.json`). The harness produces these automatically at `REPORT_ROOT` per `run-baseline.mjs:74`; confirm format alignment with the post-Spec-193 baseline files.

Inspect each JSON's `cpuProfTop30SelfTime` for the `PolicyEvaluationContext` constructor entry. The expected post-001 shape: the constructor self-time fraction is reduced because the line 2040 fall-through no longer pays the full constructor cost; adjacent GC self-time on the same workload should also drop. Document the observed shape (`PolicyEvaluationContext`-attributed self-time delta + GC self-time delta) in the report sub-section per change item 4.

### 3. Compute measured gain per workload

For each regressed workload, compute:

- **Wall-clock reduction**: `(post_193_median - post_195_median) / post_193_median * 100`, comparing against `reports/perf-baseline/<workload>-a8f00d0d22.json` (post-Spec-193 / pre-Spec-195 baseline — last clean baseline before this spec's mechanism landed).
- **`PolicyEvaluationContext` constructor self-time reduction**: pre-195 constructor self-time vs. post-195 constructor self-time, expressed both as absolute (seconds) and as percentage of total CPU time. Pull from `cpuProfTop30SelfTime` entries in both JSONs.
- **GC self-time reduction**: pre-195 GC self-time vs. post-195 GC self-time, expressed both as absolute (seconds) and as percentage of total CPU time. GC self-time reduction counts toward the §8 P3 threshold per Spec 195 §8 P3's explicit clause ("with GC self-time reduction counted toward the total").

**Per-spec acceptance threshold** (Spec 195 §8 P3): **≥5% individual wall-clock reduction on the heavy plan-primary workloads** (with GC self-time reduction counted toward the total). The "heavy plan-primary workloads" matches the Spec 192 Finding row 3 lane scope: `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`.

### 4. Update the trigger report with a P3 measurement sub-section

Append to `reports/fitl-perf-baseline-2026-05-24.md` a new sub-section after the existing `## Spec 193 P3 Measurement (2026-05-24)` sub-section, formatted as:

```
## Spec 195 P3 Measurement (YYYY-MM-DD)

**HEAD SHA**: <post-002 SHA>
**Workloads measured**: 5 (regressed lanes; flat wasm-equivalence not re-measured)
**Command**: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>` after `pnpm turbo build`

| Workload | Post-193 median (ms) | Post-195 median (ms) | Post CV | Wall-clock reduction | PolicyEvaluationContext self-time reduction | GC self-time reduction | Threshold met (≥5% wall-clock incl. GC)? | JSON trace |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `parity-drive` | ... | ... | ... | ... | ... | ... | Yes/No | `reports/perf-baseline/parity-drive-<sha>.json` |
| `bounded-termination-1002` | ... | ... | ... | ... | ... | ... | Yes/No | `reports/perf-baseline/bounded-termination-1002-<sha>.json` |
| `diagnose-parity-runGame-1001` | ... | ... | ... | ... | ... | ... | Yes/No | `reports/perf-baseline/diagnose-parity-runGame-1001-<sha>.json` |
| `policy-preview-parity-arvn-1008` | ... | ... | ... | ... | ... | ... | Yes/No | `reports/perf-baseline/policy-preview-parity-arvn-1008-<sha>.json` |
| `arvn-tournament-parallel` | ... | ... | ... | ... | ... | ... | Yes/No | `reports/perf-baseline/arvn-tournament-parallel-<sha>.json` |

**Per-spec acceptance threshold**: <met / partially met / not met>
**§4.6 follow-on-site disposition**: <No follow-up needed (threshold met cleanly) / Promote `microturn-option-eval.ts:121` + `plan-proposal.ts:513` to P4 in this spec / Open Spec 195-FOLLOWUP for the broader scope>. Rationale: <one-paragraph justification citing per-workload deltas and the staged-scope decision in §4.6>.
**Spec 192 §4.5 escalation trigger**: <fires / does not fire>
```

The §4.6 disposition recorded here is the explicit verdict that any future follow-up ticket (a P4-in-spec or a Spec 195-FOLLOWUP root) consumes.

### 5. Record measured gain in the commit body

The commit landing this ticket records the per-workload measurement table and the threshold-met verdict in the commit body, per Spec 195 §8 P3 acceptance. This is a Git-history-resident record in addition to the in-repo report and JSON summaries.

## Files to Touch

- `reports/perf-baseline/parity-drive-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/bounded-termination-1002-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/diagnose-parity-runGame-1001-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/policy-preview-parity-arvn-1008-<HEAD-sha>.json` (new — captured by harness)
- `reports/perf-baseline/arvn-tournament-parallel-<HEAD-sha>.json` (new — captured by harness)
- `reports/fitl-perf-baseline-2026-05-24.md` (modify — append Spec 195 P3 Measurement sub-section per change item 4)

## Out of Scope

- No engine source changes (ticket 001 owns the mechanism; the §4.6 follow-on-site migration is owned by a future P4-in-spec or Spec 195-FOLLOWUP ticket depending on this ticket's verdict).
- No re-measurement of the flat `arvn-tournament-wasm-equivalence` control lane (Spec 192 §Stop-Criterion confirms it as a guardrail, not a recovery target).
- No tightening of perf gates / lane budgets — separate deferred follow-up per any Spec 195 lane budget reversion that may be authored later.
- No bytecode-VM expansion or WASM-expansion decision — only flagged if Spec 192 §4.5 escalation trigger fires; the actual expansion would be a separate spec.
- No promotion of the deferred sites in this ticket — the §4.6 disposition recorded here is a verdict, not an implementation. If "Promote to P4 in this spec" or "Open Spec 195-FOLLOWUP" is chosen, that authoring is a separate follow-up.
- No cleanup of the pre-existing untracked perf byproducts at `reports/perf-baseline/{alloc-prof,cpu-prof,per-decision}/` and the smoke JSONs (`parity-drive-a35be6032b-smoke.json`, `parity-drive-e8c4d26237-smoke.json`) — those are leftover from 001/002 implementation sessions and out of scope here.

## Acceptance Criteria

### Tests That Must Pass

1. Trajectory-identity test (Spec 192) remains green during harness runs (re-verified by the harness's own determinism checks; matches `archive/tickets/195POLEVACON-001.md` Outcome verification).
2. All five JSON summaries land in `reports/perf-baseline/` with structure matching the Spec 192 baseline format (verify against `reports/perf-baseline/parity-drive-a8f00d0d22.json` as canonical post-Spec-193 template).
3. CV < 15% on all measured workloads (Spec 192 §7 noise threshold; if exceeded, document the re-run / defer decision in the report sub-section).
4. `reports/fitl-perf-baseline-2026-05-24.md` updated with the Spec 195 P3 Measurement sub-section including the per-workload measurement table, the per-spec acceptance threshold verdict, the §4.6 follow-on-site disposition with rationale, and the Spec 192 §4.5 escalation-trigger decision.
5. `pnpm run check:ticket-deps` green.

### Invariants

1. State-hash byte-identity preserved across all five workloads (Foundation #8 — proven by the harness's own replay-identity machinery and by the determinism corpus already pinned green for ticket 001).
2. Each captured JSON summary's `caveats` array is empty OR the non-empty caveats are explicitly recorded in the report sub-section (matches `archive/tickets/193POLVMDISPRES-002.md` precedent — JSON-level caveats are surfaced in the human-readable report).
3. The post-195 `PolicyEvaluationContext` constructor self-time in the heavy plan-primary workloads is less than the post-Spec-193 baseline (the mechanism MUST produce measurable constructor self-time reduction on the targeted site, even if wall-clock impact is dampened by adjacent costs). Document the absolute and percentage delta in the report sub-section.

## Test Plan

### New/Modified Tests

No new test files authored — this ticket runs the Spec 192 harness and captures its output. The harness itself contains the determinism / smoke checks per Spec 192 ticket -002.

### Commands

1. `pnpm turbo build` (engine build prerequisite; the harness consumes compiled `dist/test/...` files).
2. For each of the five regressed workloads: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>` (re-run with `--runs 5` if CV exceeds 15% per change item 1).
3. Manual JSON spot-check: confirm `cpuProfTop30SelfTime` shape parity against `reports/perf-baseline/parity-drive-a8f00d0d22.json` for at least one output; confirm the `PolicyEvaluationContext` constructor entry's reduced self-time on the targeted workloads.
4. `pnpm run check:ticket-deps` (ticket integrity gate).

## Outcome

Completed on 2026-05-25.

- Ran `pnpm turbo build` before the perf harness; engine and engine-wasm replayed cached build outputs and runner rebuilt successfully.
- Captured full non-smoke Spec 192 baseline summaries at HEAD `de6d82e538` for all five regressed workloads:
  - `reports/perf-baseline/parity-drive-de6d82e538.json`
  - `reports/perf-baseline/bounded-termination-1002-de6d82e538.json`
  - `reports/perf-baseline/diagnose-parity-runGame-1001-de6d82e538.json`
  - `reports/perf-baseline/policy-preview-parity-arvn-1008-de6d82e538.json`
  - `reports/perf-baseline/arvn-tournament-parallel-de6d82e538.json`
- Appended `## Spec 195 P3 Measurement (2026-05-25)` to `reports/fitl-perf-baseline-2026-05-24.md` with the per-workload measurement table, threshold verdict, §4.6 follow-on-site disposition, and Spec 192 §4.5 escalation-trigger decision.
- The first sandboxed `parity-drive` attempt failed with `Unexpected end of JSON input` from nested profiler JSON parsing; the exact command was rerun outside the sandbox and completed. No accepted JSON came from the failed attempt.
- All accepted JSON summaries have empty `caveats` arrays and CV below the 15% noise threshold, so no 5-run reruns were required.
- Per-spec acceptance threshold met: every workload exceeded the >=5% individual wall-clock reduction target:
  - `parity-drive`: 21.9% wall-clock reduction.
  - `bounded-termination-1002`: 21.4% wall-clock reduction.
  - `diagnose-parity-runGame-1001`: 15.1% wall-clock reduction.
  - `policy-preview-parity-arvn-1008`: 29.2% wall-clock reduction.
  - `arvn-tournament-parallel`: 28.9% wall-clock reduction.
- §4.6 disposition: no follow-up needed for the current Spec 195 acceptance gate. The deferred `microturn-option-eval.ts:121` and `plan-proposal.ts:513` sites are not promoted to P4 and no Spec 195-FOLLOWUP ticket is opened by this P3 result.
- Generated-artifact provenance: the retained generator is `packages/engine/scripts/perf-baseline/run-baseline.mjs`; canonical inputs are the five workload keys from `packages/engine/scripts/perf-baseline/lib/workloads.mjs`, current HEAD `de6d82e538`, and post-Spec-193 comparison JSONs `reports/perf-baseline/*-a8f00d0d22.json`; artifacts are checked in because the ticket requires durable measurement evidence.
- The untracked profiler byproduct directories under `reports/perf-baseline/{alloc-prof,cpu-prof,per-decision}/` and the pre-existing smoke JSONs remain out of scope for this ticket and are not required checked-in deliverables.

Verification:

- `pnpm turbo build` — passed.
- `node packages/engine/scripts/perf-baseline/run-baseline.mjs parity-drive` — first sandboxed attempt failed with `Unexpected end of JSON input`; unsandboxed rerun passed and wrote `reports/perf-baseline/parity-drive-de6d82e538.json`.
- `node packages/engine/scripts/perf-baseline/run-baseline.mjs bounded-termination-1002` — passed; wrote `reports/perf-baseline/bounded-termination-1002-de6d82e538.json`.
- `node packages/engine/scripts/perf-baseline/run-baseline.mjs diagnose-parity-runGame-1001` — passed; wrote `reports/perf-baseline/diagnose-parity-runGame-1001-de6d82e538.json`.
- `node packages/engine/scripts/perf-baseline/run-baseline.mjs policy-preview-parity-arvn-1008` — passed; wrote `reports/perf-baseline/policy-preview-parity-arvn-1008-de6d82e538.json`.
- `node packages/engine/scripts/perf-baseline/run-baseline.mjs arvn-tournament-parallel` — passed; wrote `reports/perf-baseline/arvn-tournament-parallel-de6d82e538.json`.
- JSON shape/CV spot-check against `reports/perf-baseline/parity-drive-a8f00d0d22.json` — passed for all five post-195 JSON summaries; every `headSha` is `de6d82e538`, every `smoke` field is `false`, and every CV is below 15%.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2514 archived tickets.
- `git diff --check -- .codex/run-state/implement-spec-tickets.json archive/specs/195-policy-evaluation-context-allocation-reduction.md reports/fitl-perf-baseline-2026-05-24.md archive/tickets/195POLEVACON-003.md` — passed before archive-path repair; final archive-path rerun is recorded in the harness closeout.
- Pre-archive untracked hygiene check over then-active `tickets/195POLEVACON-003.md` and the five new JSON summaries — passed; no trailing whitespace and all JSON parsed.
- Late-edit proof validity: final ticket proof transcription only; no source, acceptance threshold, command coverage, dependency ownership, follow-up disposition, or generated-artifact content changed after the final harness lane.
