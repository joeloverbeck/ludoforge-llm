# TEXHOLKERPRIGAMTOU-035: nextInOrderByCondition Anchor Evaluation Resilience

**Status**: TODO
**Priority**: HIGH
**Effort**: Small
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Problem

`nextInOrderByCondition` currently evaluates `from` directly in runtime query evaluation. If `from` resolves through missing bindings/vars or invalid arithmetic, runtime can throw instead of returning an empty result, which is inconsistent with other domain queries that degrade safely.

## 1) What needs to be changed/added

1. In `src/kernel/eval-query.ts`, make `nextInOrderByCondition` anchor (`from`) resolution resilient to recoverable eval failures.
2. Treat recoverable failures (for example missing binding, missing var, division-by-zero, non-resolvable anchor value) as empty query result `[]` rather than runtime throw.
3. Keep non-recoverable failures unchanged (do not swallow unrelated runtime faults).
4. Document/encode this behavior in runtime tests so the contract is explicit.

## 2) Invariants that should pass

1. `nextInOrderByCondition` never throws for recoverable anchor-resolution failures; it returns `[]`.
2. Non-recoverable runtime errors are still surfaced.
3. Behavior remains deterministic for identical state/input.
4. Existing successful traversal behavior is unchanged.

## 3) Tests that should pass

1. Add/extend unit tests in `test/unit/eval-query.test.ts` for:
- missing binding in `from`
- missing variable in `from`
- division-by-zero in `from`
- successful traversal still works
2. Run `npm run build`.
3. Run `npm run lint`.
4. Run `npm test`.
