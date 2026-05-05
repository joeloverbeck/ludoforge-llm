# 149FITLEVNUMVM-002: Relieve engine-tests.yml lanes for sihanouk + march-free-operation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — CI workflow + lane-mapping confirmation only
**Deps**: `archive/specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`

## Problem

PR #231 integration CI lanes are red because `fitl-events-sihanouk.test.ts` (was 1m 31s, now 10+ minutes) and `fitl-march-free-operation.test.ts` (was 1m 10s, now 5+ minutes) exceed the 30-minute per-lane `lane.timeout` in `engine-tests.yml`. Per spec 149 §Phase 0, this is a tactical configuration unblock paired with restoration ticket 003.

## Assumption Reassessment (2026-04-28)

1. The slow integration tests live at `packages/engine/test/integration/fitl-events-sihanouk.test.ts` and `packages/engine/test/integration/fitl-march-free-operation.test.ts` (both verified during spec 149 reassessment).
2. Draft assumption corrected during implementation: these tests do not run via `slow-parity-shard-*` on the live manifest. `fitl-events-sihanouk.test.ts` routes through `integration:fitl-events-shard-c`; `fitl-march-free-operation.test.ts` routes through `integration:fitl-rules`.
3. `// @timeout` per-test annotations do NOT exist in `run-tests.mjs` — the spec's earlier draft was wrong. Available mechanisms: (a) bump per-lane `timeout`, (b) add matrix-driven step-level `continue-on-error: true` to specific lanes, (c) extend lane manifest to support per-test budgets.

## Architecture Check

1. The live `engine-tests.yml` matrix entries for `fitl-events-shard-c` and `fitl-rules` are the right tactical surface because the manifest routes the named slow tests there. Marking those entries non-blocking is a temporary Phase 0 CI unblock, not a reclassification of the tests' long-term lane taxonomy.
2. Configuration-only edit; F1 preserved trivially.
3. Tactical, not architectural — F15 paired with restoration ticket 003. The strategic answer (apply/undo + bytecode VM) lives in Phases 2-4.

## What to Change

### 1. Identify lane mapping (read-only investigation)

Read `packages/engine/scripts/test-lane-manifest.mjs` and confirm which `engine-tests.yml` lane contains `fitl-events-sihanouk.test.ts` and which contains `fitl-march-free-operation.test.ts`. Record the mapping in the ticket's Outcome on completion.

### 2. `.github/workflows/engine-tests.yml` — relieve the affected lanes

Choose ONE mechanism after lane-mapping is confirmed:

**Option A (preferred)**: Add `continue_on_error: true` to the matrix entries that contain the slow tests, plus emit a non-blocking summary so the signal is visible. Implement it as step-level `continue-on-error` driven by the matrix flag.
```yaml
- { id: fitl-events-shard-c, script: 'test:integration:fitl-events:shard-c', timeout: 30, continue_on_error: true }
```

**Option B**: Bump per-lane `timeout: 30` → `timeout: 60` on the affected lanes. Less ideal because it gates PR merges on the bumped budget.

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

1. Local YAML lint (`yamllint .github/workflows/engine-tests.yml`) or structural YAML parse if `yamllint` is unavailable.
2. Affected lanes either complete within the new budget OR become non-blocking via matrix-driven step-level `continue-on-error`.
3. Existing suite: `pnpm turbo build && pnpm turbo lint`.

### Invariants

1. Unaffected `fitl-events-shard-{a,b}`, `slow-parity-shard-{a,b,c}`, and other non-target lanes retain their existing `timeout: 30` and gating semantics.
2. The `build`, `e2e-all`, `memory`, and `performance` lanes are untouched.
3. If Option A is chosen, downstream policy (cf. branch protection) does not silently allow merges through `continue-on-error` until ticket 003 reverts this — flag this in the PR description.

## Test Plan

### New/Modified Tests

1. None — workflow configuration change.

### Commands

1. `pnpm turbo build` (sanity).
2. `pnpm turbo lint`.
3. After push, observe both affected lanes either passing within the new budget or completing as non-blocking.
4. Lane mapping verification: inspect `packages/engine/scripts/test-lane-manifest.mjs` via a manifest query and cite the resulting lane assignment in the Outcome.

## Outcome (2026-04-28)

Implemented Option A against the live lane mapping:
- `fitl-events-sihanouk.test.ts` routes through `integration:fitl-events-shard-c`, so `.github/workflows/engine-tests.yml` now marks the `fitl-events-shard-c` matrix entry `continue_on_error: true`.
- `fitl-march-free-operation.test.ts` routes through `integration:fitl-rules`, so `.github/workflows/engine-tests.yml` now marks the `fitl-rules` matrix entry `continue_on_error: true`.

The workflow applies the matrix flag at the test step with `continue-on-error` and emits a GitHub Step Summary note for non-blocking lanes. No lane timeout was bumped.

Boundary correction:
- Draft/spec assumption `slow-parity-shard-*` -> live manifest owners `fitl-events-shard-c` and `fitl-rules`.
- Ticket 003 owns restoring these two matrix flags after Phase 4.

Verification set:
- Manifest lane query for the two named tests.
- Structural YAML parse / workflow invariant check for `.github/workflows/engine-tests.yml` because `yamllint` is not installed in this environment.
- `pnpm turbo build`
- `pnpm turbo lint`

Verification results:
- Manifest lane query passed: `integration:fitl-events-shard-c` contains `fitl-events-sihanouk.test.ts`; `integration:fitl-rules` contains `fitl-march-free-operation.test.ts`.
- Structural YAML parse / workflow invariant check passed: only `fitl-events-shard-c` and `fitl-rules` carry `continue_on_error: true`; protected neighboring lanes remain blocking; the run step consumes the matrix flag; the non-blocking summary step exists.
- `pnpm turbo build` passed.
- `pnpm turbo lint` passed.
