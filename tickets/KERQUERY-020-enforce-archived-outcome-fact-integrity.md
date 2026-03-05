# KERQUERY-020: Enforce archived Outcome fact integrity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — process/tooling integrity for archived ticket outcomes
**Deps**: docs/archival-workflow.md, scripts/check-ticket-deps.mjs, archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md

## Problem

Archived ticket `Outcome` sections can become stale after follow-up implementation changes. Current integrity checks validate dependency paths but do not detect contradictory archived claims (for example saying a file was untouched when it was later changed in-scope).

## Assumption Reassessment (2026-03-05)

1. `docs/archival-workflow.md` requires amending archived outcomes when facts become stale.
2. Existing automated checks (`check-ticket-deps`) do not validate archived outcome fact consistency.
3. No active ticket currently adds automated safeguards for archived outcome fact integrity.

## Architecture Check

1. Tooling-level checks prevent process drift and improve long-term architecture traceability.
2. This is documentation/tooling-only and does not affect game-agnostic runtime architecture.
3. No backwards-compatibility aliases/shims: stale claims should be corrected directly.

## What to Change

### 1. Add archived-outcome consistency checks

1. Extend ticket integrity tooling (or add companion script) to detect common stale-claim patterns in archived outcomes.
2. Focus first on explicit contradictions (for example `no <file> changes` when matching files changed under the same ticket scope).

### 2. Integrate into existing dependency integrity workflow

1. Run the new check from `pnpm run check:ticket-deps` (or a new top-level integrity command wired into `pnpm test`).
2. Emit actionable diagnostics (ticket path + offending line).

## Files to Touch

- `scripts/check-ticket-deps.mjs` (modify) or `scripts/check-ticket-outcomes.mjs` (new)
- `package.json` (modify if wiring a new command)
- `docs/archival-workflow.md` (modify if command/procedure text changes)

## Out of Scope

- Engine runtime behavior changes
- Query runtime cache and trigger dispatch architecture tickets (`archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`, `archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Integrity check flags stale archived outcome contradictions with actionable diagnostics.
2. `pnpm run check:ticket-deps` (or replacement integrity command) passes on clean state.
3. Existing suite: `pnpm test`.

### Invariants

1. Archived outcomes remain factual and maintainable over iterative implementation.
2. Process/tooling remains independent from game-specific runtime behavior.

## Test Plan

### New/Modified Tests

1. Script-level coverage for stale-claim detection in archived tickets (if script tests exist), or fixture-based dry-run checks.
2. `archive/tickets/...` sample case(s) for positive/negative validation.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm test`
