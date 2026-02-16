# TEXHOLKERPRIGAMTOU-036: nextInOrderByCondition Source/Anchor Shape Compatibility Validation

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Problem

`nextInOrderByCondition` validates `source` and `from` independently, but it does not validate whether anchor shape can match the runtime item shape produced by `source`. Mis-typed anchors silently yield empty results and are hard to diagnose.

## 1) What needs to be changed/added

1. Extend `src/kernel/validate-gamedef-behavior.ts` to validate `nextInOrderByCondition.from` compatibility with inferred `source` runtime shape when shape is statically knowable.
2. Add a clear diagnostic code/message for source/anchor shape mismatch (for example numeric anchor against string source).
3. Keep validation generic and game-agnostic; no Texas-specific logic.
4. Ensure diagnostics degrade gracefully when source shape is unknown (no false positives).

## 2) Invariants that should pass

1. Statistically incompatible source/anchor combinations produce deterministic validation diagnostics.
2. Compatible combinations produce no new false-positive diagnostics.
3. Unknown/dynamic source shapes do not trigger speculative mismatch errors.
4. Validation remains game-agnostic and reusable.

## 3) Tests that should pass

1. Add/extend unit tests in `test/unit/validate-gamedef.test.ts` for:
- source shape = string, anchor = number -> diagnostic
- source shape = number, anchor = string -> diagnostic
- compatible source/anchor -> no diagnostic
- unknown source shape -> no mismatch diagnostic
2. Add/extend schema/lowering tests only if needed for error-surface parity.
3. Run `npm run build`.
4. Run `npm run lint`.
5. Run `npm test`.
