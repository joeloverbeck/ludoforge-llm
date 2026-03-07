# LEGACTTOO-033: Ticket Dependency Integrity After Archival Moves

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket/spec workflow and quality-gate integrity only
**Deps**: docs/archival-workflow.md, tickets/README.md

## Problem

Active tickets currently reference archived work using stale paths after archival moves (for example dependency entries still pointing at `tickets/...` after the source was moved to `archive/tickets/...`). This weakens ticket dependency integrity and can break automation (`check:ticket-deps`) or create false confidence in traceability.

## Assumption Reassessment (2026-03-07, corrected 2026-03-07)

1. `tickets/README.md` requires dependency references to point to existing repository files. Confirmed in `tickets/README.md`.
2. `LEGACTTOO-031` is **archived** (not active) at `archive/tickets/LEGACTTOO/LEGACTTOO-031-limit-identity-invariant-test-hardening.md`. Its deps reference stale path `tickets/LEGACTTOO-030-...` but LEGACTTOO-030 is also archived at `archive/tickets/LEGACTTOO/LEGACTTOO-030-first-class-limit-identity-contract.md`. No active tickets have stale deps.
3. Archival workflow (`docs/archival-workflow.md`) already documents that the archive script rewrites active ticket deps (step 5) and requires `check:ticket-deps` (step 8). The gap is that archived ticket deps are not rewritten by the script, and this edge case is not documented.

## Architecture Check

1. Keeping dependency references valid is a core quality invariant: implementation planning and architecture sequencing must remain mechanically verifiable.
2. This is workflow-level hygiene and does not introduce game-specific logic into engine/runtime contracts.
3. No compatibility aliasing/shims: dependencies should point directly at real canonical file paths.

## What to Change

### 1. Repair existing stale dependency references

Fix the stale dep in archived `archive/tickets/LEGACTTOO/LEGACTTOO-031-limit-identity-invariant-test-hardening.md`: update `tickets/LEGACTTOO-030-...` → `archive/tickets/LEGACTTOO/LEGACTTOO-030-first-class-limit-identity-contract.md`.

### 2. Add archival follow-through step for archived ticket deps

Extend archival workflow guidance to note that the archive script rewrites deps in active tickets only; archived tickets with stale deps should be fixed manually when discovered.

### 3. Guard with dependency check command in ticket workflow

Already covered by `docs/archival-workflow.md` step 8 and `tickets/README.md`. No further changes needed.

## Files to Touch

- `archive/tickets/LEGACTTOO/LEGACTTOO-031-limit-identity-invariant-test-hardening.md` (modify — fix stale dep path)
- `docs/archival-workflow.md` (modify — add note about archived ticket deps)
- `tickets/README.md` (no changes needed — already documents dep integrity)

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
