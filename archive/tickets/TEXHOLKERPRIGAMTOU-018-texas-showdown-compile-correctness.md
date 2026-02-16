# TEXHOLKERPRIGAMTOU-018: Texas Showdown Compile Correctness and Deterministic Payout Semantics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: L
**Dependencies**: TEXHOLKERPRIGAMTOU-016, TEXHOLKERPRIGAMTOU-017
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009, TEXHOLKERPRIGAMTOU-020

## 0) Reassessed assumptions (code/tests reality)

This ticket's prior assumptions were partially stale.

Current reality:
1. Kernel primitives from spec 33 (`reveal`, `evaluateSubset`, `commitResource`) are already implemented and unit-tested.
2. Texas sources parse and spec-validate cleanly; the remaining blocker was compiler binding visibility for deep lexical scoring exports (`hand-rank-score` -> `evaluateSubset.scoreExpr`).
3. The engine lacked a generic effect for exporting computed scalar values from effect sequences; using deeply nested lexical-only bindings caused unbound diagnostics at compile time.
4. Texas test coverage had to be expanded to assert compile correctness and guard scope semantics for new binding-export behavior.
5. Side-pot logic hardcoded range loops (`1..10`, `0..9`) and required runtime-derived iteration for long-term extensibility.

## 1) Updated scope (implementation plan)

Goal: fix Texas showdown correctness with game logic in GameSpecDoc while improving game-agnostic compiler/runtime binding architecture.

1. Rewrite `hand-rank-score` to use only kernel-supported AST shapes:
- Condition nodes only in condition contexts.
- Value expressions only in value contexts.
- Preserve deterministic total ordering for tie-breakers.
2. Add a generic, game-agnostic scalar export primitive (`bindValue`) so score derivation can be explicit and reusable across games.
3. Remove hardcoded side-pot seat/count loops and derive iteration bounds from runtime state/query ordering.
4. Define and encode explicit odd-chip policy in YAML (deterministic winner iteration order).
5. Add/strengthen Texas-focused tests to guard compile correctness and anti-regression on hardcoded ranges.
6. No compatibility aliases and no per-game kernel branching.

Architectural decision:
- These changes are more beneficial than the previous state because they preserve agnostic-engine boundaries, replace implicit lexical hacks with an explicit generic export primitive, and keep simulator/kernel logic reusable across board/card games.

## 2) Invariants that should pass

1. Texas GameSpec compiles with zero error diagnostics.
2. Hand scores are deterministic and strictly comparable for showdown ranking.
3. Side-pot payouts conserve chips exactly.
4. Odd-chip distribution is deterministic by explicit policy.
5. Showdown behavior is independent of iteration artifacts.

## 3) Tests that should pass

1. Unit: Texas spec compile test requiring zero error diagnostics.
2. Unit: Texas side-pot macro structure rejects hardcoded seat/count ranges and enforces explicit deterministic odd-chip allocation path.
3. Follow-up tickets (`-008`, `-009`): showdown execution matrix and hand-rank vectors against runtime fixtures.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
  - Updated `data/games/texas-holdem/20-macros.md` so `hand-rank-score` exports `$handScore` via a generic `bindValue` effect.
  - Updated `data/games/texas-holdem/30-rules-actions.md` showdown wiring so `evaluateSubset.scoreExpr` reads `{ ref: binding, name: $handScore }`.
  - Added new game-agnostic `bindValue` effect support across AST types, schema, CNL lowering, binder surfaces, validation, and runtime dispatch/application.
  - Extended lexical scope handling for compiler/runtime control flow so deep `let`/`reduce` continuations can export `$`-namespace computed bindings safely.
  - Removed hardcoded side-pot range loops (`1..10`, `0..9`) and switched to runtime-derived deterministic iteration.
  - Strengthened Texas and binding-scope tests (compile + runtime + schema + exhaustive type guards).
- Deviations from original plan:
  - Introduced a small generic kernel/compiler primitive (`bindValue`) instead of forcing all fixes into YAML-only rewrites.
  - This was required to avoid brittle lexical coupling and provide reusable, explicit value export semantics for future games.
  - Hand-rank vector/matrix runtime execution coverage remains deferred to dependent tickets `TEXHOLKERPRIGAMTOU-008` and `TEXHOLKERPRIGAMTOU-009`.
- Verification results:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
