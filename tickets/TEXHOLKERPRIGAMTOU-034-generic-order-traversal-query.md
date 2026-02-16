# TEXHOLKERPRIGAMTOU-034: Generic Order Traversal Query (Beyond Seat-Index Circularity)

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-011
**Blocks**: None

## Problem

`nextPlayerByCondition` currently assumes contiguous seat-index circular traversal. That works for many card games, but is not a complete long-term contract for all board/card game turn systems (initiative tracks, dynamic order lists, custom traversal domains).

## 1) What should be added/changed

1. Introduce a fully game-agnostic order-traversal query contract that traverses an explicit runtime order source rather than implicit `0..playerCount-1` seat arithmetic.
2. Define canonical query shape (single path, no aliases/back-compat) with explicit:
- source order domain
- start anchor
- traversal mode (include/exclude anchor)
- binder + predicate
3. Keep existing `nextPlayerByCondition` behavior as an internal specialization target, then migrate usages to the generalized primitive where appropriate.
4. Ensure compiler/runtime/validator surfaces remain generic and reusable for non-card games.

## 2) Invariants that must pass

1. Traversal is deterministic for the same state and declared source order.
2. Result cardinality is explicit and enforced (zero-or-one unless query contract states otherwise).
3. Predicate evaluation never escapes declared binder scope.
4. Runtime does not assume seat-index topology when explicit order source is provided.

## 3) Tests that must pass

1. New kernel unit tests covering explicit-order traversal domains, wrap semantics, no-match behavior, and binder scoping.
2. New compile/lowering tests for the generalized query shape and binder-scope validation.
3. New validation tests for malformed order-source contracts and invalid anchors.
4. Regression tests proving Texas behavior parity after optional migration path.
5. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
