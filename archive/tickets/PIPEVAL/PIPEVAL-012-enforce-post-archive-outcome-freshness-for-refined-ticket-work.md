# PIPEVAL-012: Enforce post-archive Outcome freshness for refined ticket work

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — repo process/tooling guardrails only
**Deps**: `docs/archival-workflow.md`, `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md`

## Problem

When implementation is refined after archival, archived ticket `Outcome` sections can become stale. This weakens traceability and can misstate final architecture ownership, even when code/tests are correct.

## Assumption Reassessment (2026-03-05)

1. `docs/archival-workflow.md` already requires archived Outcome freshness after post-archive refinements.
2. Current automated checks (`check:ticket-deps`) validate dependency integrity and contradictory path claims, but do not enforce that post-archive refinements update archived Outcome content.
3. Revalidation result: `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md` is currently a single-touch archived record in git history and does not currently demonstrate a confirmed stale-Outcome mismatch.
4. Global historical retrofit is out of scope; any enforcement must be low-noise and forward-only to avoid forcing broad backfill across legacy archived tickets.

## Architecture Check

1. Enforcing Outcome freshness improves architectural auditability and reduces long-term drift between implementation and documented intent.
2. This is process integrity only; it does not alter GameSpecDoc/GameDef/runtime semantics.
3. No backwards-compatibility aliasing or shim behavior is involved.

## What to Change

### 1. Add repository check for post-completion archived ticket amendments (forward-only policy window)

Extend ticket integrity tooling to enforce Outcome amendment freshness for archived tickets completed on/after a policy-effective date.

Deterministic rule:
- if an archived ticket has an `Outcome` completion date in the policy window
- and git history shows the archived ticket file has more than one commit touch (post-completion edit/refinement)
- then the `Outcome` section must include `Outcome amended: YYYY-MM-DD`

Fail fast with actionable guidance.

### 2. Add explicit amendment marker convention

Define a concise convention in archival docs for post-archive amendments (for example `Outcome amended: YYYY-MM-DD`) so the checker can reliably detect updates.

### 3. Amend known stale archived ticket

No mandatory backfill for previously archived tickets outside policy window.
If a stale archived ticket is found within the policy window during implementation, amend it.

## Files to Touch

- `docs/archival-workflow.md` (modify)
- `scripts/check-ticket-deps.mjs` (modify)
- `scripts/check-ticket-deps.test.mjs` (modify)
- `tickets/README.md` (modify only if needed to mirror checker behavior guidance)

## Out of Scope

- Changing implementation behavior in engine/runtime/simulator
- Altering ticket archival directory topology
- Retrofitting every historical archived ticket in one pass
- Enforcing freshness retroactively for archived tickets completed before the policy-effective date

## Acceptance Criteria

### Tests That Must Pass

1. Repository check fails when a policy-window archived ticket is refined (multi-commit touch) without required `Outcome amended` marker.
2. Repository check passes once archived Outcome includes the required amendment marker per convention.
3. Existing suite: `pnpm run check:ticket-deps`
4. Lint gate remains green: `pnpm turbo lint`

### Invariants

1. Archived tickets remain accurate records of final implemented architecture in the branch being merged.
2. Process checks remain deterministic and low-noise for active development.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.test.mjs` — verify forward-only amendment enforcement for policy-window archived tickets and pass/fail transitions.
2. `scripts/check-ticket-deps.test.mjs` — verify invalid amendment chronology (`Outcome amended` earlier than completion date) fails deterministically.

### Commands

1. `node --test scripts/check-ticket-deps.test.mjs`
2. `pnpm run check:ticket-deps`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Added forward-only Outcome freshness enforcement to `scripts/check-ticket-deps.mjs`:
    - policy-effective date gate (`2026-03-05`)
    - post-completion edit detection using archived ticket git touch count
    - required `Outcome amended: YYYY-MM-DD` marker when policy-window archived tickets are edited post-completion
    - chronology guard so amendment date cannot be earlier than completion date
  - Extended `scripts/check-ticket-deps.test.mjs` with targeted git-history-backed coverage for:
    - missing amendment marker failure on post-completion edits
    - pass case when amendment marker exists
    - invalid amendment-date chronology failure
  - Updated `docs/archival-workflow.md` with explicit amendment-marker convention and policy-effective date guidance.
  - Updated `tickets/README.md` to mirror the checker’s archived-Outcome freshness behavior.
- **Deviations from original plan**:
  - Scope was corrected before implementation: no confirmed stale mismatch existed in `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md`, so no archived ticket backfill/amendment was required.
  - Chosen architecture avoided broad historical retrofits and brittle branch-relative heuristics in favor of deterministic forward-only enforcement.
- **Verification results**:
  - `node --test scripts/check-ticket-deps.test.mjs` ✅
  - `pnpm run check:ticket-deps` ✅
  - `pnpm turbo test --force` ✅
  - `pnpm turbo lint` ✅
