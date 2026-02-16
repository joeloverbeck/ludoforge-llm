# TEXHOLKERPRIGAMTOU-011: Texas Raise-Domain Rebucket + Tournament Throughput Validation

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium  
**Dependencies**: TEXHOLKERPRIGAMTOU-010  
**Blocks**: None

## Problem

Texas Hold'em currently enumerates near-continuous integer raise amounts (`40..stack`) which causes pathological move counts and slow tournament tests. This is likely over-specification for move generation and not required for robust tournament simulation.

## 1) What Should Change / Be Added

### A. Rework Texas `raise` parameter domain to use bounded buckets

In `data/games/texas-holdem/30-rules-actions.md` update `raiseAmount` domain to use new generic `intsInRange` controls from ticket -010.

Target behavior:

- Keep legal lower bound: `currentBet + lastRaiseSize`.
- Keep legal upper bound: `streetBet + chipStack`.
- Use stepped progression instead of every integer.
- Always include strategic anchors:
  - min legal raise,
  - exact all-in max,
  - selected schedule-aligned values (for example `currentBet + k * bigBlind` where in-bounds).
- Enforce hard cap on generated raise options per decision (via `maxResults`).

### B. Preserve game-agnostic architecture

All Texas-specific sizing policy must live in GameSpecDoc / scenario data. No poker-specific code paths in simulator or kernel.

### C. Add performance-oriented tests for this slice

Add focused tests proving move-domain cardinality and tournament runtime are bounded and stable.

## 2) Invariants That Must Pass

1. Raise legality correctness:
   - every enumerated raise is within legal min/max,
   - no enumerated raise violates preconditions.
2. Endpoint preservation:
   - min legal raise and all-in max are always offered when raise is legal.
3. No regression in core gameplay invariants:
   - chip conservation,
   - card conservation,
   - no negative stacks,
   - deterministic replay for fixed seed/agents.
4. Engine agnosticism:
   - no Texas-specific conditionals added to `src/kernel/*` or `src/sim/*`.
5. Throughput guardrail:
   - peak `legalMoves()` cardinality in the Texas tournament suite is materially reduced from current baseline.

## 3) Tests That Should Pass

### Update/add tests

- `test/integration/texas-holdem-hand.test.ts`
  - assert raise domain still includes legal minimum and all-in maximum.
  - assert enumerated raise count is capped per decision (new expected upper bound).
- `test/e2e/texas-holdem-tournament.test.ts`
  - keep existing behavior checks.
  - add explicit assertion on per-turn `legalMoveCount` ceiling in replay (for Texas tournament runs).
- `test/unit/texas-holdem-properties.test.ts`
  - keep invariants green after rebucketing.

### Performance checks (acceptance)

- `npm run test:e2e` stays green.
- `node dist/test/e2e/texas-holdem-tournament.test.js` runtime improves measurably versus pre-change baseline.
- Optional benchmark artifact: capture before/after metrics for
  - avg legal move count,
  - p95 legal move count,
  - max legal move count
  across representative seeds.

### Regression suites

- `npm run build`
- `npm test`
- `npm run test:e2e`

## Out of Scope

- No changes to FITL files.
- No custom poker AI strategy work.
- No simulator-side poker special cases.
