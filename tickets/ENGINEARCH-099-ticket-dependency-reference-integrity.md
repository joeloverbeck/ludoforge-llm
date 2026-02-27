# ENGINEARCH-099: Active Ticket Dependency Reference Integrity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket hygiene and validation scripting
**Deps**: docs/archival-workflow.md

## Problem

Active tickets currently reference archived/non-existent dependency paths, which weakens planning reliability and creates confusion in implementation sequencing.

## Assumption Reassessment (2026-02-27)

1. Active ticket dependencies are expected to point to existing non-archived deliverables per ticket authoring contract.
2. Current active tickets include dependency paths that no longer exist in `tickets/`.
3. Mismatch: dependency references are stale. Corrected scope: fix current references and add lightweight validation to prevent recurrence.

## Architecture Check

1. Dependency integrity checks keep ticket workflow deterministic and auditable.
2. This is process-layer only and does not alter GameDef/runtime architecture.
3. No compatibility aliases; stale references are corrected directly.

## What to Change

### 1. Fix stale dependency references in active tickets

Update dependency links to valid current targets (active ticket or archived path where appropriate).

### 2. Add dependency-reference validation check

Add a small script/check that validates `**Deps**` paths in active tickets resolve to existing files.

### 3. Document enforcement in ticket authoring docs

Update ticket docs with explicit dependency-link validation expectation.

## Files to Touch

- `tickets/ENGINEARCH-089-pending-choice-authority-binding.md` (modify)
- `tickets/ENGINEARCH-090-choice-ownership-parity-coverage.md` (modify)
- `tickets/README.md` (modify)
- `scripts/` (add/modify dependency-check script)

## Out of Scope

- Ticket content scope changes beyond dependency-link correctness.
- Runtime/compiler code changes.

## Acceptance Criteria

### Tests That Must Pass

1. All active `tickets/*.md` `**Deps**` references resolve to existing files.
2. Validation check fails when a dependency path is missing.
3. Existing suite: `pnpm -F @ludoforge/engine test` (no engine behavior regressions expected).

### Invariants

1. Ticket dependencies remain resolvable and non-ambiguous.
2. Archival workflow remains the single source of truth.

## Test Plan

### New/Modified Tests

1. `scripts/*dependency*` test (new/modify) — validates pass/fail for existing vs missing ticket dependency paths.

### Commands

1. `node scripts/check-ticket-deps.mjs`
2. `pnpm -F @ludoforge/engine test`
