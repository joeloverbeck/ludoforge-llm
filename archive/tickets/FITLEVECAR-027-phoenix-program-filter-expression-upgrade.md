# FITLEVECAR-027: Phoenix Program Data Upgrade Using Canonical Token Filter Expressions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — GameSpecDoc data + tests only
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md, specs/29-fitl-event-card-encoding.md

## Problem

Card 27 (`Phoenix Program`) currently uses a `concat` workaround to emulate token-level `or` filtering (VC guerrillas OR VC unTunneled bases) under COIN Control. This is functionally correct but verbose and obscures intent.

## Assumption Reassessment (2026-03-05)

1. Current card-27 behavior is rules-accurate, but authored with workaround structure due token-filter expressiveness limits.
2. The new canonical token filter expression capability can represent card-27 selection logic directly and more readably.
3. Regression safety requires preserving all current edge-case behavior: unTunneled-base inclusion, tunneled-base exclusion, Saigon exclusion on shaded side, and terror pool cap behavior.
4. Reassessment discrepancy (2026-03-06): shaded card-27 selection already uses canonical map-space condition filters; the architectural debt is concentrated in unshaded token selection, where duplicated `concat` sources encode VC guerrilla/base-or logic.

## Architecture Check

1. Moving unshaded card-27 from duplicated `concat` composition to one canonical token-filter expression improves declarative clarity and maintainability.
2. Changes stay in GameSpecDoc + tests; GameDef/runtime remain agnostic and unchanged by card identity.
3. No backwards-compatibility aliases: card data uses only the canonical filter syntax introduced by TOKFILAST-001/002.
4. Prefer removing duplicated query fragments (including redundant dynamic `max` counting where unnecessary) to keep event data robust and easier to extend.

## What to Change

### 1. Rewrite card-27 unshaded query authoring

Replace `concat` workaround with one canonical token filter expression that directly encodes:
- VC guerrilla OR VC base with `tunnel == untunneled`
- constrained to COIN-controlled Province/City spaces.

### 2. Keep shaded behavior rules-identical (no structural rewrite)

Keep shaded semantics unchanged; only allow minimal cleanup if it removes duplicated selection/cardinality boilerplate without behavior change.

### 3. Preserve and tighten regression tests

Update/retain Phoenix integration tests to verify behavior equivalence after syntax upgrade, and assert card-27 unshaded no longer compiles through `concat` workaround structure.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-phoenix-program.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (optional; modify only if non-regression metadata assertions need refresh)

## Out of Scope

- Behavior changes to any other event card beyond syntax migration needs.
- New event macros unrelated to card-27.

## Acceptance Criteria

### Tests That Must Pass

1. Card-27 compiles with canonical token filter expression syntax and no compiler diagnostics for unsupported filter shapes.
2. Phoenix integration tests continue to pass all current edge cases.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js` after engine build.
4. Card-27 unshaded compiled shape uses a single token query with expression filter (no `concat` split by piece type).

### Invariants

1. Card semantics remain identical to current implemented rules behavior.
2. Playbook requirement “pieces include unTunneled Bases” remains explicitly enforced by data-level filters.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-phoenix-program.test.ts` — maintain edge-case coverage and assert unshaded canonical filter shape (no `concat` workaround).
2. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — non-regression anchor for card-27 metadata/text (only if needed).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Replaced card-27 unshaded `chooseN.options` from duplicated `concat` token queries to a single `tokensInMapSpaces` query using canonical token-filter boolean composition (`VC` and (`guerrilla` or (`base` and `untunneled`))).
  - Removed redundant unshaded dynamic max-count query duplication by setting `chooseN.max: 3` directly.
  - Strengthened Phoenix integration compile-shape assertions to require the canonical single-query structure and reject `concat` workaround sources.
- Deviations from original plan:
  - No change was needed in `packages/engine/test/integration/fitl-events-1968-us.test.ts`; existing non-regression metadata assertions remained valid.
  - Shaded card-27 selection was left structurally unchanged because reassessment confirmed it was already in canonical condition-expression style.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
