# ENGINEARCH-099: Active Ticket Dependency Reference Integrity

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket hygiene and validation scripting
**Deps**: docs/archival-workflow.md

## Problem

Active tickets currently reference archived/non-existent dependency paths, which weakens planning reliability and creates confusion in implementation sequencing.

## Assumption Reassessment (2026-02-27)

1. Active ticket dependencies are expected to resolve to existing repository files so dependency chains remain auditable.
2. Current active tickets include dependency paths that no longer exist at referenced locations:
   - `tickets/ENGINEARCH-103-event-card-sequence-diagnostics-default-domain-parity.md` -> `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md` (moved to archive)
   - `tickets/ENGINEARCH-104-free-operation-effective-domain-compiler-runtime-parity.md` -> `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md` (moved to archive)
   - `tickets/ENGINEARCH-112-probe-authority-runtime-invariant-guards.md` -> `tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md` (moved to archive)
   - `tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md` -> `tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md` (moved to archive)
3. Mismatch: ticket dependency references are stale in multiple active tickets. Corrected scope: fix all currently broken dependency paths, add a deterministic validator, and document the enforcement rule.

## Architecture Check

1. Dependency integrity checks keep ticket workflow deterministic and auditable.
2. This is process-layer only and does not alter GameDef/runtime architecture.
3. No compatibility aliases; stale references are corrected directly.

## What to Change

### 1. Fix stale dependency references in active tickets

Update broken `**Deps**` links to valid current targets (active ticket, spec, or archived artifact path as appropriate).

### 2. Add dependency-reference validation check

Add a small script/check that validates `**Deps**` paths in active tickets resolve to existing files.

### 3. Document enforcement in ticket authoring docs

Update ticket docs with explicit dependency-link validation expectation.

## Files to Touch

- `tickets/ENGINEARCH-103-event-card-sequence-diagnostics-default-domain-parity.md` (modify)
- `tickets/ENGINEARCH-104-free-operation-effective-domain-compiler-runtime-parity.md` (modify)
- `tickets/ENGINEARCH-112-probe-authority-runtime-invariant-guards.md` (modify)
- `tickets/ENGINEARCH-113-discriminated-decision-authority-context-contract.md` (modify)
- `tickets/README.md` (modify)
- `scripts/check-ticket-deps.mjs` (add)
- `scripts/check-ticket-deps.test.mjs` (add)

## Out of Scope

- Ticket content scope changes beyond dependency-link correctness.
- Runtime/compiler code changes.

## Acceptance Criteria

### Tests That Must Pass

1. All active `tickets/*.md` `**Deps**` references resolve to existing files.
2. Validation check fails when a dependency path is missing.
3. Existing suite: `pnpm -F @ludoforge/engine test` (no engine behavior regressions expected).
4. Lint passes after script additions/updates.

### Invariants

1. Ticket dependencies remain resolvable and non-ambiguous.
2. Archival workflow remains the single source of truth.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.test.mjs` (new) — validates pass/fail for existing, missing, and malformed `**Deps**` references.
2. Ticket-file updates in `tickets/ENGINEARCH-103`, `tickets/ENGINEARCH-104`, `tickets/ENGINEARCH-112`, and `tickets/ENGINEARCH-113` (modified) — validate repaired references by running the dependency check script.

### Commands

1. `node scripts/check-ticket-deps.mjs`
2. `node --test scripts/check-ticket-deps.test.mjs`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

1. Corrected stale `**Deps**` references in active tickets `ENGINEARCH-103`, `ENGINEARCH-104`, `ENGINEARCH-112`, and `ENGINEARCH-113` to current existing archive paths.
2. Added `scripts/check-ticket-deps.mjs` and `scripts/check-ticket-deps.test.mjs` to enforce dependency-path integrity in active tickets.
3. Updated `tickets/README.md` dependency rule wording to require resolvable repository paths (active or archived), matching current repository workflow.
