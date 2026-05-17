# 177POLWASMBATCH-003: Slow-tier wall-time witness + 5% improvement gate

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — measurement and reporting only
**Deps**: `archive/tickets/177POLWASMBATCH-002.md`

## Problem

Spec 177's notional success threshold (line `9`) is "a measured slow-tier FITL ARVN 15-seed policy-agent wall-time improvement of at least 5% versus the current WASM-on baseline, with route activation counters proving the batched path ran and parity tests proving score/preview outputs still match the authoritative TypeScript path." Ticket `002` lands the batched path, its parity tests, and the new route-activation counter, but does not by itself produce the wall-time witness against the Phase 0 baseline. This ticket re-runs the 15-seed profiler on the post-`002` codebase, computes the slow-tier wall-time delta against `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.md`, asserts route-activation counter behavior, and writes the witness report that closes the spec.

## Blocked State (2026-05-17)

`archive/tickets/177POLWASMBATCH-001.md` produced `reports/177-phase-0-batching-shape-selection.md` with verdict `no-transfer-reduction-shape-authorized`, and `archive/tickets/177POLWASMBATCH-002.md` is closed as `NOT IMPLEMENTED`. There is no selected implementation shape and no new route-activation counter for this witness to measure.

This ticket is closed as `NOT IMPLEMENTED`. Do not revive it by unblocking `002`; any future wall-time witness should belong to a new spec or investigation chain with a newly measured implementation hypothesis.

## Outcome (2026-05-17)

**Final status:** `NOT IMPLEMENTED`.

Ticket `177POLWASMBATCH-002` was not implemented because `177POLWASMBATCH-001` found no authorized transfer-reduction shape. There is therefore no batched route, no route-activation counter, and no post-implementation wall-time witness for this ticket to measure.

No report artifacts from this ticket landed. Any future wall-time witness should belong to a new spec or investigation chain with a newly measured implementation hypothesis.

**Verification:** `pnpm run check:ticket-deps` passed after the terminal status update and archive-path rewrite.

## Assumption Reassessment (2026-05-17)

1. The Phase 0 WASM-on baseline report `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.md` (and its CSV companion `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv`) exists and contains per-seed wall-time columns. **Confirmed.**
2. The slow-tier seed set per `reports/176-phase-1-ffi-marshaling-decomposition.md` line `33` is `1005, 1011, 1008, 1013, 1009`. The witness must use the same five seeds for comparability. **Confirmed.**
3. The profiler script `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` accepts `--seeds`, `--timeout-ms`, and `--date` arguments and writes its outputs to `reports/fitl-arvn-15-seed-decomposition-<date>.{md,csv}`. **Confirmed.**
4. Ticket `002` adds a new entry to `PolicyWasmTimingRouteClass` and a corresponding route-activation counter; both are exposed in the profiler output. **Pending ticket `002` completion.**
5. Ticket `001`'s `reports/177-phase-0-batching-shape-selection.md` named exactly one transfer-reduction shape and a predicted ROI; the witness must compare its measured ROI against both the spec's ≥5% bar and `001`'s prediction. **Pending ticket `001` completion.**

## Architecture Check

1. **Measurement, not implementation.** This ticket adds no code paths; it only runs the existing profiler script and reads its output. No risk of breaking determinism, parity, or Foundation #20 carriers.
2. **Honest gate enforcement.** The ≥5% bar is the spec's named success threshold. If the measured improvement is `<5%`, the ticket MUST NOT round, soften, cherry-pick seeds, or report an aggregate that hides the gap. Ticket fidelity (per `CLAUDE.md`) requires the report to call out the discrepancy and apply the 1-3-1 rule to the user.
3. **Comparability discipline.** The post-`002` run uses the same seed set, the same timeout, and (ideally) the same machine class as the Phase 0 baseline. Any deviation is noted in the report.
4. **Witness, not retirement decision.** Per `reports/176-phase-6-decision-and-rationale.md` line `13`, this work is "a targeted acceleration decision," not a default-flip or retirement decision. The witness either confirms the acceleration cleared the bar or it does not; either way, it does not by itself authorize WASM retirement or default-routing changes.

## What to Change

### 1. Re-capture the slow-tier wall-time witness

After `002` is merged, run:

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-7-batched
```

This produces:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.csv`

If the post-`002` codebase lands on a date other than 2026-05-17, substitute the actual date in the `--date` argument and in the report filenames; the report's commit date and the witness's `--date` should match.

### 2. Compute slow-tier wall-time delta

Slow-tier seeds: `1005, 1011, 1008, 1013, 1009`.

Baseline source: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv`.
Post-`002` source: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.csv` (or the dated equivalent).

Compute:

- Per-seed wall-time delta (post − baseline) in ms.
- Slow-tier total wall-time delta in ms.
- Slow-tier percent improvement: `1 - (post slow-tier total / baseline slow-tier total)`.
- Per-seed route-activation counter for the new batched variant (must be `>0` for at least the slow-tier subset).

### 3. Read route-activation counters

From the post-`002` CSV, confirm:

