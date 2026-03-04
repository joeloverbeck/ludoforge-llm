# KERQUERY-016: Enforce active ticket reference integrity after archival

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket-tooling and active-ticket reference integrity
**Deps**: docs/archival-workflow.md, scripts/archive-ticket.mjs, scripts/check-ticket-deps.mjs, tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md

## Problem

Archiving rewrites `**Deps**` paths, but active tickets can still retain stale references in other sections (`Out of Scope`, narrative mentions). This creates planning/documentation drift and can point to non-existent active paths after archival.

## Assumption Reassessment (2026-03-05)

1. `archive-ticket.mjs` currently updates dependency references in active ticket `**Deps**` fields.
2. `check-ticket-deps` validates dependency integrity for active tickets, but not general cross-reference consistency in other sections.
3. At least one active ticket currently still references an archived ticket via old active path outside `**Deps**` (`KERQUERY-013` Out of Scope), confirming a real drift gap.

## Architecture Check

1. Enforcing ticket-reference integrity at tooling level is cleaner than relying on manual maintenance and prevents silent planning drift.
2. This change is repo-process tooling only and does not affect game runtime, preserving game-agnostic engine boundaries.
3. No backwards-compatibility aliasing/shims: stale active-path references should be corrected directly.

## What to Change

### 1. Fix current stale active-ticket references

1. Update active tickets that reference archived tickets via `tickets/...` paths to `archive/tickets/...` where appropriate.
2. Ensure references are explicit and resolvable.

### 2. Strengthen ticket integrity checks beyond `**Deps**`

1. Extend `scripts/check-ticket-deps.mjs` (or add a companion checker) to detect stale intra-ticket references to non-existent `tickets/*.md` paths.
2. Limit checks to explicit markdown path references to avoid false positives.

### 3. Integrate integrity gate into workflow

1. Ensure the enhanced check remains part of existing quality gates (`pnpm run check:ticket-deps`).
2. Keep diagnostics actionable by reporting file and line for each stale reference.

## Files to Touch

- `tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md` (modify)
- `scripts/check-ticket-deps.mjs` (modify)
- `scripts/archive-ticket.mjs` (modify if needed)
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

1. `scripts/check-ticket-deps.mjs` validation coverage (add/extend script-level tests if present) — ensure stale path detection outside `**Deps**`.
2. `tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md` — corrected reference acts as concrete regression sample.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm test`
