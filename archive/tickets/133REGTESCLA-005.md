# 133REGTESCLA-005: Classify determinism/, e2e/, performance/, memory/ lanes

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test source comment additions
**Deps**: `archive/tickets/133REGTESCLA-002.md`

## Problem

Spec 133 Phase 2 requires marker coverage of every `.test.ts`/`.test.mts` file under `packages/engine/test/**`. Beyond unit/ (ticket 003) and integration/ (ticket 004), four smaller lanes remain: `determinism/`, `e2e/`, `performance/`, `memory/`. Combined count is ~20 files. Each lane has a natural default class: determinism and performance/memory tests assert architectural budget/invariance properties, e2e tests frequently pin specific user-journey outcomes (convergence-witness). This ticket bundles the small lanes to avoid fragmenting ~20 files across four tickets.

## Assumption Reassessment (2026-04-18)

1. Approximate file counts from the Spec 133 reassessment were stale. Live corpus at implementation time is `determinism/` = 6, `e2e/` = 8, `performance/` = 7, `memory/` = 1. Total = 22 files.
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` is pre-classified by Spec 133 as `architectural-invariant` after commit 820072e3 softening. Verified against current source content (bounded stop reasons + deterministic replay).
3. Determinism lane runs sequentially via `packages/engine/scripts/run-tests.mjs --lane determinism` with a 20-minute timeout. Classifying files does not alter execution semantics.
4. E2E tests typically run full game scenarios and assert specific end-state outcomes — most default to convergence-witness unless the assertion is purely property-based (e.g., "game terminates in some valid stop reason" is architectural).
5. Performance and memory tests assert bounded execution/allocation budgets — the bound is the invariant, not the exact measurement. These are architectural-invariant by default.

## Architecture Check

1. **Cleaner than alternatives**: Bundling four small lanes into one ticket avoids ticket bloat for low-judgment-cost work. Each lane has a natural default class, so review remains straightforward.
2. **Agnostic boundaries preserved**: Comment-only additions; no production code touched.
3. **No backwards-compatibility shims**: Straight additions; no alias files.

## What to Change

### 1. Classify `determinism/` lane

- `fitl-policy-agent-canary.test.ts` → `// @test-class: architectural-invariant` (pre-classified per Spec 133 §Required Proof).
- Remaining determinism files: inspect. Most assert determinism as a universal property → architectural-invariant. Any file that pins specific trajectory values against specific seeds gets convergence-witness classification with an appropriate `@witness:` id.

### 2. Classify `e2e/` lane

- Inspect per file. E2E tests running full scenarios often pin specific terminal states, scoring outcomes, or ply-indexed observations — likely `convergence-witness`. Identify the witness-id (typically the spec/ticket that introduced the scenario).
- Files asserting only architectural properties (e.g., "game terminates in a valid stop reason regardless of scenario") → `architectural-invariant`.

### 3. Classify `performance/` and `memory/` lanes

- Performance tests asserting bounded execution time or throughput → `architectural-invariant` (the bound is the invariant).
- Memory tests asserting bounded allocations → `architectural-invariant`.
- Exceptions: any file pinning a specific timing or allocation count (e.g., "must complete in exactly 42ms") → `convergence-witness` with `@witness: <perf-tuning-ticket-id>`.

### 4. Witness-id lookup

For each convergence-witness classification, determine the spec/ticket that introduced or last modified the scenario. Git blame on the relevant `describe`/`it` block usually surfaces the commit; map the commit to its ticket/spec reference.

### 5. Small-lane discovery

Before classifying, run a quick glob check to confirm the actual file counts and catch any lane not listed here (e.g., a newly-added lane since the 2026-04-18 reassessment). If a new lane exists, classify its files under the same criteria.

## Files to Touch

- All `.test.ts`/`.test.mts` files under:
  - `packages/engine/test/determinism/**` (~6 files)
  - `packages/engine/test/e2e/**` (~7 files)
  - `packages/engine/test/performance/**` (~6 files)
  - `packages/engine/test/memory/**` (exact count TBD at implementation time)

