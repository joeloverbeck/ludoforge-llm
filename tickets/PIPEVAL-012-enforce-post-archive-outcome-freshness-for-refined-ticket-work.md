# PIPEVAL-012: Enforce post-archive Outcome freshness for refined ticket work

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — repo process/tooling guardrails only
**Deps**: `docs/archival-workflow.md`, `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md`

## Problem

When implementation is refined after archival, archived ticket `Outcome` sections can become stale. This weakens traceability and can misstate final architecture ownership, even when code/tests are correct.

## Assumption Reassessment (2026-03-05)

1. `docs/archival-workflow.md` already requires archived Outcome freshness after post-archive refinements.
2. Current automated checks (`check:ticket-deps`) validate dependency integrity and contradictory path claims, but do not enforce that post-archive refinements update archived Outcome content.
3. Real mismatch observed: an archived PIPEVAL ticket Outcome can omit later architecture hardening done in the same workstream.

## Architecture Check

1. Enforcing Outcome freshness improves architectural auditability and reduces long-term drift between implementation and documented intent.
2. This is process integrity only; it does not alter GameSpecDoc/GameDef/runtime semantics.
3. No backwards-compatibility aliasing or shim behavior is involved.

## What to Change

### 1. Add repository check for stale archived outcomes after tracked refinements

Extend ticket integrity tooling to flag likely stale archived Outcome sections when:
- archived ticket path changed in history during current branch work
- additional related source/test files changed after archival without corresponding Outcome amendment marker

Use deterministic heuristics and fail fast with actionable guidance.

### 2. Add explicit amendment marker convention

Define a concise convention in archival docs for post-archive amendments (for example `Outcome amended: YYYY-MM-DD`) so the checker can reliably detect updates.

### 3. Amend known stale archived ticket

Update the referenced archived PIPEVAL ticket Outcome so it reflects the later named-set canonicalization hardening completed after initial archival.

## Files to Touch

- `docs/archival-workflow.md` (modify)
- `scripts/check-ticket-deps.mjs` (modify)
- `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md` (modify)
- `package.json` (verify/no-op unless check wiring needs update)
- `tickets/README.md` (modify only if needed to mirror checker behavior guidance)

## Out of Scope

- Changing implementation behavior in engine/runtime/simulator
- Altering ticket archival directory topology
- Retrofitting every historical archived ticket in one pass

## Acceptance Criteria

### Tests That Must Pass

1. Repository check fails when a refined archived ticket lacks required Outcome amendment marker/content.
2. Repository check passes once archived Outcome is amended per convention.
3. Existing suite: `pnpm run check:ticket-deps`

### Invariants

1. Archived tickets remain accurate records of final implemented architecture in the branch being merged.
2. Process checks remain deterministic and low-noise for active development.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.mjs` test coverage (existing script test location) — verify stale-Outcome detection behavior and pass/fail transitions.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm turbo test --force`
