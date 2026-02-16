# TEXHOLKERPRIGAMTOU-011: Generic Next-Seat-By-Predicate Primitive for Turn Logic

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-012

## Problem

Seat traversal and "find next eligible actor" logic is repeated in long, nested Texas macros. This is brittle and difficult to reuse for other board/card games with circular turn order.

## 1) What should be added/changed

1. Add a game-agnostic kernel/query capability to resolve the next player in circular order that matches a predicate.
2. Compiler support: expose this capability cleanly in GameSpecDoc without game-specific aliases.
3. Refactor Texas macros (`find-next-non-eliminated`, `find-next-to-act`, preflop seat selection paths) to use the new primitive/query.
4. Remove duplicated reduce-based seat traversal blocks from Texas YAML.

## 2) Invariants that must pass

1. Next-seat resolution is deterministic for same state and seed.
2. Result always belongs to valid player range or explicit "none" sentinel.
3. Wrap-around semantics are correct for all player counts in configured min/max range.
4. Predicate constraints are respected exactly (no eliminated/all-in/invalid actor leakage).

## 3) Tests that must pass

1. New kernel unit tests for next-seat primitive/query:
- wrap-around behavior
- no-match behavior
- predicate filtering across states
2. New compiler tests proving GameSpecDoc lowers the primitive/query correctly.
3. Texas regression tests proving behavior parity after macro refactor.
4. Existing suites and full gates:
- `npm run build`
- `npm run lint`
- `npm test`
