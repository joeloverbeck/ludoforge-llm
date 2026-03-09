# ENG-215: Repair Active Ticket Dependency Integrity

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket metadata integrity only
**Deps**: tickets/README.md, docs/archival-workflow.md, scripts/check-ticket-deps.mjs, archive/tickets/ENG/ENG-213-codify-free-op-probe-semantics-boundary.md

## Problem

This active ticket (`ENG-215`) was written against the pre-archive location of `ENG-213`, but that ticket now lives at `archive/tickets/ENG/ENG-213-codify-free-op-probe-semantics-boundary.md`. Because the dependency checker validates `**Deps**` and inline ticket-path references in active tickets, stale paths fail the repository quality gate.

## Assumption Reassessment (2026-03-09)

1. Active tickets must reference existing dependency paths, including archived paths when explicit.
2. `ENG-213` is no longer active; it is located at `archive/tickets/ENG/ENG-213-codify-free-op-probe-semantics-boundary.md`.
3. Current mismatch is in `ENG-215` itself (`**Deps**` and `Files to Touch`), not in another active ticket.
4. Correction: rewrite this ticket to canonical archived paths and ticket-scope ownership, then re-validate with `pnpm run check:ticket-deps`.

## Architecture Check

1. A strict single-path contract in ticket metadata is more robust than permissive or alias-based references because planning and CI gates stay deterministic.
2. Keeping dependency integrity in-document (rather than introducing script exceptions for stale paths) is cleaner and more extensible: policy stays simple while the checker remains generic.
3. This is process metadata only; no `GameDef`/runtime behavior is changed and no game-specific logic is introduced.

## What to Change

### 1. Repair `ENG-215` stale dependency references

Update this ticket's `**Deps**` and path references to point at the canonical archived `ENG-213` path.

### 2. Validate dependency integrity and regression guard

Run ticket dependency checks and engine tests to ensure no hidden regression in standard quality gates.

## Files to Touch

- `tickets/ENG-215-repair-active-ticket-dependency-integrity.md` (modify)

## Out of Scope

- Any engine/runtime implementation changes.
- Editing archived ticket outcomes.

## Acceptance Criteria

### Tests That Must Pass

1. `ENG-215` contains only resolvable dependency and ticket-path references.
2. `pnpm run check:ticket-deps` passes.
3. Existing suite: `pnpm -F @ludoforge/engine test` passes.

### Invariants

1. Active ticket dependency graph remains deterministic and repository-accurate.
2. Ticket-scope correction remains metadata-only and does not change engine behavior.

## Test Plan

### New/Modified Tests

1. None — relies on existing dependency integrity command and test gate.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-09
- **What actually changed**:
  - Updated `tickets/ENG-215-repair-active-ticket-dependency-integrity.md` `**Deps**` to canonical existing paths.
  - Corrected problem statement, assumptions, scope, and files-to-touch so the ticket addresses the real mismatch (self-references in `ENG-215`), not a nonexistent active `ENG-213`.
  - Removed stale inline reference to `tickets/ENG-213-codify-free-op-probe-semantics-boundary.md` and replaced it with `archive/tickets/ENG/ENG-213-codify-free-op-probe-semantics-boundary.md`.
- **Deviation from original plan**:
  - Original plan targeted edits in active `ENG-213`; actual fix required no changes to `ENG-213` because it was already archived and correct.
  - Scope narrowed to repairing `ENG-215` metadata integrity only.
- **Verification results**:
  - `pnpm run check:ticket-deps` passed.
  - `pnpm -F @ludoforge/engine test` passed (453/453).
  - `pnpm -F @ludoforge/engine lint` passed.
