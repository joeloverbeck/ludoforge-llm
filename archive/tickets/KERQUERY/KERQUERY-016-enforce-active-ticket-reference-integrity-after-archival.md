# KERQUERY-016: Enforce active ticket reference integrity after archival

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket-tooling and active-ticket reference integrity
**Deps**: docs/archival-workflow.md, scripts/archive-ticket.mjs, scripts/check-ticket-deps.mjs, archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md

## Problem

Archiving rewrites `**Deps**` paths, but active tickets can still retain stale references in other sections (`Out of Scope`, narrative mentions). This creates planning/documentation drift and can point to non-existent active paths after archival.

## Assumption Reassessment (2026-03-05)

1. `archive-ticket.mjs` currently rewrites only active-ticket `**Deps**` references and does not rewrite narrative references in other sections.
2. `check-ticket-deps` currently validates only `**Deps**` integrity and does not validate explicit ticket-path references outside that field.
3. The stale-reference gap is broader than initially scoped: active tickets `KERQUERY-017` through `KERQUERY-022` contain stale `tickets/KERQUERY-013|014|015...` references in non-`**Deps**` sections.
4. The original scope line item to edit `tickets/KERQUERY-013-...` is incorrect because that ticket is already archived at `archive/tickets/KERQUERY/KERQUERY-013-...`.

## Architecture Check

1. Enforcing ticket-reference integrity at tooling level is cleaner than relying on manual maintenance and prevents silent planning drift.
2. This change is repo-process tooling only and does not affect game runtime, preserving game-agnostic engine boundaries.
3. Strongest long-term architecture is prevention + validation: archival rewrite should update all explicit active-ticket references, while integrity checks should fail fast on stale paths.
4. No backwards-compatibility aliasing/shims: stale active-path references should be corrected directly.

## What to Change

### 1. Fix current stale active-ticket references

1. Update active tickets that reference archived tickets via `tickets/...` paths to `archive/tickets/...` where appropriate (`KERQUERY-017`, `KERQUERY-018`, `KERQUERY-019`, `KERQUERY-020`, `KERQUERY-021`, `KERQUERY-022`).
2. Ensure references are explicit and resolvable.

### 2. Strengthen ticket integrity checks beyond `**Deps**`

1. Extend `scripts/check-ticket-deps.mjs` (or add a companion checker) to detect stale intra-ticket references to non-existent `tickets/*.md` paths.
2. Limit checks to explicit markdown path references (inline code or markdown links) to avoid false positives.
3. Report actionable diagnostics including file and line number.

### 3. Prevent future drift during archival

1. Extend `scripts/archive-ticket.mjs` rewrite behavior beyond `**Deps**` so moved ticket paths are updated across active ticket markdown references.
2. Keep rewrite behavior deterministic by matching exact moved-path strings.

### 4. Integrate integrity gate into workflow

1. Ensure the enhanced check remains part of existing quality gates (`pnpm run check:ticket-deps`).

## Files to Touch

- `tickets/KERQUERY-017-make-advance-to-decision-point-a-single-runtime-resource-boundary.md` (modify)
- `tickets/KERQUERY-018-enforce-runtime-resource-constructor-contract-guards.md` (modify)
- `tickets/KERQUERY-019-centralize-eval-resource-test-fixture-builders.md` (modify)
- `tickets/KERQUERY-020-enforce-archived-outcome-fact-integrity.md` (modify)
- `tickets/KERQUERY-021-enforce-query-cache-key-literal-ownership-policy.md` (modify)
- `tickets/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md` (modify)
- `scripts/check-ticket-deps.mjs` (modify)
- `scripts/check-ticket-deps.test.mjs` (modify)
- `scripts/archive-ticket.mjs` (modify if needed)
- `scripts/archive-ticket.test.mjs` (modify if needed)
- `docs/archival-workflow.md` (modify if needed for clarified guarantee)

## Out of Scope

- Engine runtime behavior changes
- Query runtime cache behavior work (`KERQUERY-013`, `KERQUERY-014`)
- Trigger dispatch API changes (`KERQUERY-015`)

## Acceptance Criteria

### Tests That Must Pass

1. Active tickets contain no stale references to missing `tickets/*.md` paths.
2. `pnpm run check:ticket-deps` fails with actionable diagnostics when such stale references are introduced.
3. Existing suite: `pnpm run check:ticket-deps`.

### Invariants

1. Active ticket references remain resolvable and deterministic after archival actions.
2. Process tooling changes do not alter GameDef/runtime/simulation behavior.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.test.mjs` — add coverage that stale `tickets/*.md` references outside `**Deps**` fail with file+line diagnostics.
2. `scripts/check-ticket-deps.test.mjs` — add coverage that valid archived references in markdown links/inline code pass.
3. `scripts/archive-ticket.test.mjs` — add coverage that archiving rewrites explicit moved-path references in active tickets beyond `**Deps**`.
4. Active ticket fixtures (`KERQUERY-017`..`KERQUERY-022`) — corrected references serve as real-world regression coverage.

### Commands

1. `pnpm run check:ticket-deps`
2. `node --test scripts/check-ticket-deps.test.mjs scripts/archive-ticket.test.mjs`
3. `pnpm test`

## Outcome

- Completion date: 2026-03-05
- What changed:
  - Extended `scripts/check-ticket-deps.mjs` to validate explicit markdown ticket-path references outside `**Deps**` and report file+line diagnostics.
  - Extended `scripts/archive-ticket.mjs` to rewrite moved ticket-path references across entire active ticket markdown content, not only `**Deps**`.
  - Added/updated script tests in `scripts/check-ticket-deps.test.mjs` and `scripts/archive-ticket.test.mjs` for stale-reference detection and rewrite behavior.
  - Corrected stale archived-ticket references in active tickets `KERQUERY-017` through `KERQUERY-022` (plus `KERQUERY-017` reference to archived `KERQUERY-012`).
  - Updated `docs/archival-workflow.md` to document full-reference rewrite behavior during archival.
- Deviations from original plan:
  - Scope expanded from a single stale-reference sample to all currently detected stale archived-ticket references in active tickets.
  - Added archival rewrite hardening as a prevention layer, not only checker hardening.
- Verification results:
  - `node --test scripts/check-ticket-deps.test.mjs scripts/archive-ticket.test.mjs` passed.
  - `pnpm run check:ticket-deps` passed.
  - `pnpm test` passed.
  - `pnpm lint` passed.
