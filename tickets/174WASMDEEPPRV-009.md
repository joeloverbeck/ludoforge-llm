# 174WASMDEEPPRV-009: Phase 4a — Perf-witness rerun and gate decision

**Status**: COMPLETED — Phase 4 gate decision recorded Fail; residual owner 014
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — measurement and gate-decision ticket
**Deps**: `archive/tickets/174WASMDEEPPRV-011.md`

## Problem

Spec 174 Acceptance Criterion #5 requires that the 15-seed decomposition witness is rerun after production activation and records both activation counters and the residual elapsed metrics. Spec 174 §4 Phase 4 row says the witness "improves the Spec 173 residual materially, or records a new architectural blocker with exact unsupported classes and next owner." This ticket reruns the witness after Phase 3a broad activation telemetry (`archive/tickets/174WASMDEEPPRV-008.md`), the Phase 3b prerequisite state-patch ABI (`archive/tickets/174WASMDEEPPRV-012.md`), the `chooseNStep` continuation materialization prerequisite (`archive/tickets/174WASMDEEPPRV-013.md`), and Phase 3b deep materialized-state activation (`archive/tickets/174WASMDEEPPRV-011.md`) land, records the activation counters from ticket 001's instrumentation, and produces a gate-decision report. The gate result determines whether ticket 010 proceeds (default flip + A/B deletion) or descopes with an escalation report.

## Assumption Reassessment (2026-05-16)

1. Confirmed witness script exists at `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`; post-008 baseline at `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md` records slowest seed `1005` at 75,311 ms.
2. Confirmed activation counters (`getProductionPolicyWasmPreviewDriveRouteCount`, `getProductionPolicyWasmPreviewDriveUnsupportedCount`) are exported from `policy-wasm-runtime.ts` after ticket 001 lands; broad counter activation is handled by ticket 008, action-pipeline state-patch ABI substrate is prerequisite-owned by ticket 012, `chooseNStep` continuation materialization is prerequisite-owned by ticket 013, and full deep activation is owned by ticket 011.
3. Spec 173 soft target was `<=60 s` per-seed; "materially improves" is defined as the slow-tier (`1005`, `1011`, `1008`, `1013`, `1009`) median elapsed dropping by at least 25% versus the post-008 baseline.

## Architecture Check

1. Measurement-only ticket — no engine source changes. The witness script and existing instrumentation are sufficient.
2. Engine-agnostic — witness runs against the production GameSpecDoc unchanged.
3. F#9 (Replay, telemetry, auditability): the gate-decision report becomes the durable artifact tied to this phase.

## What to Change

### 1. Rerun the 15-seed witness post-Phase-3 activation

Run: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-post-174-011 --profile-buckets`

Capture:
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv`

(Adjust the `--date` suffix to the actual date the ticket is implemented; the report file paths follow that suffix.)

### 2. Capture activation counters

Augment the rerun (or a sidecar invocation) to log `getProductionPolicyWasmPreviewDriveRouteCount()` and `getProductionPolicyWasmPreviewDriveUnsupportedCount()` at the end of each seed and append the totals to the witness report.

### 3. Produce the gate-decision report

`reports/174-phase-4-gate-decision.md` containing:
- Slow-tier residual delta vs post-008 baseline (`1005`, `1011`, `1008`, `1013`, `1009` median elapsed before and after).
- Activation counters (totals + per-microturn-class).
- Verdict:
  - **Pass**: slow-tier median improves by ≥25% → ticket 010 (default flip + A/B deletion) proceeds.
  - **Fail**: slow-tier median improves by <25% or regresses → produce `reports/174-phase-4-architectural-blocker.md` enumerating exact unsupported classes still dominating wall time and naming the next architectural owner; ticket 010 is closed-without-work per its descope path.

## Files to Touch

- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.md` (new — witness output)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv` (new — witness CSV)
- `reports/174-phase-4-gate-decision.md` (new — gate-decision record; pass or fail path)
- `reports/174-phase-4-architectural-blocker.md` (new, conditionally — produced only if the gate fails)

## Out of Scope

- No engine source changes — measurement ticket only.
- No default flip (ticket 010 owns).
- No FITL-specific code.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine suite green: `pnpm turbo test`.
2. Determinism gates green (same list as ticket 002) — the witness rerun does not regress them.

### Invariants

1. The gate-decision report names the exact verdict (Pass or Fail) using the 25% slow-tier median delta criterion.
2. If the verdict is Fail, the blocker report names every dominant unsupported class with its share of the residual wall time.

