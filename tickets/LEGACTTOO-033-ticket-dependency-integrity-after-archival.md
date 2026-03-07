# LEGACTTOO-033: Ticket Dependency Integrity After Archival Moves

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket/spec workflow and quality-gate integrity only
**Deps**: docs/archival-workflow.md, tickets/README.md

## Problem

Active tickets currently reference archived work using stale paths after archival moves (for example dependency entries still pointing at `tickets/...` after the source was moved to `archive/tickets/...`). This weakens ticket dependency integrity and can break automation (`check:ticket-deps`) or create false confidence in traceability.

## Assumption Reassessment (2026-03-07)

1. `tickets/README.md` requires dependency references to point to existing repository files. Confirmed in `tickets/README.md`.
2. `LEGACTTOO-031` currently depends on `tickets/LEGACTTOO-030...`, but `030` has been archived under `archive/tickets/LEGACTTOO/...`. Confirmed in `tickets/LEGACTTOO-031-limit-identity-invariant-test-hardening.md` and repository state.
3. Archival workflow is canonicalized in `docs/archival-workflow.md`, but active downstream ticket deps are not automatically normalized after archival moves.

## Architecture Check

1. Keeping dependency references valid is a core quality invariant: implementation planning and architecture sequencing must remain mechanically verifiable.
2. This is workflow-level hygiene and does not introduce game-specific logic into engine/runtime contracts.
3. No compatibility aliasing/shims: dependencies should point directly at real canonical file paths.

## What to Change

### 1. Repair existing stale dependency references

Update active tickets that reference archived tickets via stale `tickets/...` paths to `archive/tickets/...` paths.

### 2. Add archival follow-through step

Extend archival workflow guidance so archiving a ticket includes updating any active ticket deps that reference the moved file.

### 3. Guard with dependency check command in ticket workflow

Ensure workflow docs explicitly require running `pnpm run check:ticket-deps` after archival operations and before submitting related changes.

## Files to Touch

- `tickets/LEGACTTOO-031-limit-identity-invariant-test-hardening.md` (modify)
- `docs/archival-workflow.md` (modify)
- `tickets/README.md` (modify only if needed for explicit post-archive dependency check step)

## Out of Scope

- Engine/kernel/runtime behavior changes
- Test/runtime contract changes unrelated to ticket dependency integrity
- Any game-specific data/spec changes

## Acceptance Criteria

### Tests That Must Pass

1. All active ticket `**Deps**` paths resolve to existing files.
2. `pnpm run check:ticket-deps` passes after archival/dependency updates.
3. Existing suite: `pnpm run check:ticket-deps`

### Invariants

1. Active ticket dependency graph references only existing canonical repository paths.
2. Archival does not silently break downstream ticket traceability.

## Test Plan

### New/Modified Tests

1. N/A — enforced by existing dependency integrity command.

### Commands

1. `pnpm run check:ticket-deps`