- The new route-activation counter (named by `002`) is `>0` on slow-tier seeds (proves the batched path ran).
- The unsupported counter for the new variant stays low; if non-zero, the report documents which unsupported shapes were hit so the user can decide whether the fallback ratio is acceptable.
- Existing counters (`productionPreviewDriveRouteCount`, `productionPreviewCandidateFeatureRowRouteCount`, etc. per `policy-wasm-runtime-counters.ts:72-145`) shift in the expected direction: if shape A consolidates `productionPreviewDrive` batches, the legacy per-group counter drops to zero or to the unsupported-fallback count.

### 4. Write the witness report

`reports/177-wall-time-witness.md` containing:

- **Header**: date, command line, baseline source, post-`002` source, spec link, ticket link.
- **Verdict**: `pass` (≥5% slow-tier improvement) or `gate-not-met` (<5%).
- **Slow-tier wall-time table**: per-seed baseline ms, post ms, delta ms, delta percent, totals row.
- **All-seed wall-time table**: same columns for the full 15-seed set (informational; the gate is slow-tier only).
- **Route-activation counter snapshot**: per-seed counter values for the new variant and the prior route(s) that the new path replaces.
- **Foundation #20 carrier health**: per-route advisory counts (`POLICY_PREVIEW_SIGNAL_UNAVAILABLE`, `tiebreakAfterPreviewNoSignal` totals) — must be unchanged or improved vs baseline; any regression is called out explicitly.
- **Phase 1 + Phase 5 overhead reduction**: the new run's `marshaling ms` / `execution ms` / `deserialization ms` totals per route compared against the Phase 1 baseline (`reports/176-phase-1-ffi-marshaling-decomposition.md`) and Phase 5 totals (`reports/176-phase-5-state-serialization.md`); confirms which overhead bucket actually shrank.
- **Prediction vs measurement**: the predicted ROI from `reports/177-phase-0-batching-shape-selection.md` next to the measured slow-tier improvement; report the gap honestly.
- **Verdict commentary**: if `pass`, name the closing condition for the spec. If `gate-not-met`, present 1-3-1 to the user (e.g., 1: further-investigation follow-up; 2: re-scope spec threshold; 3: descope/revert ticket `002`).

### 5. Gate condition handling

- If measured slow-tier improvement is `≥5%` AND the new route-activation counter is `>0` on every slow-tier seed AND no Foundation #20 carrier regression: mark the active successor spec ready to archive. This archived ticket does not perform that future archival.
- If the gate is not met: do **not** silently archive. Present the 1-3-1 in the report and in the ticket Outcome; downstream tickets/decisions are owned by the user.

## Files to Touch

- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.md` (new — profiler script output; date adjusted if `002` lands on a different date)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.csv` (new — profiler script output)
- `reports/177-wall-time-witness.md` (new — witness and verdict report)

## Out of Scope

- Implementing additional transfer-reduction shapes if the gate is not met. That decision is owned by the user and would generate a new ticket (or a re-scope of the spec).
- Archiving spec 177. Per `docs/archival-workflow.md`, archival is its own step after the spec's deliverables are complete and the user confirms.
- Cross-game generalization. FITL ARVN 15-seed is the explicitly-named witness in spec line `9`.
- Changing the slow-tier seed set. Comparability with the Phase 0 baseline requires the same five seeds.
- Modifying the profiler script. Any column additions belong in tickets `001` and `002`; this ticket only consumes the script's output.

## Acceptance Criteria

### Tests That Must Pass

1. The full engine suite still passes: `pnpm turbo test`. (No new code paths added here, but determinism and parity must still hold against the post-`002` codebase.)
2. `pnpm -F @ludoforge/engine test --test-name-pattern "policy-wasm.*equivalence"` — parity tests added in `002` still pass.
3. The profiler script completes without timeout on all 15 seeds within the `--timeout-ms 600000` budget.

### Invariants

1. **Reported delta is the measured delta.** No rounding, no aggregation tricks, no seed cherry-picking. The slow-tier total is the sum of the same five seeds the baseline used.
2. **Route-activation counter `>0`.** The new batched variant's counter increments on every slow-tier seed; a zero counter on any slow-tier seed invalidates the witness even if wall-time improved (the improvement might be attributable to something other than the batched path).
3. **Foundation #20 carrier counts non-regressing.** `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory counts and `tiebreakAfterPreviewNoSignal` totals do not increase materially vs baseline; any regression is called out explicitly in the verdict commentary.
4. **Spec ≥5% bar is the gate, not the target.** If measured at `<5%`, the verdict is `gate-not-met`, not "close enough."

## Test Plan

### New/Modified Tests

No new automated tests in this ticket. The witness itself is the proof; the parity tests are owned by ticket `002`. If a future invariant emerges from the witness (e.g., "slow-tier wall-time stays within X ms of the new baseline"), it would be a follow-up ticket.

### Commands

1. `pnpm turbo build`
2. `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-7-batched`
3. `pnpm turbo test`
4. Manual diff: open `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on-timed.csv` and `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-7-batched.csv` side-by-side; compute slow-tier wall-time delta; populate `reports/177-wall-time-witness.md`.
