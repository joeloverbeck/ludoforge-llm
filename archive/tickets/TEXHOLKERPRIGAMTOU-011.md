# TEXHOLKERPRIGAMTOU-011: Texas Raise-Domain Rebucket + Tournament Throughput Validation

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Dependencies**: archive/tickets/TEXHOLKERPRIGAMTOU-010.md  
**Blocks**: None

## Problem

Texas Hold'em currently enumerates near-continuous integer raise amounts (`40..stack`) which causes pathological move counts and slow tournament tests. This is likely over-specification for move generation and not required for robust tournament simulation.

## Assumption Reassessment (2026-02-16)

1. The dependency ticket `TEXHOLKERPRIGAMTOU-010` is already completed and archived (`archive/tickets/TEXHOLKERPRIGAMTOU-010.md`); it is not an active ticket in `tickets/`.
2. Generic `intsInRange` controls from `-010` are already implemented in kernel/CNL (`step`, `alwaysInclude`, `maxResults`) and are available for immediate use in Texas YAML.
3. Texas `raiseAmount` currently uses plain `intsInRange { min, max }` with no cardinality controls in `data/games/texas-holdem/30-rules-actions.md`, so preflop and deep-stack spots still expand almost every integer amount.
4. Existing tests already assert raise legality endpoints (`min`/`max`) and broad gameplay invariants, but they do not assert capped raise-domain cardinality or per-turn `legalMoveCount` ceilings.
5. Architecture check: the clean long-term approach is to keep bucketing policy entirely in GameSpecDoc data (Texas YAML), reusing generic kernel query controls. No simulator/kernel poker specialization is required or desired.

## 1) What Should Change / Be Added

### A. Rework Texas `raise` parameter domain to use bounded buckets

In `data/games/texas-holdem/30-rules-actions.md` update `raiseAmount` domain to use existing generic `intsInRange` controls from archived ticket `-010`.

Target behavior:

- Keep legal lower bound: `currentBet + lastRaiseSize`.
- Keep legal upper bound: `streetBet + chipStack`.
- Use stepped progression (big-blind-scaled) instead of every integer.
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
  - assert schedule-aligned anchor raises are included when in bounds.
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

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Rebucketed Texas `raiseAmount` in `data/games/texas-holdem/30-rules-actions.md` using generic `intsInRange` controls:
    - `step: bigBlind`
    - `alwaysInclude` schedule anchors (`currentBet + 2/3/5 * bigBlind`)
    - `maxResults: 10`
  - Strengthened `test/integration/texas-holdem-hand.test.ts` to assert:
    - legal min/max raise endpoints are preserved
    - anchor raises are present when in bounds
    - raise-domain cardinality is capped (`<= 10`)
  - Strengthened `test/e2e/texas-holdem-tournament.test.ts` with a replay assertion that peak per-turn legal move count is bounded (`<= 13`) under tournament flow.
- Deviations from original plan:
  - No kernel/simulator/compiler code changes were needed; the ticket was resolved fully in GameSpecDoc data plus tests, which is the cleaner architecture.
  - Runtime-performance validation was captured via legal-move cardinality bounds in replay rather than introducing a wall-clock timing assertion (to avoid flaky CI timing dependencies).
- Verification:
  - `npm run build` ✅
  - `node --test dist/test/integration/texas-holdem-hand.test.js` ✅
  - `node --test dist/test/unit/texas-holdem-properties.test.js` ✅
  - `node --test dist/test/e2e/texas-holdem-tournament.test.js` ✅
  - `npm run lint` ✅
  - `npm test` ✅
  - `npm run test:e2e` ✅
