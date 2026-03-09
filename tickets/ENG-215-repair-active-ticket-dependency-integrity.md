# ENG-215: Repair Active Ticket Dependency Integrity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket metadata integrity only
**Deps**: tickets/README.md, tickets/ENG-213-codify-free-op-probe-semantics-boundary.md, archive/tickets/ENG/ENG-210-extract-free-op-viability-probe-boundary.md, archive/tickets/ENG/ENG-212-fix-sequence-probe-usability-false-negatives.md

## Problem

At least one active ticket (`ENG-213`) still references dependency paths that were moved to archive, violating dependency-path integrity expectations and increasing planning drift risk.

## Assumption Reassessment (2026-03-09)

1. Active tickets must reference existing dependency paths, including archived paths when explicit.
2. `ENG-213` currently references `tickets/ENG-210-...` and `tickets/ENG-212-...` paths that no longer exist in `tickets/`.
3. Mismatch: current deps do not match repository state. Correction: rewrite deps to canonical archived paths and re-validate via `pnpm run check:ticket-deps`.

## Architecture Check

1. Clean ticket dependency contracts are required for robust architecture governance and planning correctness.
2. This is process metadata only; no `GameDef`/runtime behavior is changed and no game-specific logic is introduced.
3. No compatibility aliases; use one canonical path per dependency.

## What to Change

### 1. Fix stale dependency paths in active tickets

Update active ticket `**Deps**` fields where dependencies were archived or moved.

### 2. Validate dependency integrity gate

Run ticket dependency checks and ensure active tickets pass without path drift.

## Files to Touch

- `tickets/ENG-213-codify-free-op-probe-semantics-boundary.md` (modify)
- `tickets/<other-active-ticket-if-needed>.md` (modify only if stale deps are found)

## Out of Scope

- Any engine/runtime/test implementation changes.
- Archiving or editing completed ticket outcomes beyond dependency reference fixes in active tickets.

## Acceptance Criteria

### Tests That Must Pass

1. All active ticket `**Deps**` paths resolve to existing files.
2. `pnpm run check:ticket-deps` passes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active ticket dependency graph remains deterministic and repository-accurate.
2. Dependency-path corrections do not alter implementation scope semantics.

## Test Plan

### New/Modified Tests

1. None — relies on existing dependency integrity command and test gate.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine test`
