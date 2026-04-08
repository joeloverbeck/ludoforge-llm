# FITLEVECARENC-023: Card-90 Walt Rostow Rules-Correct Re-encoding and Runtime Regression Coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No (GameSpecDoc/macros + integration tests)
**Deps**: specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/41-content-event-decks.md, rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md

## Problem

`card-90` in production data does not match canonical card text/rules intent.

Current encoded behavior:
- Unshaded: move up to 2 COIN pieces from one selected source space to one selected destination space.
- Shaded: remove up to 3 COIN pieces from one selected source to Available.

Canonical card-90 behavior should be:
- Unshaded: "Place any 2 ARVN pieces from anywhere (even out of play) into any COIN Control spaces."
- Shaded: "Place any 1 Guerrilla in each Province with ARVN. ARVN Troops Redeploy as if no Bases."

## Assumption Reassessment (2026-03-08)

1. The previous ticket assumption (canonicalize existing source/destination relocation structure) is superseded by a rules mismatch: behavior itself is wrong, not just encoding style.
2. Existing tests for card-90 are structural-only and do not execute runtime semantics for either side.
3. Rules reference for the shaded redeploy clause is immediate ARVN troop redeploy semantics from Rule `6.4.2` (`rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md`), with the card-specific override "as if no Bases".
4. Architecture target is still data-driven and generic-engine: implement via declarative event effects + reusable condition macros; no card-specific kernel branching.

## Architecture Decision

Replace card-90 behavior with rules-correct declarative effects and reusable macros rather than preserving old relocation logic.

Why this is better than current architecture:
- Correctness first: aligns with actual card text/playbook semantics.
- Cleaner contracts: card behavior represented directly in data, not hidden by mismatched imperative workarounds.
- Extensibility: shared condition macros for COIN-control and ARVN redeploy destinations can be reused by future cards/actions.

No backward compatibility requirement: if prior behavior regressions surface, fix dependent tests/data to the canonical rules behavior.

## What to Change

### 1. Re-encode card-90 behavior to canonical rules intent

Update `data/games/fire-in-the-lake/41-content-event-decks.md`:
- Unshaded:
  - Select up to 2 ARVN pieces from anywhere relevant (map + Available + out-of-play).
  - For each selected piece, select a COIN-controlled map space destination and move there.
- Shaded:
  - Place 1 Guerrilla in each Province with ARVN (subject to available guerrilla supply).
  - Immediately redeploy ARVN Troops from Provinces/LoCs to legal destinations "as if no Bases".

### 2. Introduce reusable macro predicates needed by card-90

Update `data/games/fire-in-the-lake/20-macros.md` with shared condition macros used by card-90 (and future cards), e.g.:
- COIN-controlled map space predicate.
- ARVN redeploy destination predicate that excludes base-destination allowance (card-90 shaded override).

### 3. Add runtime integration coverage for card-90

Add/modify integration tests to assert:
- Unshaded executes piece selection from multiple source pools and routes to COIN-control destinations.
- Unshaded respects ARVN-only piece constraint and 2-piece cap.
- Shaded places guerrillas per eligible province and then redeploys ARVN troops with "no Bases" destination constraints.
- Edge cases: insufficient eligible pieces/guerrillas, no legal destination spaces, and graceful partial/no-op behavior.

## Files to Touch

- `tickets/FITLEVECARENC-023-card-90-canonical-two-target-relocation-and-runtime-regression-coverage.md` (modify)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-walt-rostow.test.ts` (add)

## Out of Scope

- Broad refactors of coup redeploy actions outside what card-90 requires.
- Retrofitting historical tests to preserve incorrect prior card-90 behavior.
- Runner/UI changes.

## Acceptance Criteria

1. `card-90` data encoding matches canonical text behavior for both sides.
2. Runtime integration tests execute both sides and validate rules-critical invariants and edge cases.
3. Engine package lint/tests pass:
   - `pnpm -F @ludoforge/engine lint`
   - `pnpm -F @ludoforge/engine test`

## Invariants

1. Game-specific behavior remains in GameSpecDoc YAML/macros, not kernel special-casing.
2. Event execution remains generic and data-driven.
3. No alias/back-compat behavior retained for obsolete card-90 semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-walt-rostow.test.ts` — end-to-end runtime coverage for card-90 unshaded/shaded and edge cases.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — structural assertions updated to new card-90 payload shape/text.
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — card-90 assertions updated from old fallback/budget assumptions to new canonical structure.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-walt-rostow.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-08
- What changed:
  - Replaced card-90 unshaded/shaded payloads with rules-correct declarative behavior from canonical card text.
  - Added reusable FITL condition macros for COIN-control space checks and ARVN redeploy destinations without base allowance.
  - Added dedicated runtime integration coverage in `fitl-events-walt-rostow.test.ts` and updated existing structural/backfill tests.
- Deviations from original plan:
  - Original plan focused on canonicalizing prior source/destination relocation structure; final implementation replaced behavior entirely because card-90 semantics were incorrect.
  - Added `20-macros.md` updates and a new dedicated integration test file to keep behavior generic and reusable.
- Verification results:
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (full suite).
