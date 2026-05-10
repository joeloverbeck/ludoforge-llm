# 164CONTPREVDEP-005: Cookbook update, benchmark sweep, e2e fixture profile

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Minimal — new test fixture profile only; doc/report changes
**Deps**: `archive/tickets/164CONTPREVDEP-004.md`

## Problem

After Ticket 004, the deep-pass feature is fully implemented and tested architecturally. Phase 4 ships:

- A "Continued deepening" subsection in `docs/agent-dsl-cookbook.md` documenting the YAML schema, cost formula, triggers, and trade-offs.
- A benchmark sweep across representative FITL and Texas Hold'em profiles, recording broad/deep coverage rollups and runtime overhead. The report seats in `reports/spec-164-deepening-benchmarks-<date>.md`.
- At least one test fixture profile that exercises `continuedDeepening` end-to-end (compile → run → trace → assert merged coverage shape). This is the e2e exercise demonstrating the full path is wired correctly.

This is the spec's documentation/validation phase. It does NOT change defaults for any production profile (per spec §15 default-change policy).

## Assumption Reassessment (2026-05-09)

1. The "Inner Preview" section in `docs/agent-dsl-cookbook.md` spans lines 249-460 (verified during reassessment). The new "Continued deepening" subsection appends near the end of this section.
2. `reports/` directory is established for similar benchmark/measurement reports (e.g., `reports/preview-signal-integrity.md`). The new benchmark report follows the same conventions.
3. No production profile is migrated to `continuedDeepening` in this ticket — the e2e fixture profile is purpose-built for testing.
4. After Ticket 004, the runtime supports `continuedDeepening` end-to-end, so the e2e fixture exercises actual deep-pass behavior, not a no-op fallthrough.

## Architecture Check

1. **No production default change (F#14, spec §15)**: This ticket does NOT flip any profile's default to `continuedDeepening` or `deep1024`. Production profiles continue to use `singlePass`/`standard256`. A follow-up spec, motivated by the benchmark results landed here, may propose targeted default changes; that work is out of scope.
2. **Benchmark report is data, not code**: The report is a measurement artifact — it records broad/deep coverage rollups and timing characteristics. The cookbook update is documentation. Neither modifies engine semantics.
3. **The fixture profile is engine-agnostic**: It exercises a generic shape (chooseN ladder with depth-capped refs), not game-specific behavior. Placement under engine-side test fixtures, not under game data.

## What to Change

### 1. Cookbook subsection — "Continued deepening"

Append a subsection to `docs/agent-dsl-cookbook.md` "Inner Preview" section (current span 249-460). Content covers:

- YAML schema (`strategy`, `capClass`, `continuedDeepening` block with `broad`/`deep` fields).
- Worked example with cost computation (reuse Spec 164 §6 ARVN target row: `M=8, B=1, Db=4, Dd=16` → `totalCost=968 ≤ 1024`).
- Trigger reference (`allRequestedRefsDepthCapped`, `allReadyValuesUniform`) — when each fires, what they imply.
- Trade-off discussion: when to use `continuedDeepening` (deeply-nested chooseN ladders where broad-pass refs collapse to `depthCap`) vs. when not (top-level chooseOne where broad pass produces signal already).
- Pointer to F#20 preservation: deepening is *additive* signal, not a way to silence unavailability.

### 2. Benchmark sweep

Run a sweep across:

- FITL `arvn-evolved` profile under `singlePass + standard256` (baseline) and `continuedDeepening + deep1024 (Db=4, Dd=16)` (treatment).
- Texas Hold'em representative profile under `singlePass + standard256` (baseline) and `continuedDeepening + standard256` (treatment with budget headroom).

Capture, per profile/seed:

- Broad coverage block (existing `PolicyPreviewCoverage` summary).
- Deep coverage block (new `coverage.deep` from Ticket 004) — root counts, ready/unavailable splits, trigger fire rates.
- Wall-clock timing relative to baseline.
- Number of chooseNStep frontiers that flipped from `tiebreakAfterPreviewNoSignal` to a preview-driven selection.

Write the report at `reports/spec-164-deepening-benchmarks-<YYYYMMDD>.md`. Use a date-stamped filename so future re-sweeps coexist.

The report's purpose is empirical evidence for follow-up specs that may propose default migrations — it is not a gate for this ticket's acceptance.

### 3. E2E test fixture profile

Author a fixture profile (under `packages/engine/test/fixtures/` or wherever similar fixture profiles live; verify during implementation) declaring `strategy: continuedDeepening, capClass: deep1024` with broad/deep depth caps. Profile shape: a synthetic chooseN ladder that triggers `allRequestedRefsDepthCapped` deterministically.

Add an integration test that:

1. Compiles the profile.
2. Runs a fixed seed.
3. Asserts the resulting trace has both `coverage.broad` and `coverage.deep` blocks populated.
4. Asserts at least one ref flipped from `unavailable` to `ready` between phases.

This is the e2e proof that compiler → runtime → trace round-trips the new feature.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify) — append "Continued deepening" subsection within the Inner Preview section.
- `reports/spec-164-deepening-benchmarks-<YYYYMMDD>.md` (new) — benchmark report.
- `packages/engine/test/fixtures/preview-deepening-e2e/` (new directory) — fixture profile YAML/markdown.
- `packages/engine/test/integration/continued-deepening-e2e.test.ts` (new) — integration test consuming the fixture.

## Out of Scope

- Migrating any production profile (FITL `arvn-evolved`, Texas Hold'em) to `continuedDeepening`. Follow-up spec only.
- Adding new cap-class tiers (`deep2048` etc.) — out per spec §13 Open Question 5.
- Changing the default trigger set — deferred per spec §13 Open Question 1.

## Acceptance Criteria

### Tests That Must Pass

1. New `continued-deepening-e2e.test.ts` integration test passes.
2. Existing engine suite: `pnpm -F @ludoforge/engine test`.
3. Cookbook subsection is reviewable as a self-contained block (no broken links, table renders, code fence balanced).
4. Benchmark report is checked in with at least one profile per game family (FITL + Texas Hold'em) measured.
5. `pnpm turbo typecheck && pnpm turbo lint`.

### Invariants

1. No production profile YAML changes in this ticket — defaults remain `singlePass` / `standard256`.
2. The cookbook subsection cites the cap-class registry and `CAP_CLASS_BUDGETS` constant rather than duplicating literal numbers.
3. The fixture profile is engine-agnostic (no FITL or Texas Hold'em identifiers in its YAML).
4. Benchmark report references checked-in code (file paths, function names) using the same anchors the spec uses.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/continued-deepening-e2e.test.ts` — integration; asserts compile → run → trace round-trips the new feature with both `coverage.broad` and `coverage.deep` populated.

### Manual Verification

1. Cookbook subsection renders correctly when `docs/agent-dsl-cookbook.md` is viewed in a Markdown previewer (no broken table syntax, code fences closed).
2. Benchmark report contains the four required sections per profile: baseline coverage, treatment coverage, ref-flip count, timing delta.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/continued-deepening-e2e.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. Benchmark sweep invocation (record exact command in the benchmark report header for reproducibility).
