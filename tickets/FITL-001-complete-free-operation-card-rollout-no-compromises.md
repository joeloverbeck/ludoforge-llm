# FITL-001: Complete Free-Operation Card Rollout For 23 44 46 And 62 With No-Compromise Coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — depends on the generic free-operation redesign, plus FITL data/test updates
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-001-unify-ready-pending-free-operation-grant-move-seeding.md`, `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md`, `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-content-event-decks.md`, `/home/joeloverbeck/projects/ludoforge-llm/reports/fire-in-the-lake-rules-section-1.md`, `/home/joeloverbeck/projects/ludoforge-llm/reports/fire-in-the-lake-rules-section-5.md`, `/home/joeloverbeck/projects/ludoforge-llm/reports/fire-in-the-lake-rules-section-6.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-operation-attleboro.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`

## Problem

The FITL cards involved in the current free-operation architecture failure are intertwined:

- `card-23` Operation Attleboro
- `card-44` Ia Drang
- `card-46` 559th Transport Grp
- `card-62` Cambodian Civil War

They all depend on robust generic support for:

- required chained free operations
- cross-seat grant execution
- Monsoon exceptions
- zone-restricted operations
- grant-rooted sequence enforcement
- post-grant event effect timing

The end state must not leave any of these cards partially implemented, partially tested, or “working except for one engine edge case”. All four cards must be fully correct to rules/playbook detail, with edge cases explicitly covered.

## Assumption Reassessment (2026-03-11)

1. The relevant FITL card data and integration tests already exist, but the current engine architecture is preventing a clean, simultaneous green state across all four cards.
2. `card-62` data is partly updated already, but that implementation cannot be considered done until the generic engine redesign lands and the broader regressions are green.
3. The proper scope is not “fix Cambodian Civil War only”; it is to complete the entire affected grant-driven card cluster after the generic engine work, then prove correctness with exhaustive tests.

## Architecture Check

1. This ticket stays clean by treating the engine redesign as a dependency and limiting FITL work to game data plus rule-faithful tests. It avoids smuggling FITL-specific exceptions into generic engine code.
2. All FITL-specific behavior remains in `GameSpecDoc` content and FITL tests. `GameDef` compilation and simulation stay agnostic.
3. No backwards-compatibility aliasing or legacy card-path preservation is allowed. Card behavior should be expressed in the current declarative model once the generic engine architecture is corrected.

## What to Change

### 1. Finish And Validate Card Data For The Affected FITL Cards

Audit and, where needed, correct the declarative implementation for:

- `card-23` Operation Attleboro
- `card-44` Ia Drang
- `card-46` 559th Transport Grp
- `card-62` Cambodian Civil War

That audit must use the FITL rules references in `reports/fire-in-the-lake-rules*` and existing playbook guidance where applicable.

### 2. Expand Edge-Case Coverage Without Compromise

For each of the four cards, add or strengthen tests covering the edge cases that actually stress the redesigned grant architecture and rules details.

At minimum this includes:

- required grant sequencing
- Monsoon overrides where applicable
- no-op suppression where event play requires a usable opening grant
- zone/destination restrictions
- cross-seat control handoff
- tunneled / untunneled base behavior
- capped or reduced-count removal/placement behavior
- deferred post-grant event effects

### 3. Prove Broad Regression Safety For The Whole Cluster

Do not stop at local green tests for one card. The ticket is only complete when the whole affected FITL card cluster is green together and the generic free-operation regression suite remains green.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-operation-attleboro.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-us.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1968-arvn.test.ts` (modify)

## Out of Scope

- UI or visual changes
- FITL cards outside the affected free-operation cluster unless they fail as a direct consequence of the redesign
- preserving older stub text or legacy card behaviors for compatibility

## Acceptance Criteria

### Tests That Must Pass

1. `card-23`, `card-44`, `card-46`, and `card-62` are fully implemented to current rules/playbook detail and represented declaratively in FITL data.
2. Each of those cards has explicit integration coverage for edge cases, not just happy paths.
3. `card-62` is not considered complete until both unshaded branches and shaded placement behavior are green together with the neighboring free-operation cards.
4. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-operation-attleboro.test.js`
5. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
6. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
7. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
8. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
9. Existing suite: `pnpm turbo test`

### Invariants

1. FITL-specific behavior is expressed in FITL data and FITL tests, not in agnostic kernel branches.
2. No card in the affected cluster is left “temporarily” partially implemented or waived through with known edge-case failures.
3. Every free-operation sequence in the affected cards is validated through the same generic engine path introduced by `ENG-001`.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-operation-attleboro.test.ts` — verify chained free operation behavior remains correct after the generic redesign.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` — verify no-op suppression, sequence capture, and Monsoon behavior still hold.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts` — verify the shaded required free `Infiltrate` window and deferred payout path, including unusable-grant fallback.
4. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` — verify both unshaded branches, Cambodia-only `Air Lift`, Monsoon sweep, tunneled-base immunity, and capped base removal / placement.
5. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-nva.test.ts` — keep encoded card metadata/text coverage in sync for `Ia Drang` and `559th Transport Grp`.
6. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-us.test.ts` and `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1968-arvn.test.ts` — keep summary/deck-level coverage in sync for `Operation Attleboro` and `Cambodian Civil War`.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-operation-attleboro.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
6. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
7. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
8. `pnpm turbo test`
