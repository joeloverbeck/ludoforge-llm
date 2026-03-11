# FITL-001: Complete Free-Operation Card Rollout For 23 44 46 And 62 With No-Compromise Coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Reassessed as verification/archive only
**Engine Changes**: No further changes required after reassessment
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-001-unify-ready-pending-free-operation-grant-move-seeding.md`, `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-content-event-decks.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-operation-attleboro.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-nva.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-us.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1968-arvn.test.ts`

## Problem

The original ticket assumed the free-operation architecture and the FITL card rollout were still incomplete. That assumption is no longer true in the current repository state.

The repo already contains:

- the generic legal-move and grant-seeding redesign completed under `ENG-001`
- declarative FITL data for `card-23`, `card-44`, `card-46`, and `card-62`
- dedicated integration coverage for each of those cards
- generic free-operation regression coverage that exercises the same architecture
- deck metadata/spec coverage for the affected 1965/1968 card groups

## Assumption Reassessment (2026-03-11)

1. The generic free-operation redesign is not a pending dependency. It is already implemented and archived under `ENG-001`.
2. `card-62` is not partially updated. Both unshaded branches and shaded placement behavior are already encoded and covered by dedicated integration tests.
3. The broader four-card cluster is not waiting on a future “simultaneous green state”. The relevant targeted suites are already green together in the current codebase.
4. The ticket's original scope is stale. The remaining useful work is verification, documentation correction, and archival rather than additional engine or FITL implementation.

## Architecture Check

1. The architecture this ticket was aiming for is the better architecture, and the current repo already follows it.
2. Free-operation sequencing, viability, Monsoon handling, and grant-rooted execution are implemented generically in the engine rather than via FITL-specific kernel branches.
3. FITL-specific behavior for these cards is encoded declaratively in event data and validated through FITL tests.
4. No backwards-compatibility aliasing is needed here. The repo has already converged on the cleaner path; adding more code for this ticket would be churn, not improvement.

## Corrected Scope

1. Verify that the existing implementations for `card-23`, `card-44`, `card-46`, and `card-62` still pass together with the generic grant suite and deck metadata suites.
2. Confirm that the architecture remains generic and declarative rather than FITL-hardcoded.
3. Archive this ticket with an accurate outcome instead of duplicating work already completed elsewhere.

## Files To Touch

- `/home/joeloverbeck/projects/ludoforge-llm/tickets/FITL-001-complete-free-operation-card-rollout-no-compromises.md` (modify, then archive)

## Out Of Scope

- further engine changes without a reproduced failing test
- further FITL card-data changes without a demonstrated rules gap
- adding duplicate tests for behaviors already covered by the existing targeted and package-level suites

## Acceptance Criteria

1. The ticket documents that the original implementation assumptions were stale.
2. Verification confirms that `card-23`, `card-44`, `card-46`, and `card-62` are already implemented and green under the current architecture.
3. The ticket is archived with an accurate `Outcome` section describing what was actually done versus originally planned.

## Test Plan

### New/Modified Tests

1. None. Reassessment showed the required coverage already exists in the current repo, so additional tests would duplicate existing protection rather than strengthen an uncovered invariant.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-operation-attleboro.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
6. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
7. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
8. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
9. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1965-us.test.js`
10. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1968-arvn.test.js`
11. `pnpm -F @ludoforge/engine test`
12. `pnpm -F @ludoforge/engine lint`
13. `pnpm -F @ludoforge/engine typecheck`
14. `pnpm turbo test`
15. `pnpm turbo lint`
16. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-03-11
- What actually changed:
  - reassessed the ticket against the current engine, FITL data, and test suite
  - corrected the ticket scope from “implement the cluster” to “verify and archive already completed work”
  - verified the four-card FITL cluster, generic free-operation grants, package-level engine checks, and workspace-wide test/lint/typecheck commands
- Deviations from original plan:
  - no engine code, FITL data, or test code changes were required because the intended architecture and coverage were already present
  - no new tests were added because the existing targeted and broad suites already covered the cited invariants and edge cases
- Verification results:
  - `pnpm run check:ticket-deps`
  - `pnpm -F @ludoforge/engine build`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-operation-attleboro.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1965-us.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-1968-arvn.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
