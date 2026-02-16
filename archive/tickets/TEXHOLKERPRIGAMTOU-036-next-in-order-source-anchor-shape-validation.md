# TEXHOLKERPRIGAMTOU-036: nextInOrderByCondition Source/Anchor Shape Compatibility Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Problem

`nextInOrderByCondition` validates `source` and `from` independently, but it does not validate whether anchor shape can match the runtime item shape produced by `source`. Mis-typed anchors silently yield empty results and are hard to diagnose.

## Assumption Reassessment (Current Code/Test Reality)

1. `nextInOrderByCondition` is already canonical and generic across runtime/schema/compiler/validator surfaces (completed in `TEXHOLKERPRIGAMTOU-034`).
2. `src/kernel/validate-gamedef-behavior.ts` currently validates:
- `source` query structure and nested query shape mismatches (for example mixed `concat` sources),
- `from` as a valid `ValueExpr`,
- `bind` canonical token shape.
3. There is currently no cross-check between inferred `source` runtime shape and statically known anchor shape of `from`.
4. Existing tests in `test/unit/validate-gamedef.test.ts` cover source-query mismatches and bind canonicality, but do not cover source/anchor compatibility diagnostics.
5. Runtime behavior in `src/kernel/eval-query.ts` returns `[]` when anchor is not found, so shape mismatches currently fail silently at runtime when validator cannot catch them.

## 1) Updated Scope and Implementation Direction

1. Extend `src/kernel/validate-gamedef-behavior.ts` so `nextInOrderByCondition` validates anchor/source compatibility when both shapes are statically knowable.
2. Add a dedicated diagnostic for source/anchor incompatibility (do not overload `DOMAIN_QUERY_SHAPE_MISMATCH`, which currently refers to mixed query result shapes).
3. Keep logic strictly generic and game-agnostic.
4. Degrade gracefully for unknown/dynamic anchor or source shape (no speculative false positives).
5. Do not change runtime traversal semantics for this ticket; this is validator-surface hardening.

## 2) Architecture Decision Rationale

1. Adding validator-time shape compatibility is more robust than relying on runtime empty results because it turns silent failures into deterministic diagnostics.
2. A dedicated mismatch diagnostic keeps error semantics precise and extensible for future query-shape checks.
3. Keeping this in validation (instead of runtime branching) preserves a clean separation: validator catches static contract violations, evaluator handles dynamic execution.

## 3) Invariants that should pass

1. Statically incompatible source/anchor combinations produce deterministic validation diagnostics.
2. Compatible source/anchor combinations produce no new false-positive diagnostics.
3. Unknown/dynamic source or anchor shapes do not trigger mismatch errors.
4. Validation remains game-agnostic and reusable.

## 4) Tests that should pass

1. Add/extend unit tests in `test/unit/validate-gamedef.test.ts` for:
- source shape = string, anchor = number -> diagnostic
- source shape = number, anchor = string -> diagnostic
- compatible source/anchor -> no diagnostic
- unknown source shape -> no mismatch diagnostic
2. Add/extend runtime `eval-query` tests only if validator scope introduces runtime-facing behavior changes (not expected).
3. Add/extend schema/lowering tests only if needed for error-surface parity (not expected).
4. Run `npm run build`.
5. Run `npm run lint`.
6. Run `npm test`.

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Added static source/anchor compatibility validation for `nextInOrderByCondition` in `src/kernel/validate-gamedef-behavior.ts`.
  - Added diagnostic `DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH` at `nextInOrderByCondition.from` when source and anchor shapes are deterministically incompatible.
  - Added shape inference support for `ValueExpr` where statically knowable (literals, numeric expressions, concat, selected refs, and `if` branch unions).
  - Added validator tests in `test/unit/validate-gamedef.test.ts` for string-vs-number mismatch, number-vs-string mismatch, compatible pair acceptance, and unknown source-shape graceful degradation.
- **Deviations from original plan**:
  - No schema/lowering/runtime changes were required; the fix remained validator-only.
  - Existing tests already covered source-domain shape mismatch and bind canonicality, so coverage additions were focused narrowly on source/anchor compatibility.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
