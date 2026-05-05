# 149FITLEVNUMVM-001: Bump engine-determinism.yml job-level timeout 30→60

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — CI workflow only
**Deps**: `archive/specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`

## Problem

PR #231 (`implemented-147`) determinism CI lanes are red because seed-42/seed-123 FITL parity shards exceed the 30-minute job-level timeout under the current TS object-walking eval cost. Per spec 149 §Phase 0, this is a tactical configuration unblock that buys time for the strategic Phases 1-4 to land. Once Phase 4 hits the ≤250 ms per-card target, ticket 003 reverts this change.

## Assumption Reassessment (2026-04-28)

1. The `engine-determinism.yml` workflow currently has `timeout-minutes: 30` at the job level (verified during spec 149 reassessment).
2. The slow shards are `fitl-parity-zobrist-seed-42`, `fitl-parity-zobrist-seed-123`, and `fitl-medium-zobrist` (per `reports/turnperf-002-implementation-2026-04-28.md` evidence: seed-42 parity shard timed out after 300s on multiple test runs; seed-123 was previously 1822s).
3. No alternative mechanism is required at the determinism job level — the timeout is a single integer.

## Architecture Check

1. Job-level timeout bump applies uniformly to all 10 determinism shards under that job. This is the minimum-blast-radius change for unblocking — no matrix-level changes needed.
2. Configuration-only edit; no engine code, no game-specific logic. F1 (Engine Agnosticism) preserved trivially.
3. Tactical, not architectural — paired with restoration ticket 003 per F15. The strategic answer (bytecode VM) lives in Phases 1-4.

## What to Change

### 1. `.github/workflows/engine-determinism.yml`

Change `timeout-minutes: 30` (currently at line 26 under the `determinism` job) to `timeout-minutes: 60`.

Do NOT modify:
- The `policy-profile-quality` job's `timeout-minutes: 30` (line 96) — already has `continue-on-error: true` and is non-blocking.
- The `policy-profile-quality-report` job's `timeout-minutes: 15` (line 148) — aggregation job, not affected.

## Files to Touch

- `.github/workflows/engine-determinism.yml` (modify)

## Out of Scope

- Any engine source changes (Phases 1-4).
- Per-test timeout overrides (covered by ticket 002 if Phase 0 selects that mechanism).
- Restoration of the original 30 m budget — owned by ticket 003.

## Acceptance Criteria

### Tests That Must Pass

1. Local YAML lint of the workflow file (e.g., via `yamllint .github/workflows/engine-determinism.yml` if available, or visual diff confirming no syntax breakage).
2. Existing suite: `pnpm turbo build && pnpm turbo lint` (workflow file changes do not affect engine builds, but full pipeline validates branch CI-greenness).

### Invariants

1. The `policy-profile-quality` and `policy-profile-quality-report` jobs retain their existing `timeout-minutes` values.
2. No matrix-level changes to determinism shards (those are job-level governed by this single integer).
3. No `continue-on-error` introduced anywhere in this job — determinism failures must remain blocking.

## Test Plan

### New/Modified Tests

1. None — this is a workflow configuration change with no test surface in the engine package.

### Commands

1. `pnpm turbo build` (sanity check that nothing else regresses).
2. `pnpm turbo lint` (lint pass).
3. After push to PR #231, observe a determinism-shard run completing within the new 60 m budget.

## Outcome (2026-04-28)

Implemented the tactical Phase 0 determinism unblock by changing only the
`determinism` job in `.github/workflows/engine-determinism.yml` from
`timeout-minutes: 30` to `timeout-minutes: 60`.

Boundary notes:
- The `policy-profile-quality` job remains `timeout-minutes: 30` with its existing
  `continue-on-error: true`.
- The `policy-profile-quality-report` job remains `timeout-minutes: 15`.
- No determinism matrix entries changed, and no `continue-on-error` was introduced
  on the blocking `determinism` job.
- `engine-tests.yml` lane relief remains sibling-owned by
  `tickets/149FITLEVNUMVM-002.md`.

Verification set:
- Structural YAML parse / workflow invariant check for
  `.github/workflows/engine-determinism.yml` because `yamllint` is not installed
  in this environment.
- `pnpm turbo build`
- `pnpm turbo lint`

Verification results:
- `pnpm -F @ludoforge/engine exec node -e "<YAML parse + timeout invariant check>"`
  passed.
- `pnpm turbo build` passed.
- `pnpm turbo lint` passed.

Schema/artifact fallout: none; workflow configuration only.
