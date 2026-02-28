# ENGINEARCH-125: Ticket Dependency Reference Integrity and Archive Path Normalization

**Status**: ✅ COMPLETED (2026-02-28)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket/process tooling only
**Deps**: tickets/README.md, docs/archival-workflow.md, archive/tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md

## Problem

Active ticket dependency references can break when source tickets are archived. Broken deps reduce planning reliability and can hide missing preconditions.

## Assumption Reassessment (2026-02-28)

1. `ENGINEARCH-111` is already archived at `archive/tickets/ENGINEARCH-111-unify-query-runtime-shape-inference-surface.md`; references to `tickets/ENGINEARCH-111...` are stale.
2. A dependency checker already exists (`scripts/check-ticket-deps.mjs`) with tests (`scripts/check-ticket-deps.test.mjs`), but it is not yet wired into the default root test workflow and is not documented in `tickets/README.md`.
3. Current checker output confirms additional active stale refs beyond this ticket: `ENGINEARCH-128` and `ENGINEARCH-132`.
4. Corrected scope: repair all currently broken active ticket deps, wire the existing checker into the default quality gate, and document the command/expectations.

## Architecture Check

1. Dependency-integrity checks are cleaner and more robust than manual spot-checking because they provide deterministic failure on broken planning links.
2. This work is repository-process only; it does not alter GameDef, simulator, runtime, or GameSpecDoc semantics.
3. No backwards-compatibility aliasing/shims: canonical dependency paths must exist as written.
4. Using one canonical checker in root `test` is more beneficial than optional/manual invocation because ticket graph integrity becomes a non-skippable invariant.

## What to Change

### 1. Repair current broken dependency references

Update active tickets that reference archived files via stale `tickets/...` paths to explicit existing paths (`archive/tickets/...` when archived).

### 2. Complete dependency integrity checker coverage and wiring

Keep `scripts/check-ticket-deps.mjs` as the canonical checker, strengthen tests for archive-path/multi-dependency cases if needed, and treat it as the single enforcement surface.

### 3. Integrate checker into default local workflow

Add a documented command and wire it into the root `test` quality gate so broken dependencies are caught before merge.

## Files to Touch

- `tickets/ENGINEARCH-125-ticket-dependency-reference-integrity-and-archive-path-normalization.md` (modify)
- `tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md` (modify)
- `tickets/ENGINEARCH-132-free-operation-zone-filter-binding-resolution-contract.md` (modify)
- `scripts/check-ticket-deps.mjs` (existing, no contract expansion expected)
- `tickets/README.md` (modify)
- `package.json` (modify)
- `scripts/check-ticket-deps.test.mjs` (modify)

## Out of Scope

- Semantic validation of whether a dependency is the "right" one architecturally.
- Archiving workflow changes beyond dependency-path correctness checks.

## Acceptance Criteria

### Tests That Must Pass

1. Checker fails on a non-existent `**Deps**` path and reports the exact ticket file + missing path.
2. Checker passes when dependencies resolve to existing `tickets/...`, `archive/tickets/...`, `specs/...`, or other repo files.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every active ticket dependency path resolves to an existing repository file.
2. Archive moves cannot silently break active dependency graphs without failing checks.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.test.mjs` — validate pass/fail behavior, including archive-path and comma-delimited multi-dependency cases.
2. `node scripts/check-ticket-deps.mjs` against active repo tickets — live regression for stale dependency references after archival.

### Commands

1. `node --test scripts/check-ticket-deps.test.mjs`
2. `node scripts/check-ticket-deps.mjs`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Repaired stale `**Deps**` paths in active tickets:
    - `ENGINEARCH-125` now depends on archived `ENGINEARCH-111` path.
    - `ENGINEARCH-128` now depends on archived `ENGINEARCH-111` path.
    - `ENGINEARCH-132` now depends on archived `ENGINEARCH-123` and `ENGINEARCH-124` paths.
  - Wired dependency integrity checker into default root quality gate:
    - Added `check:ticket-deps` script in root `package.json`.
    - Updated root `test` script to run dependency check before workspace tests.
  - Documented dependency integrity command and gate behavior in `tickets/README.md`.
  - Strengthened `scripts/check-ticket-deps.test.mjs` with mixed active+archived dependency-path coverage.
- **Deviations from original plan**:
  - Checker and base tests already existed; implementation focused on wiring, documentation, and regression coverage rather than creating new checker files.
  - Fixed additional stale active-ticket deps (`ENGINEARCH-128`, `ENGINEARCH-132`) discovered during reassessment.
- **Verification results**:
  - `node --test scripts/check-ticket-deps.test.mjs` passed.
  - `node scripts/check-ticket-deps.mjs` passed (`13 active tickets`).
  - `pnpm -F @ludoforge/engine test` passed (`318/318`).
  - `pnpm turbo lint` passed.
