# TEXHOLKERPRIGAMTOU-018: Texas Showdown Compile Correctness and Deterministic Payout Semantics

**Status**: TODO
**Priority**: HIGH
**Effort**: XL
**Dependencies**: TEXHOLKERPRIGAMTOU-016, TEXHOLKERPRIGAMTOU-017
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009, TEXHOLKERPRIGAMTOU-020

## 1) What must change / be implemented

Fix and harden Texas showdown architecture so it compiles and executes correctly:

1. Rewrite `hand-rank-score` macro to use valid AST constructs only:
- Use condition nodes only in condition contexts.
- Use value expressions only in value contexts.
- Preserve strict deterministic ordering with tie-breakers.
2. Fix showdown/rules wiring so all macro args and query shapes match compiler contracts.
3. Fix `collect-forced-bets` invocation and any selector arg mismatches.
4. Remove hardcoded player-count assumptions in side-pot logic (`0..9`, `1..10`) by deriving ranges from declared metadata/runtime variables.
5. Ensure side-pot distribution is chip-conserving and deterministic, including odd-chip policy.
6. Keep all poker behavior in GameSpecDoc YAML; no kernel special casing.
7. No compatibility aliases; replace incorrect forms directly.

## 2) Invariants that should pass

1. Texas GameSpec compiles with zero error diagnostics.
2. Hand scores are deterministic and strictly comparable for showdown ranking.
3. Side-pot payouts conserve chips exactly.
4. Odd-chip distribution is deterministic by explicit policy.
5. Showdown behavior is independent of iteration artifacts.

## 3) Tests that should pass

1. Unit: Texas spec compile test requiring zero error diagnostics.
2. Unit: hand-rank known vectors (including wheel straight and kicker ties).
3. Unit: side-pot matrix (multi-all-in, folds, split pots, odd chips).
4. Integration: deterministic showdown execution from known state fixtures.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
