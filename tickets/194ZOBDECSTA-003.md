# 194ZOBDECSTA-003: Phase 3 — Re-capture Zobrist perf witness and archive Spec 194

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign tooling + report only
**Deps**: `archive/tickets/194ZOBDECSTA-002.md`

## Problem

Spec 194 §8 Phase 3 requires a perf-witness re-capture after the lever 2B encoded-surface reduction lands: "Re-run Spec 192 baseline harness on the five regressed workloads at post-remediation HEAD; record measured gain; named gain target is ≥10% individual wall-clock reduction OR ≥15% combined reduction in Zobrist-trio self-time across the five regressed workloads." This ticket delivers that re-capture as a checked-in Phase 3 report, evaluates the measured gain against the spec's named target, and (if the target is met) archives Spec 194 per `docs/archival-workflow.md`.

The Phase 2 ticket (`archive/tickets/194ZOBDECSTA-002.md`) lands the canonical encoding change but does not measure its effect. Phase 3 is the witness: it converts the encoded-surface shrink into a wall-clock and self-time delta against the Phase 1 baseline (`reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`) and the spec's source-of-truth profile (`reports/fitl-perf-baseline-2026-05-24.md`).

## Assumption Reassessment (2026-05-25)

1. **Baseline source**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table row 2 names the per-workload Zobrist-trio self-times this ticket compares against: `parity-drive` 37.5s / 23.8%, `bounded-termination-1002` 142.3s / 25.2%, `diagnose-parity-runGame-1001` 72.2s / 23.4%, `policy-preview-parity-arvn-1008` 51.2s / 19.7%, `arvn-tournament-parallel` 32.8s / 12.7%. The flat control lane `arvn-tournament-wasm-equivalence` is excluded (Phase 1 scope precedent).
2. **Phase 1 instrumentation report at HEAD pre-002**: `reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`. The Phase 3 report cross-references both reports: the Spec 192 baseline (24-05) for absolute self-times and the Phase 1 residual-cost report (25-05) for encoded-chars-per-miss as the projected vs measured shrink target.
3. **Existing capture script**: `campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs` (Phase 1 deliverable) runs the five workloads under both profiled and unprofiled modes. Phase 3 either re-uses this script (post-002 run produces a new dated report at `reports/perf-baseline/zobrist-residual-cost-<POST-DATE>.md`) or adds a sibling Phase 3-specific script if the gain computation requires bespoke output formatting.
4. **Spec 192 baseline harness**: per spec §8 P3, the harness to re-run is the Spec 192 one (`campaigns/fitl-perf-optimization/run-benchmark.mjs` is the canonical entry per `archive/tickets/194ZOBDIGEST-001.md` Assumption Reassessment item 4). This ticket runs the Spec 192 harness on the five regressed workloads at post-002 HEAD; the gain is computed by subtraction from the 24-05 baseline.
5. **Five regressed workload set**: identical to the Phase 1 set per spec §4.1. The wasm-equivalence flat lane is excluded.
6. **Gain target evaluation**: per spec §8 P3: gain target is **≥10% individual wall-clock reduction OR ≥15% combined Zobrist-trio self-time reduction across the five regressed workloads**. The report must compute both metrics and explicitly evaluate target met / target missed for each.
7. **Archive workflow**: `docs/archival-workflow.md` is the canonical archive procedure; the spec is archived via `node scripts/archive-spec.mjs` (or equivalent) once Phase 3 confirms the gain target. The Spec 194 `Status` field must change from `IN-FLIGHT` (set by 002 Outcome) to `COMPLETED` in the same ticket Outcome.
8. **Gate condition**: if the Phase 3 measured gain falls short of the spec target, this ticket does NOT archive Spec 194 unilaterally. Instead, it records the measurement, flags the shortfall in the report, and applies the 1-3-1 rule (per global `CLAUDE.md`): the user is presented with 3 options — (A) accept the shortfall and archive Spec 194 with the measured gain documented, (B) open a new follow-on spec for additional levers (2A or 2C), (C) reconsider the field-irrelevance audit and add additional Drops. The default outcome is option (A) per the spec's tolerance for partial gains.
9. **No engine source drift in this ticket**: deliverable is a Phase 3 report + (potentially) a spec archive move. No `packages/engine/src/` or `packages/engine/test/` files are modified by this ticket.

## Architecture Check