## Out of Scope

- Unit and integration lanes (tickets 003, 004).
- Meta-test enforcing marker presence (ticket 006).
- Reporter infrastructure (ticket 001).
- Testing.md guidance (ticket 002).
- Runner (`packages/runner/`) test classification — per spec §Out of Scope.

## Acceptance Criteria

### Tests That Must Pass

1. Each lane's existing suite continues to pass post-marker:
   - `pnpm -F @ludoforge/engine test:determinism`
   - `pnpm -F @ludoforge/engine test:e2e`
   - `pnpm -F @ludoforge/engine test:performance`
   - `pnpm -F @ludoforge/engine test:memory`
2. Canary specifically: determinism lane still runs all configured seeds and passes under the 20-minute sequential timeout.

### Invariants

1. Every `.test.ts`/`.test.mts` file in `determinism/`, `e2e/`, `performance/`, `memory/` carries exactly one `@test-class` marker.
2. Every `convergence-witness` file includes a `@witness:` id with a valid spec/ticket reference.
3. Marker addition does not alter test runtime behavior (comment-only change).

## Test Plan

### New/Modified Tests

1. No new tests — comment-only ticket.

### Commands

1. `pnpm -F @ludoforge/engine test:all` — comprehensive suite across all lanes.
2. `pnpm -F @ludoforge/engine test:determinism` — targeted.
3. `pnpm -F @ludoforge/engine test:e2e` — targeted.
4. `pnpm -F @ludoforge/engine test:performance` — targeted.
5. `pnpm -F @ludoforge/engine test:memory` — targeted.
6. `pnpm turbo build && pnpm turbo typecheck`.
7. `pnpm turbo lint`.
8. Coverage grep: `grep -L '^// @test-class:' $(find packages/engine/test/determinism packages/engine/test/e2e packages/engine/test/performance packages/engine/test/memory -name '*.test.ts' -o -name '*.test.mts' 2>/dev/null)` — should return empty.

## Outcome

- Added `@test-class` markers to all 22 tracked test files under `packages/engine/test/determinism`, `e2e`, `performance`, and `memory`.
- Final class split:
  - `architectural-invariant`: all 6 determinism files, all 7 performance files, the 1 memory file, and 5 Texas e2e rule/invariant suites (`texas-holdem-betting-phases`, `texas-holdem-card-lifecycle`, `texas-holdem-real-edge-cases`, `texas-holdem-real-plays`, `texas-holdem-tournament`)
  - `golden-trace`: 3 explicit golden/vector suites (`fitl-playbook-golden`, `fitl-tooltip-golden`, `texas-holdem-golden-vector`)
- No file in this ticket’s boundary required `convergence-witness` classification after inspection, so no new `@witness:` lines were added.
- No production code, lane semantics, or test assertions changed; this ticket remained comment-only.

## Verification Record

1. Structural marker sweep across the four owned lanes
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm -F @ludoforge/engine test:e2e:slow`
6. `pnpm -F @ludoforge/engine test:performance`
7. `pnpm -F @ludoforge/engine test:memory`
8. `pnpm turbo build`
9. `pnpm turbo lint`
10. `pnpm turbo typecheck`

### Verification Notes

- The ticket’s original approximate lane counts were corrected before the final proof pass to match the live 22-file corpus.
- `pnpm -F @ludoforge/engine test:e2e` covers only the non-slow 6-file subset; because this ticket also touched `texas-holdem-card-lifecycle.test.ts` and `texas-holdem-tournament.test.ts`, the final acceptance proof added `pnpm -F @ludoforge/engine test:e2e:slow` to cover the full owned e2e scope.
- `pnpm -F @ludoforge/engine test:all` was not used as the decisive proof lane; the narrower per-lane commands plus workspace build/lint/typecheck provide the same owned acceptance evidence with less redundant overlap.
