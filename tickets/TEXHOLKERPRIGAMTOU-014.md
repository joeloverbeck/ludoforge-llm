# TEXHOLKERPRIGAMTOU-014: Full Showdown Architecture in GameSpec (Hand Ranking + Side Pots)

**Status**: TODO
**Priority**: HIGH
**Effort**: XL
**Dependencies**: TEXHOLKERPRIGAMTOU-010, TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-012, TEXHOLKERPRIGAMTOU-013
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## 1) What needs to be fixed/added

Replace scaffold-only showdown logic with fully implemented YAML macros and rules for Texas Hold'em, using the new generic architecture primitives.

Scope:
- Implement complete `hand-rank-score` macro with strict total ordering and all tie-break semantics.
- Implement complete `side-pot-distribution` macro with layered contribution handling, split pots, and odd-chip deterministic rule.
- Wire showdown flow in Texas rules/actions to evaluate all active players and distribute chips exactly.
- Add/update vocabulary vars needed for clean showdown dataflow (for example explicit per-player score/contribution scratch vars) in canonical form.

Constraints:
- No Texas-specific logic in kernel/compiler.
- No placeholder/scaffold showdown macros remaining after this ticket.
- No backward-compatible alternate macro formats.

## 2) Invariants that should pass

1. Hand scoring produces deterministic strict ordering across all 7,462 5-card equivalence classes.
2. Wheel straight (A-2-3-4-5), royal/straight flush, and all kicker tie-break rules are correct.
3. Side-pot total chip conservation holds exactly for all all-in/fold combinations.
4. Split-pot and odd-chip assignment is deterministic by explicit seat-position policy.
5. Showdown outcome is independent of player enumeration artifacts.

## 3) Tests that should pass

1. Unit: hand-rank known-vector matrix (all hand classes + kicker edge cases).
2. Unit: side-pot distribution matrix with multi-all-in and fold-before-showdown cases.
3. Unit: odd-chip deterministic assignment test cases.
4. Integration: full-hand simulations from preflop to showdown with expected winners/payouts.
5. Property: chip conservation across randomized showdown scenarios.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
