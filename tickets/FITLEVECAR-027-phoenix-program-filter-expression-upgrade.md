# FITLEVECAR-027: Phoenix Program Data Upgrade Using Canonical Token Filter Expressions

**Status**: PENDING
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

## Architecture Check

1. Moving from workaround composition to canonical filter expressions improves declarative clarity and maintainability.
2. Changes stay in GameSpecDoc + tests; GameDef/runtime remain agnostic and unchanged by card identity.
3. No backwards-compatibility aliases: card data uses only the canonical filter syntax introduced by TOKFILAST-001/002.

## What to Change

### 1. Rewrite card-27 unshaded query authoring

Replace `concat` workaround with one canonical token filter expression that directly encodes:
- VC guerrilla OR VC base with `tunnel == untunneled`
- constrained to COIN-controlled Province/City spaces.

### 2. Keep shaded behavior while simplifying selection expression style

Keep shaded semantics unchanged, but align filter authoring style with canonical expression patterns where applicable.

### 3. Preserve and tighten regression tests

Update/retain Phoenix integration tests to verify behavior equivalence after syntax upgrade.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-phoenix-program.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify if shape assertions need refresh)

## Out of Scope

- Behavior changes to any other event card beyond syntax migration needs.
- New event macros unrelated to card-27.

## Acceptance Criteria

### Tests That Must Pass

1. Card-27 compiles with canonical token filter expression syntax and no compiler diagnostics for unsupported filter shapes.
2. Phoenix integration tests continue to pass all current edge cases.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js` after engine build.

### Invariants

1. Card semantics remain identical to current implemented rules behavior.
2. Playbook requirement “pieces include unTunneled Bases” remains explicitly enforced by data-level filters.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-phoenix-program.test.ts` — maintain edge-case coverage while asserting cleaner query shape.
2. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — non-regression anchor for card-27 metadata/text.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-phoenix-program.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-us.test.js`