## Test Plan

### New/Modified Tests

None — this is a measurement-and-report ticket. Manual verification consists of comparing the rerun witness's slow-tier median against the post-008 baseline.

### Commands

1. `pnpm -F @ludoforge/engine build` (ensure WASM is built with all Phase 1 + Phase 3 changes)
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>-post-174-011 --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implementation completed on 2026-05-16. The decisive Phase 4 witness ran on 2026-05-16 and produced:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-post-174-011.csv`
- `reports/174-phase-4-gate-decision.md`
- `reports/174-phase-4-architectural-blocker.md`

Gate verdict: Fail. The post-008 baseline slow-tier median was `27211.75 ms`; the required final median for a 25% improvement was `<=20408.8125 ms`; the post-174-011 final slow-tier median was `62042.20 ms`, a `+34830.45 ms` regression (`+127.9978%`). Activation counters from the witness were: WASM production preview-drive route count `181`, unsupported count `3394`, batch count `1712`.

Landed scope:
- Augmented `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` so the witness CSV records `wasmProductionPreviewDriveRouteCount` and `wasmProductionPreviewDriveUnsupportedCount` per decision and the Markdown report summarizes route, unsupported, and batch totals by microturn class.
- Extracted report rendering to `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` to resolve the source-size hard gate on the touched script.
- Created the gate-decision report and fail-path blocker report.
- Rejected `tickets/174WASMDEEPPRV-010.md` without code changes because the default flip is not authorized.
- Added `archive/tickets/174WASMDEEPPRV-014.md` as the next non-overlapping owner for the failed gate residual.

Generated/artifact fallout: checked-in witness Markdown/CSV and two Phase 4 reports were created. No schema, golden, GameSpecDoc, WASM ABI, or checked-in generated JSON artifact changed.

Source-size ledger:
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs | before 862 | after 700 | crossed cap? no, extracted below cap | active growth resolved by helper extraction | extraction/defer rationale: report rendering moved to adjacent helper | successor if any: none`
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs | before 0 | after 201 | crossed cap? no | active growth new helper under typical band | extraction/defer rationale: source-size gate resolution for measurement script | successor if any: none`

Command ledger:
- Test Plan | `pnpm -F @ludoforge/engine build` | ran directly before witness | passed.
- What to Change/Test Plan | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-post-174-011 --profile-buckets` | ran directly | passed; wrote witness report and CSV.
- Acceptance | determinism gates same list as Spec 174 AC #4 | ran as focused compiled Node test command after build | passed; 24 tests, 6 suites, 0 failures.
- Test Plan | `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` | split into three serial turbo lanes | passed.
- Ticket graph integrity | `pnpm run check:ticket-deps` | ran after final terminal-status graph edits | passed.

Verification:
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` - passed.
- `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` - passed.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 400000 --date 2026-05-16-post-174-011-smoke --profile-buckets --output-dir /tmp/ludoforge-174-smoke` - passed; verified new Markdown totals and CSV counter columns.
- `pnpm -F @ludoforge/engine build` - passed.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-post-174-011 --profile-buckets` - passed; 15/15 seeds completed and wrote the witness Markdown/CSV.
- `node --test packages/engine/dist/test/determinism/spec-140-replay-identity.test.js packages/engine/dist/test/determinism/forked-vs-fresh-runtime-parity.test.js packages/engine/dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js packages/engine/dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js` - passed; 24 tests, 6 suites, 0 failures.
- `pnpm turbo test` - passed; 5 successful tasks, 1 cached. Advisory emissions only: runner jsdom/canvas/ticker-error stderr from existing passing tests.
- `pnpm turbo lint` - passed; 2 successful tasks, 1 cached.
- `pnpm turbo typecheck` - passed; 3 successful tasks, 1 cached.
- `pnpm run check:ticket-deps` - passed; ticket dependency integrity check passed for 3 active tickets and 2362 archived tickets.

Late-edit proof validity: the final ticket status/proof transcription happened after the source, report, spec, dependent-ticket, successor-ticket, witness, and broad proof lanes were complete. The follow-up dependency-check transcription is clerical and records the just-run graph result; it does not change source, command semantics, acceptance thresholds, touched-file ownership, dependency ownership, or residual owner.

Archive status: completed and ready for post-ticket review. `tickets/174WASMDEEPPRV-010.md` is rejected without implementation; `archive/tickets/174WASMDEEPPRV-014.md` completed the diagnostic owner slice, and `archive/tickets/174WASMDEEPPRV-015.md` later completed the zero-counter owner slice.
