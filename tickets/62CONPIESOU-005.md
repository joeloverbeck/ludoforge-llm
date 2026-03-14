# 62CONPIESOU-005: Tier-aware legality in `chooseN` for `prioritized` queries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime (legal-choices, effects-choice)
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, tickets/62CONPIESOU-004.md

## Problem

When a `chooseN` effect's `options` is a `prioritized` query, items from lower-priority tiers must be marked illegal while same-qualifier higher-priority items remain available. Currently, `chooseN` treats all option items as equally legal. This is the core behavioral change that enforces rules like FITL Rule 1.4.1.

## Assumption Reassessment (2026-03-14)

1. `chooseN` evaluation in `effects-choice.ts` (line 478): `const options = evalQuery(chooseN.options, evalCtx)` — the query AST is available as `chooseN.options`. Confirmed.
2. `legal-choices.ts` (line 54): `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024` — the spec says tier-aware legality should be a **pre-filter before combination enumeration**, reducing the search space.
3. The spec defines two modes: with `qualifierKey` (per-qualifier independence) and without (global tier exhaustion).
4. `chooseN` already supports incremental multi-select — each selection step can re-evaluate legality on remaining candidates. The tier-aware filter hooks into this existing mechanism.
5. The `computeTierMembership` utility from ticket 004 provides tier index for each candidate.

## Architecture Check

1. **Pre-filter approach**: Before enumerating combinations, compute which items are currently illegal due to tier priority. Remove them from the candidate set. This reduces combination space (performance win) and is correct because tier illegality is independent of other selection constraints.
2. **Dynamic re-evaluation**: In incremental multi-select mode, after each selection, re-compute tier legality. If selecting all tier-1 items of qualifier Q exhausts that qualifier in tier 1, tier-2 items of qualifier Q become legal. This uses the existing incremental selection model.
3. **Integration point**: The filter is applied in the discovery phase of `chooseN`, where legal options are computed for the player. The move-application phase validates that the selection respects tier constraints.

## What to Change

### 1. Add tier-aware pre-filter to chooseN option legality

In `effects-choice.ts` or `legal-choices.ts` (whichever computes legal options for `chooseN`):

- Detect when `chooseN.options` is a `prioritized` query
- Call `computeTierMembership(query, ctx)` to get tier assignments
- Apply tier filter:
  - **With qualifierKey**: For each candidate, extract `token.props[qualifierKey]`. An item from tier N is illegal if any unselected item from tiers 0..N-1 shares the same qualifier value.
  - **Without qualifierKey**: An item from tier N is illegal if any unselected item from tiers 0..N-1 exists.
- Filter out illegal items before passing to combination enumeration

### 2. Support dynamic re-evaluation in multi-select

When the player makes a selection in a `chooseN` with `prioritized` options:
- Re-run the tier filter with the selected items removed from the candidate pool
- Update which lower-tier items are now legal
- Present updated legal options to the player

### 3. Validate selections respect tier constraints on move application

In the move-application path, verify that the player's full selection is consistent with tier priority. If a tier-2 item was selected while a tier-1 item with the same qualifier was available and unselected, reject the move.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — chooseN evaluation)
- `packages/engine/src/kernel/legal-choices.ts` (modify — if legality computation is here)
- `packages/engine/src/kernel/prioritized-tier-utils.ts` (modify — may need a `computeLegalCandidates` helper)

## Out of Scope

- Type definitions (ticket 001)
- Compiler lowering (ticket 002)
- Validation diagnostics (ticket 003)
- `evalQuery` handler (ticket 004)
- Card 87 YAML (ticket 008)
- Test files (ticket 007)
- UI/UX presentation of grayed-out items (spec non-goal)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. `chooseN` with `prioritized` query (with qualifierKey): tier-2 items with qualifier Q are illegal while tier-1 items with qualifier Q exist
3. `chooseN` with `prioritized` query (with qualifierKey): tier-2 items with qualifier R are legal even when tier-1 items with qualifier Q remain (qualifier independence)
4. `chooseN` with `prioritized` query (without qualifierKey): tier-2 items are illegal while any tier-1 item exists
5. Dynamic re-evaluation: selecting all tier-1 items of qualifier Q makes tier-2 items of qualifier Q legal
6. Move validation rejects selections that violate tier priority
7. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. Legal choice generation and move application agree on admissibility (spec invariant 6)
2. Lower-priority tiers never contribute while higher tiers can still satisfy the same qualified remainder (spec invariant 2)
3. Qualifier matching is driven entirely by authored data — `qualifierKey` property name (spec invariant 3)
4. The tier pre-filter reduces combination space — `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS` is never exceeded more than without the filter
5. No FITL-specific identifiers in any touched file
6. The player sees one unified choice, not sequential stages (spec invariant 7)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — tier-aware legality cases (see ticket 007 for full list)

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
