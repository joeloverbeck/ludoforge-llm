# 149FITLEVNUMVM-002: Relieve engine-tests.yml slow-parity-shard lanes for sihanouk + march-free-operation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — CI workflow + lane-mapping confirmation only
**Deps**: `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`

## Problem

PR #231 integration CI lanes are red because `fitl-events-sihanouk.test.ts` (was 1m 31s, now 10+ minutes) and `fitl-march-free-operation.test.ts` (was 1m 10s, now 5+ minutes) exceed the 30-minute per-shard `lane.timeout` in `engine-tests.yml`. Per spec 149 §Phase 0, this is a tactical configuration unblock paired with restoration ticket 003.

## Assumption Reassessment (2026-04-28)

1. The slow integration tests live at `packages/engine/test/integration/fitl-events-sihanouk.test.ts` and `packages/engine/test/integration/fitl-march-free-operation.test.ts` (both verified during spec 149 reassessment).
2. They run via the `slow-parity-shard-{a,b,c}` lanes in `engine-tests.yml` (matrix entries at lines 70-72), each with `lane.timeout: 30`. The exact shard mapping is determined by `packages/engine/scripts/test-lane-manifest.mjs` (`SLOW_INTEGRATION_TESTS` array drives which lane each test lands in).
3. `// @timeout` per-test annotations do NOT exist in `run-tests.mjs` — the spec's earlier draft was wrong. Available mechanisms: (a) bump per-shard `lane.timeout`, (b) add `continue-on-error: true` to specific shards, (c) extend lane manifest to support per-test budgets.

## Architecture Check

1. The `slow-parity-shard-*` matrix entries are the right surface — they explicitly group expensive parametric runGame parity tests (per `test-lane-manifest.mjs:39-44` doc comment). Bumping their lane timeout or marking them non-blocking is consistent with their existing slow-budget framing.
2. Configuration-only edit; F1 preserved trivially.
3. Tactical, not architectural — F15 paired with restoration ticket 003. The strategic answer (apply/undo + bytecode VM) lives in Phases 2-4.

## What to Change

### 1. Identify lane mapping (read-only investigation)

Read `packages/engine/scripts/test-lane-manifest.mjs` — specifically the `SLOW_INTEGRATION_TESTS` array and the `integration:slow-parity-shard-{a,b,c}` lane configurations. Confirm which shard contains `fitl-events-sihanouk.test.ts` and which contains `fitl-march-free-operation.test.ts`. Record the mapping in the ticket's Outcome on completion (e.g., "sihanouk → shard-a; march-free-operation → shard-b").

### 2. `.github/workflows/engine-tests.yml` — relieve the affected shards

Choose ONE mechanism after lane-mapping is confirmed:

**Option A (preferred)**: Add `continue-on-error: true` to the `slow-parity-shard-*` matrix entries that contain the slow tests, plus emit a non-blocking summary so the signal is visible. Format example:
```yaml
- { id: slow-parity-shard-a, script: 'test:integration:slow-parity:shard-a', timeout: 30, continue-on-error: true }
```
(verify GitHub Actions matrix `continue-on-error` syntax — may require a job-level pattern with `if: matrix.lane.continue-on-error`).

**Option B**: Bump per-shard `timeout: 30` → `timeout: 60` on the affected shards. Less ideal because it gates PR merges on the bumped budget.

Default lean: Option A — keeps the determinism signal visible without blocking PR #231.

## Files to Touch

- `.github/workflows/engine-tests.yml` (modify)
- `packages/engine/scripts/test-lane-manifest.mjs` (read-only — investigation)

## Out of Scope

- Engine source changes (Phases 1-4).
- Per-test timeout annotations — explicitly NOT a thing per spec §Phase 0.
- Determinism workflow changes (covered by ticket 001).
- Lane manifest restructuring — if Option C from the spec (per-test lane manifest extension) is selected later, it goes in a separate ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Local YAML lint (`yamllint .github/workflows/engine-tests.yml`).
2. Affected `slow-parity-shard-*` lanes either complete within the new budget OR become non-blocking via `continue-on-error: true`.
3. Existing suite: `pnpm turbo build && pnpm turbo lint`.

### Invariants

1. The `fitl-events-shard-{a,b,c}`, `fitl-rules`, and other non-slow lanes retain their existing `timeout: 30` and gating semantics.
2. The `build`, `e2e-all`, `memory`, and `performance` lanes are untouched.
3. If Option A is chosen, downstream policy (cf. branch protection) does not silently allow merges through `continue-on-error` until ticket 003 reverts this — flag this in the PR description.

## Test Plan

### New/Modified Tests

1. None — workflow configuration change.

### Commands

1. `pnpm turbo build` (sanity).
2. `pnpm turbo lint`.
3. After push, observe both affected `slow-parity-shard-*` lanes either passing within the new budget or completing as non-blocking.
4. Lane mapping verification: `grep -A2 SLOW_INTEGRATION_TESTS packages/engine/scripts/test-lane-manifest.mjs` (cite the resulting shard assignment in the Outcome).
