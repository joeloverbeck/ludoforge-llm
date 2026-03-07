# LEGACTTOO-029: FITL Card 30 USS New Jersey Grant-Driven Rework

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — depends on free-operation executeAsSeat parity fix; plus FITL GameSpecDoc card rework
**Deps**: tickets/LEGACTTOO-028-free-operation-execute-as-seat-special-activity-parity.md, tickets/README.md, reports/fire-in-the-lake-rules-section-1.md, reports/fire-in-the-lake-rules-section-4.md, data/games/fire-in-the-lake/41-content-event-decks.md, data/games/fire-in-the-lake/30-rules-actions.md, data/games/fire-in-the-lake/10-vocabulary.md, data/games/fire-in-the-lake/20-macros.md

## Problem

Card-30 currently uses direct event-effect execution as a workaround to emulate Air Strike behavior. That bypasses the intended free-operation grant architecture and does not express "US or ARVN free Air Strikes" via standard turn-flow semantics.

We need to rework card-30 to the proper grant-driven model once execute-as parity is fixed, while preserving exact rules/playbook behavior:
- any 1-3 coastal spaces (no in-space COIN requirement)
- remove up to 2 per selected space
- no die roll
- no Trail effect
- all other Air Strike restrictions/effects remain normal.

## Assumption Reassessment (2026-03-07)

1. Rules references for coastal scope and Air Strike behavior are already available in `reports/fire-in-the-lake-rules-section-1.md` (1.3.7) and `reports/fire-in-the-lake-rules-section-4.md` (4.2.3). **Confirmed.**
2. Current card-30 data in `41-content-event-decks.md` is implemented as direct effects, not free-operation grants. **Confirmed.**
3. A grant-window pattern exists in production (for example card-6 Aces) to temporarily alter Air Strike targeting/effects in `30-rules-actions.md`. **Confirmed.**

## Architecture Check

1. Reusing grant + temporary profile-window composition is cleaner than bespoke card-local removal logic because Air Strike core behavior remains centralized.
2. Game-specific behavior remains in GameSpecDoc data (`41-content-event-decks.md`, `30-rules-actions.md`, `10-vocabulary.md`, `20-macros.md`) and does not leak into kernel branching.
3. No compatibility shims: remove workaround path and keep one canonical card-30 implementation.

## What to Change

### 1. Rework card-30 unshaded to branch-based free grants

- In `41-content-event-decks.md`, model unshaded with two branches:
  - execute as US
  - execute as ARVN
- Each branch grants one free `airStrike` using `seat: self` + `executeAsSeat`.
- Use `effectTiming: afterGrants` and a short-lived event window var to parameterize Air Strike profile behavior during the granted move.

### 2. Reintroduce card-30-specific Air Strike window behavior in profile

- In `30-rules-actions.md` Air Strike profile:
  - target selector supports coastal `1..3` when card-30 window active
  - per-space removal budget capped at 2 while preserving global cap logic and ordering
  - optional Trail degrade stage disabled during card-30 window
  - keep all other normal restrictions/effects/capabilities interactions.

### 3. Wire lifecycle/reset for card-30 window var

- Add card-30 window global var declaration in `10-vocabulary.md`.
- Ensure reset hygiene in `20-macros.md` global reset macro.

### 4. Remove workaround assumptions from tests and enforce grant-driven semantics

- Update `fitl-events-uss-new-jersey.test.ts` to assert:
  - pending grant + execute-as branch semantics
  - legal free `airStrike` emission for executing faction seat
  - grant consumption and window teardown
  - rule-accurate targeting/removal/trail behavior.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/10-vocabulary.md` (modify)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `packages/engine/test/integration/fitl-events-uss-new-jersey.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify if metadata/effect assertions need updates)

## Out of Scope

- Changes to unrelated 1968 cards.
- Refactoring generic Air Strike behavior beyond card-30 window requirements.
- Visual-config updates (card behavior only).

## Acceptance Criteria

### Tests That Must Pass

1. Card-30 unshaded is represented as free-operation grants with execute-as branches and no direct bespoke removal effect flow.
2. Granted free `airStrike` enforces coastal 1..3 targeting, max 2 removals per selected space, and no Trail degrade.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-uss-new-jersey.test.js` and `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`.

### Invariants

1. Card-30 behavior is expressed through reusable grant + profile-window composition, not card-specific kernel logic.
2. GameDef/runtime remain game-agnostic; FITL specifics stay in GameSpecDoc assets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-uss-new-jersey.test.ts` — migrate assertions from workaround to grant-driven behavior and execute-as branch semantics.
2. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — keep metadata/text/effect-shape assertions aligned with final card-30 representation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-uss-new-jersey.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm -F @ludoforge/engine test:unit`
