# KERQUERY-020: Enforce archived Outcome fact integrity

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — process/tooling integrity for archived ticket outcomes
**Deps**: docs/archival-workflow.md, scripts/check-ticket-deps.mjs, scripts/check-ticket-deps.test.mjs, archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md

## Problem

Archived ticket `Outcome` sections can become stale after follow-up implementation changes. Current integrity checks validate active-ticket deps/references but do not detect contradictory archived Outcome claims (for example saying a path had no changes while the same Outcome claims it changed).

## Assumption Reassessment (2026-03-05)

1. `docs/archival-workflow.md` requires amending archived outcomes when facts become stale.
2. Existing automated checks (`check-ticket-deps`) validate active-ticket dependency/reference integrity only; they do not validate archived Outcome fact consistency.
3. `scripts/check-ticket-deps.test.mjs` already exists and is the canonical place to add regression coverage for ticket-integrity checker behavior.
4. No active ticket currently adds automated safeguards for archived Outcome fact integrity.

## Architecture Check

1. The cleanest architecture is one canonical ticket-integrity gate (`check-ticket-deps`) with modular checks for active and archived ticket contracts.
2. Checker-level enforcement prevents documentation/process drift without adding runtime or game-specific behavior.
3. No backwards-compatibility aliases/shims: contradictory archived claims should fail fast and be corrected directly.

## What to Change

### 1. Add archived-Outcome contradiction checks

1. Extend ticket integrity tooling to parse archived ticket `Outcome` sections and detect explicit self-contradictory path claims.
2. Start with high-signal patterns using explicit path literals (backticked repo paths), so false positives stay low.

### 2. Integrate into existing dependency integrity workflow

1. Run the archived-Outcome check from `pnpm run check:ticket-deps` (same command surface).
2. Emit actionable diagnostics (ticket path + offending line).

## Files to Touch

- `scripts/check-ticket-deps.mjs` (modify)
- `scripts/check-ticket-deps.test.mjs` (modify)
- `docs/archival-workflow.md` (modify if procedure wording needs clarification)

## Out of Scope

- Engine runtime behavior changes
- Query runtime cache and trigger dispatch architecture tickets (`archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`, `archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Integrity check flags explicit archived-Outcome path contradictions with actionable diagnostics.
2. `pnpm run check:ticket-deps` passes on clean state.
3. Existing suite: `pnpm test`.

### Invariants

1. Archived outcomes remain factual and maintainable over iterative implementation.
2. Process/tooling remains independent from game-specific runtime behavior.

## Test Plan

### New/Modified Tests

1. `scripts/check-ticket-deps.test.mjs` — failing case: archived Outcome contains both a negative path claim (`no <path> changes` / `<path> unchanged`) and a positive changed-path claim for the same path.
2. `scripts/check-ticket-deps.test.mjs` — passing case: archived Outcome mentions unchanged path claims that do not conflict with changed-path claims.

### Commands

1. `pnpm run check:ticket-deps`
2. `node --test scripts/check-ticket-deps.test.mjs`
3. `pnpm test`
4. `pnpm lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Extended `scripts/check-ticket-deps.mjs` with archived-ticket Outcome parsing and contradiction detection for explicit path claims (`no <path> changes` / `<path> unchanged` vs changed-path claims), with file+line diagnostics.
  - Kept the architecture on a single integrity command surface (`pnpm run check:ticket-deps`) instead of adding a separate checker command.
  - Added regression coverage in `scripts/check-ticket-deps.test.mjs` for both failing and passing archived-Outcome claim scenarios.
  - Clarified `docs/archival-workflow.md` step 8 so the workflow explicitly states archived Outcome contradiction validation.
- **Deviations from original plan**:
  - None in behavior scope; implementation stayed on the planned tooling-only path.
- **Verification results**:
  - `node --test scripts/check-ticket-deps.test.mjs` passed.
  - `pnpm run check:ticket-deps` passed.
  - `pnpm test` passed.
  - `pnpm lint` passed.
