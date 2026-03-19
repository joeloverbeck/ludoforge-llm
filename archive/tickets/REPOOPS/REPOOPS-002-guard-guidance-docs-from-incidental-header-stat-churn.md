# REPOOPS-002: Guard Guidance Docs from Incidental Header-Stat Churn

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — repo tooling/documentation workflow guard
**Deps**: archive/tickets/REPOOPS/REPOOPS-001-stabilize-guidance-doc-header-stats.md

## Problem

Running index tooling can update header counters in `AGENTS.md` and `CLAUDE.md` even when no documentation policy change is intended. These incidental edits create review noise and merge-conflict risk.

## Assumption Reassessment (2026-03-06)

1. Index refresh operations can rewrite guidance header stats in `AGENTS.md` and `CLAUDE.md`.
2. Discrepancy found: the guard already exists, is wired in root `package.json` `test`, and already has script-level coverage.
3. Existing policy is stricter and cleaner than the original ticket proposal: mixed-purpose changes with counter-only churn are blocked automatically; isolated maintenance-only stat churn is allowed without an override flag.
4. Scope adjustment required: this ticket should verify and close the already-landed guard architecture rather than re-implement it.

## Architecture Check

1. Current architecture (deterministic mixed-change block + isolated-churn allow) is preferable to an explicit override toggle because it removes manual flag handling from the normal path.
2. Adding an override flag now would weaken enforcement and increase accidental bypass risk without adding meaningful extensibility.
3. The implementation is correctly tooling-level and game-agnostic; no GameSpecDoc/GameDef/runtime coupling is introduced.

## What to Change

### 1. Correct ticket assumptions and scope

Update this ticket to reflect that implementation already exists and that override-flag behavior is not part of the chosen architecture.

### 2. Re-verify implementation quality gates

Run relevant tests and lint to confirm current behavior still passes with updated ticket assumptions.

### 3. Finalize and archive

Mark this ticket completed and archive it with an Outcome section documenting what changed versus the original plan.

## Files to Touch

- `tickets/REPOOPS-002-guard-guidance-docs-from-incidental-header-stat-churn.md` (assumptions/scope correction, completion, outcome)
- `archive/tickets/REPOOPS/` (archived ticket destination)

## Out of Scope

- Changes to engine/runtime/kernel behavior.
- Replacing the repository indexing tool.

## Acceptance Criteria

### Tests That Must Pass

1. Existing guard behavior remains correct:
   - mixed-purpose changes with counter-only guidance stat churn fail
   - isolated counter-only churn is allowed
2. Script/unit and repository checks pass:
   - the dedicated guidance-doc header-stat guard tests
   - `pnpm run check:ticket-deps`
   - `pnpm lint`
   - `pnpm test`

### Invariants

1. Incidental doc stat churn cannot silently land with unrelated changes.
2. Enforcement stays tooling-level and game-agnostic.

## Test Plan

### New/Modified Tests

1. No new tests expected unless verification exposes a coverage gap.
2. The dedicated guidance-doc header-stat guard tests are the primary hard-check suite for this ticket reassessment.

### Commands

1. `pnpm run check:ticket-deps`
2. The dedicated guidance-doc header-stat guard tests
3. `pnpm lint`
4. `pnpm test`

## Outcome

- **Completion date**: 2026-03-06
- **What changed**
1. Reassessed the ticket against the current repository and corrected assumptions/scope to match existing implementation in:
   - the dedicated guidance-doc header-stat guard
   - its script-level test coverage
   - root `package.json` guard wiring
2. Updated the architecture decision to keep the existing deterministic guard model (block mixed-purpose counter-only churn; allow isolated maintenance-only churn) and explicitly reject adding a manual override flag.
3. Finalized this ticket as a closure/verification ticket rather than a net-new implementation ticket.
- **Deviations from original plan**
1. No new guard script, package wiring, or guidance-doc override documentation was added, because all core implementation had already landed.
2. No new tests were required; existing guard coverage already captures the critical invariant and edge behavior for this scope.
- **Verification results**
1. The dedicated guidance-doc header-stat guard tests passed.
2. `pnpm run check:ticket-deps` passed.
3. `pnpm lint` passed.
4. `pnpm test` passed.