1. **Pure observation, zero engine source drift**: deliverable is one new markdown report and (conditionally) the Spec 194 archive move. No changes to `packages/engine/src/` or `packages/engine/test/`. The Foundation #8 sacred guarantee is preserved by construction (no behavioral change).
2. **Witness completes the Spec 194 phase plan**: per spec §8, Phase 3 is the named perf witness. Without it, the Phase 2 cut lacks a measured gain artifact and Spec 194 cannot be archived (Foundation #15: architectural completeness).
3. **No backwards-compatibility aliasing/shims introduced**: deliverable is one new file + a status update. Nothing wrapped, aliased, or marked deprecated.

## What to Change

### 1. New Phase 3 report `reports/perf-baseline/zobrist-residual-cost-phase3-<YYYY-MM-DD>.md`

Filename date set at run time. Required sections:

1. **Per-workload measured self-times at post-002 HEAD** — re-run the Spec 192 baseline harness (`campaigns/fitl-perf-optimization/run-benchmark.mjs`) on the five regressed workloads. Record per-workload Zobrist-trio self-time (`digestEncodedDecisionStackFrame` + `encodeDecisionStackFrameDigestInput` + `zobristKey`) and wall-clock.
2. **Per-workload delta against the 24-05 baseline** — for each workload, compute absolute self-time delta (s), percentage self-time reduction, absolute wall-clock delta (s), percentage wall-clock reduction. Cite the 24-05 baseline values verbatim from `reports/fitl-perf-baseline-2026-05-24.md`.
3. **Encoded-surface delta against the 25-05 Phase 1 baseline** — re-run the Phase 1 capture script (`campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`) at post-002 HEAD; record the new mean encoded-chars-per-miss per workload and the percentage shrink versus the 25-05 baseline (23 647.62 chars/miss aggregate). This validates that the surface-reduction lever delivered the projected encoded-bytes shrink (the audit's size projection from `archive/tickets/194ZOBDECSTA-001.md`).
4. **Gain target evaluation** — per spec §8 P3:
   - Individual gate: list per workload whether the wall-clock reduction is ≥10%.
   - Combined gate: aggregate Zobrist-trio self-time reduction across all five regressed workloads; record whether it is ≥15%.
   - Single explicit verdict line: `Target met` / `Target missed (partial gain)`.
5. **Final state hash determinism check** — verify that the final state hash of each workload matches between profiled and unprofiled runs (per the Phase 1 boundary discipline). Mismatch is a hard fail and indicates a determinism regression introduced by the Phase 2 cut.
6. **Archive recommendation** — if the gate is met, recommend archiving Spec 194. If the gate is missed, list the three options from §Assumption Reassessment item 8 and defer to the user.

### 2. (Conditional) Spec 194 archive

If the §1 verdict is `Target met`:

- Move `specs/194-zobrist-decision-stack-digest-optimization.md` to `archive/specs/` per `docs/archival-workflow.md`.
- Append the Outcome note to the spec's bottom section: `Phase 3 gain witness: <X>% combined Zobrist-trio self-time reduction; archived <YYYY-MM-DD>.`
- Update the spec back-link section (per `/spec-to-tickets` Step 8 canonical format) so the three Phase 2 tickets appear under `## Tickets`.

If the §1 verdict is `Target missed`:

- Do not archive Spec 194 in this ticket. Apply the 1-3-1 rule and present the user with the three options enumerated in §Assumption Reassessment item 8.
- Record the user's chosen option in this ticket's Outcome.

### 3. Determinism verification (post-re-capture)

Confirm zero regression in the three existing proof surfaces named in spec §6:

- Replay-identity corpus (`packages/engine/test/determinism/`) — 100% green.
- Spec 168 frame-digest-cache equivalence (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) — 100% green.
- Spec 192 trajectory-identity (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) — 100% green across all six workloads.
- New Spec 194 byte-identity invariant (`packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts`, from 002) — 100% green.

Pure observation cannot regress these; the verification confirms the contract.

## Files to Touch

- `reports/perf-baseline/zobrist-residual-cost-phase3-<YYYY-MM-DD>.md` (new; filename date set at run time)
- `archive/specs/194-zobrist-decision-stack-digest-optimization.md` (conditional — moved from `specs/` if target met)

## Out of Scope

- **Any change to `packages/engine/src/` or `packages/engine/test/` source files** — Phase 3 is observation-only.
- **Re-applying the audit or re-blessing fixtures** — those are owned by tickets `194ZOBDECSTA-001` and `194ZOBDECSTA-002` respectively.
- **Opening a new spec for additional levers** — if the gate is missed and the user chooses option (B) per §Assumption Reassessment item 8, a follow-on spec is authored in a separate session, not in this ticket.
- **Engine-WASM Zobrist parity** — out of scope per spec §2.

## Acceptance Criteria

### Tests That Must Pass

1. Replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green.
2. Spec 168 frame-digest-cache equivalence test runs unchanged — 100% green.
3. Spec 192 trajectory-identity test runs unchanged across all six workloads — 100% green.
4. Spec 194 byte-identity invariant (`packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts`) — 100% green.
5. Full engine suite: `pnpm -F @ludoforge/engine run test` — 100% green.

### Invariants

1. **Zero engine source drift**: `git diff packages/engine/src/ packages/engine/test/` is empty after the ticket lands — Phase 3 is observation-only.
2. **Report format**: the Phase 3 report conforms to the six required sections in §What to Change item 1 (per-workload measured table, delta against 24-05, encoded-surface delta against 25-05, gain target evaluation, final-hash determinism check, archive recommendation).
3. **Final-hash determinism**: every workload's profiled and unprofiled final state hash matches — if any mismatch, the ticket is blocked and the issue is escalated to the user before archive.
4. **Archive gate enforced**: Spec 194 is moved to `archive/specs/` only if the gain target is met per spec §8 P3; otherwise the user's 1-3-1 chosen option is recorded and archive is skipped.

## Test Plan

### New/Modified Tests

1. No new automated tests — this is an observation deliverable per spec §9.
2. Manual end-to-end verification: re-run the capture script and the Spec 192 harness, confirm both reports are produced, confirm per-workload tables are populated with non-zero values, confirm the gain target evaluation is explicit.

### Commands

1. Build engine: `pnpm turbo build`.
2. Re-run Phase 1 capture script at post-002 HEAD: `node campaigns/fitl-perf-optimization/capture-zobrist-residual-cost.mjs`.
3. Re-run Spec 192 baseline harness at post-002 HEAD: `node campaigns/fitl-perf-optimization/run-benchmark.mjs` (or current canonical entry per `archive/tickets/194ZOBDIGEST-001.md`).
4. Verify zero engine source drift: `git diff packages/engine/src/ packages/engine/test/` — must be empty.
5. Verify existing test suites green: `pnpm -F @ludoforge/engine run test`.
6. Lint + typecheck (project canonical): `pnpm turbo lint typecheck`.
7. Dependency integrity: `pnpm run check:ticket-deps`.
8. (Conditional) Archive Spec 194: `node scripts/archive-spec.mjs specs/194-zobrist-decision-stack-digest-optimization.md archive/specs/` (or equivalent per `docs/archival-workflow.md`).
