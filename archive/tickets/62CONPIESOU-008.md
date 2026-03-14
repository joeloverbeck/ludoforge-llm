# 62CONPIESOU-008: Reassess card 87 prioritized sourcing follow-up

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, archive/tickets/KERQUERY/62CONPIESOU-002-compiler-facing-prioritized-query-support.md, archive/tickets/62CONPIESOU-004.md, archive/tickets/62CONPIESOU-005.md, archive/specs/62-conditional-piece-sourcing.md, archive/specs/62b-incremental-choice-protocol.md, archive/tickets/62BINCCHOPRO-008.md

## Problem

This ticket originally assumed card 87 (`Nguyen Chanh Thi`) still needed to be re-authored from `concat` to `prioritized`.

That assumption is no longer true in the current repository. The real task here is to correct the ticket so it matches the codebase, verify that the architecture already in place is the durable one, and archive this stale follow-up without reopening solved implementation work.

## Assumption Reassessment (2026-03-14)

1. Card 87 in [065-096.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-events/065-096.md) already uses `query: prioritized` with `qualifierKey: type` for the unshaded ARVN piece selector. The original `concat` assumption was incorrect.
2. The spec path referenced by the original ticket has been archived. The correct references are [62-conditional-piece-sourcing.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-conditional-piece-sourcing.md) for the query architecture and [62b-incremental-choice-protocol.md](/home/joeloverbeck/projects/ludoforge-llm/archive/specs/62b-incremental-choice-protocol.md) for the completed incremental `chooseN` protocol.
3. The repository already contains real integration coverage for card 87 in [fitl-events-nguyen-chanh-thi.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts) and generic non-FITL prioritized `chooseN` coverage in [prioritized-choose-n.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/prioritized-choose-n.test.ts).
4. Archived ticket [62BINCCHOPRO-008.md](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/62BINCCHOPRO-008.md) already captured the remaining integration-test work that this ticket and ticket `009` originally pointed at.

## Scope Correction

### In Scope

- Correct this ticket's assumptions, dependency references, and scope so they match the current repository.
- Re-evaluate whether any card-87 implementation work is still justified.
- Re-run the relevant verification suite to confirm the current architecture and tests still hold.
- Archive this ticket as completed because its originally proposed implementation is already present.

### Out of Scope

- Re-authoring card 87 YAML again
- Engine source changes
- New aliasing or backward-compatibility shims
- Reworking the already-correct prioritized architecture into staged or game-specific logic

## Architecture Reassessment

1. The current architecture is preferable to the original ticket's implied follow-up because it is already the clean end state: authored YAML expresses the rule with `prioritized` plus `qualifierKey: type`, and the kernel enforces legality generically.
2. Spec 62's direction remains the right long-term architecture: query evaluation stays generic, legality stays engine-owned, and FITL-specific sourcing rules remain authored data rather than engine branches.
3. Spec 62b's completed incremental `chooseN` protocol is the missing piece the original ticket was waiting on. That work is already landed and is more robust than any one-off card 87 patch would have been.
4. Reopening card 87 for another data-only rewrite would be worse architecture, not better. It would duplicate solved work and risk drifting from the now-verified generic prioritized-selection path.

## What Actually Needed Doing

1. Confirm the ticket's original assumptions against the current code and tests.
2. Update the ticket to reflect that no implementation changes are still required for card 87.
3. Validate the existing implementation by rerunning the relevant build, lint, and test commands.
4. Archive the ticket with an outcome note describing the discrepancy between the original plan and the actual repository state.

## Files Touched

- `tickets/62CONPIESOU-008.md` before archival

## Test Plan

### New/Modified Tests

1. No test files were modified in this ticket.

### Existing Tests Re-Run

1. `pnpm turbo build`
2. `pnpm turbo lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`

## Acceptance Criteria

1. This ticket no longer claims card 87 still uses `concat`.
2. Dependency references point to the current archived spec/ticket locations where appropriate.
3. The ticket explicitly records that the existing prioritized architecture is the correct durable design.
4. Relevant build, lint, unit/integration, and e2e verification passes without additional code changes.
5. The ticket is archived with an outcome explaining what was actually changed versus originally planned.

## Outcome

- What actually changed:
  - Corrected the ticket to match the current repository state instead of the obsolete assumption that card 87 still needed re-authoring.
  - Verified that the repository already contains the intended architecture and the relevant coverage for real FITL card 87 behavior plus a generic non-FITL prioritized-selection fixture.
- Deviations from original plan:
  - No data-file or engine changes were needed because the original implementation goal was already complete.
  - No new tests were added because the previously missing regression coverage had already landed under archived ticket `62BINCCHOPRO-008`.
