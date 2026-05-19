# 184WASMPREDRI-001: Phase 0+1 — Inventory and classify WASM preview-drive divergences

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — investigation + reporting deliverable
**Deps**: `specs/184-wasm-preview-drive-aggregate-coverage.md`

## Problem

Spec 184 §4 Phases 0 and 1 require inventorying every action × profile pair where the WASM production preview drive's outcome diverges from the TS preview evaluator, then classifying each divergence as (a) extend the drive's state-mutation modeling, (b) document as legitimately unsupported and rely on the Spec 175 null-return → TS-fallback path, or (c) drive bug. Without this inventory, downstream Phase 2 and Phase 3 tickets lack a concrete target list, and Phase 4's defensive-fallback removal cannot be safely scheduled.

Phase 0 (data collection) and Phase 1 (classification annotation) are grouped here because they share the same report file, the same author context, and produce a single coherent reviewable diff: a divergence inventory with classification verdicts. Splitting them across two tickets would create artificial review boundaries on the same artifact.

## Assumption Reassessment (2026-05-19)

1. `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` is the live executable 15-seed rollup producer. It imports `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` to render markdown/CSV output that totals `wasmProductionPreviewDriveRouteCount`, `wasmProductionPreviewDriveUnsupportedCount`, and per-reason breakdowns across the 15-seed corpus. The earlier ticket draft named the renderer helper as the command; user approved correcting the proof lane to the executable producer on 2026-05-19.
2. The FITL production tournament fixture (seed 1000, 4 seats, 80 decisions) is the minimum-required corpus per spec §4 Phase 0; the 15-seed multi-seed rollup widens shape coverage at zero extra tooling cost.
3. The defensive fallback `previewFeatureRowsExerciseAggregate` at `packages/engine/src/agents/policy-wasm-score-routing.ts:412-427` (called from line 493) is currently in place. Inventory work runs against this state — the fallback diverts preview-aggregate features to TS evaluation, so the WASM drive's true unsupported-shape footprint must be measured with the fallback disabled or by inspecting per-reason counters directly.
4. No prior report exists at `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md`.

## Architecture Check

1. Inventory and classification are read-only work — no engine source changes, no agnostic-boundary risk (Foundation #1).
2. The report is informational provenance (Foundation #9 — replay/audit/auditability), not rule-authoritative. It lives under `reports/`, not `data/games/`.
3. Classification feeds two downstream tickets (002, 003). Both invoke the audit-dependent `Likely surface` pattern from `/spec-to-tickets` Step 5 because their exact scope is defined by this ticket's output.
4. No backwards-compatibility shim — this is a one-shot investigation artifact, not runtime infrastructure.

## What to Change

### 1. Run the inventory

Run the 15-seed report (`node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`) at the current main commit. Capture every `wasmProductionPreviewDriveUnsupportedCount` contribution and its per-reason key (`unsupportedDriveClass`, `unsupportedOwner`, `reason`) per the existing tagging in `policy-wasm-runtime-counters.ts`.

Cross-reference each unsupported event against the divergence the `arvn-tournament-wasm-equivalence.test.ts` harness would catch if the defensive fallback were removed — i.e., the action × profile pairs where the TS preview evaluator returns a value but the WASM drive falls back to `feature.<fallback>`.

### 2. Author the report

Create `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md` with one entry per divergence. Recommended per-entry shape:

- Action id
- Profile id (arvn-evolved, vc-baseline, us-baseline, etc.)
- Preview ref (e.g., `preview.victory.currentMargin.self`)
- WASM drive outcome (`failed`, `unresolved`, `gated`)
- TS evaluator outcome (and value)
- State-mutation shape the drive fails to model (one-line description tying back to the missing handler in `preview_drive.rs`)

### 3. Append classification table

Append a Phase 1 classification table with one row per inventory entry:

- Inventory id (link or anchor to the entry)
- Classification: `(a) extend drive` / `(b) document unsupported` / `(c) drive bug`
- One-line rationale
- Target phase (2 for (a), 3 for (b), 2 for (c))

### 4. Reconcile counts

The inventory row count must match the `wasmProductionPreviewDriveUnsupportedCount` total from the 15-seed report at the chosen commit. Record the commit hash in the report header so downstream tickets can re-run the comparison.

## Files to Touch

- `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md` (new)

## Out of Scope

- WASM drive extensions for (a)-classified shapes (ticket 002).
- Production drive header comments and reason-coverage extensions for (b)-classified shapes (ticket 003).
- Defensive fallback removal (ticket 004).
- Any engine source change. This ticket produces a single new markdown artifact under `reports/`.

## Acceptance Criteria

### Tests That Must Pass

1. N/A — investigation deliverable. The report file exists at the expected path with both Phase 0 inventory entries and a Phase 1 classification table.
2. Existing suite: `pnpm turbo test` (no regression; this ticket adds a markdown file and changes no code).

### Invariants

1. Every divergence the 15-seed report surfaces as an unsupported reason has a corresponding inventory entry.
2. Every inventory entry has a classification verdict with one-line rationale.
3. Inventory entry counts reconcile against the 15-seed report's `wasmProductionPreviewDriveUnsupportedCount` total at the commit named in the report header.

## Test Plan

### New/Modified Tests

None — this ticket's deliverable is a markdown report, not test code.

### Commands

1. `pnpm -F @ludoforge/engine build && node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — produce the 15-seed rollup the inventory consumes
2. `pnpm turbo test` — confirm no regression
3. `pnpm turbo lint`, `pnpm turbo typecheck` — confirm no regression

## Outcome

Completed: 2026-05-19

What changed:
- Created `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md`.
- Corrected the active ticket and spec proof lane from the renderer helper `profile-fitl-arvn-15-seed-report-rendering.mjs` to the executable producer `profile-fitl-arvn-15-seed-decomposition.mjs` after user approval of option 1 on 2026-05-19.
- Ran the 15-seed producer against commit `3b0bd9ff274840cce57bbea8c1dcab6845de2329`; the raw generated rollup/CSV were written under `/tmp/ludoforge-184/` and were not checked in.
- Recorded 44 grouped unsupported preview-drive inventory rows that reconcile to the producer's `wasmProductionPreviewDriveUnsupportedCount = 2936`.
- Classified `264` `victoryCurrentMargin` unsupported rows as `(a) extend drive` for ticket 002, and the remaining `2672` rows as `(b) document unsupported` for ticket 003. No `(c)` rows were found.

Deviation from original plan:
- The live 15-seed producer emits unsupported reason/profile/action counts but not per-candidate TS numeric preview values. The report records TS outcome as the Spec 175 fallback oracle and explicitly leaves exact numeric parity values to the downstream parity fixtures in tickets 002 and 003.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --output-dir /tmp/ludoforge-184 --date 2026-05-19` — passed, 15/15 seeds completed, 3808 per-decision rows, route count 3163, unsupported count 2936.
- `pnpm run check:ticket-deps` — passed for 4 active tickets and 2447 archived tickets.
- `git diff --check -- specs/184-wasm-preview-drive-aggregate-coverage.md tickets/184WASMPREDRI-001.md reports/184-phase-0-wasm-preview-drive-divergence-inventory.md .codex/run-state/implement-spec-tickets.json` — passed.
- `pnpm turbo test` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
