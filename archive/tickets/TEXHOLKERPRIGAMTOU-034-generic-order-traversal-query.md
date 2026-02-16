# TEXHOLKERPRIGAMTOU-034: Generic Order Traversal Query (Beyond Seat-Index Circularity)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-011
**Blocks**: None

## Assumption Reassessment (Current Code/Test Reality)

1. `nextPlayerByCondition` exists and is fully wired in compiler/runtime/validator/schema surfaces (`src/cnl/compile-conditions.ts`, `src/kernel/eval-query.ts`, `src/kernel/validate-gamedef-behavior.ts`, `src/kernel/types-ast.ts`, `src/kernel/schemas-ast.ts`, `schemas/*.json`).
2. Current runtime semantics are hardcoded to player-seat circular traversal (`resolvePlayerSel('all')` + modulo index arithmetic) and do not support explicit runtime order domains.
3. Existing tests already cover `nextPlayerByCondition` semantics (wrap, includeFrom, no-match, binder canonicality/shadowing), but they are seat-index-specific rather than generic-order-specific.
4. Texas macros currently consume `nextPlayerByCondition`; no other generic order traversal primitive exists.
5. Given the repository rule of no backwards-compat/aliasing for core contracts, this ticket should replace (not alias) `nextPlayerByCondition` with one canonical generic query contract.

## Problem

`nextPlayerByCondition` currently assumes contiguous seat-index circular traversal. That works for many card games, but is not a complete long-term contract for all board/card game turn systems (initiative tracks, dynamic order lists, custom traversal domains).

## 1) Updated Scope and Implementation Direction

1. Replace `nextPlayerByCondition` with one canonical generic query contract that traverses an explicit ordered source query.
2. Canonical shape must include:
- `source`: explicit order domain query
- `from`: anchor value expression
- `includeFrom?`: include/exclude anchor traversal mode
- `bind`: declared candidate binder
- `where`: predicate evaluated in binder scope
3. Remove seat-index-specific assumptions from runtime traversal logic; runtime must traverse `source` results by anchor position and wrap deterministically.
4. Migrate Texas macros/usages/tests to the new canonical query (no aliasing).
5. Keep compiler/runtime/validator/schema generic and reusable (no game-specific branches).

## 2) Architecture Decision Rationale

1. A generalized traversal query is more robust than the current seat-only query because order is modeled as data, not hardcoded topology.
2. Explicit source+anchor contracts are more extensible for future games (initiative tracks, zone orders, scripted turn lists) without adding new engine primitives.
3. Removing legacy query names avoids dual-surface drift and keeps the compiler/runtime contract clean.

## 3) Invariants that must pass

1. Traversal is deterministic for the same state and declared source order.
2. Result cardinality is zero-or-one.
3. Predicate evaluation never escapes declared binder scope.
4. Runtime traversal has no seat-index-specific branch logic.
5. If anchor is absent from source order, query result is empty.

## 4) Tests that must pass

1. Kernel unit tests for generic traversal:
- explicit-order source traversal
- wrap semantics
- include/exclude anchor semantics
- anchor-not-found semantics
- no-match behavior
2. Compile/lowering tests for new query shape and binder scoping.
3. Validation tests for malformed source/from contracts and non-canonical binders.
4. Texas regression tests proving behavior parity after migration.
5. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Replaced `nextPlayerByCondition` with canonical `nextInOrderByCondition` across compiler/runtime/validator/type/schema surfaces.
  - Canonical query contract now requires:
    - `source: OptionsQuery`
    - `from: ValueExpr`
    - `bind: string`
    - `where: ConditionAST`
    - `includeFrom?: boolean`
  - Runtime traversal now follows explicit `source` order with deterministic wrap-around and returns empty when anchor is absent.
  - Texas traversal macros were migrated to explicit player-order source traversal (`source: { query: players }`) with no alias/back-compat layer.
  - Added/updated tests for generic source traversal, anchor-missing behavior, lowering/schema validation for required `source`, and Texas macro structure.
  - Regenerated JSON schema artifacts:
    - `schemas/GameDef.schema.json`
    - `schemas/Trace.schema.json`
    - `schemas/EvalReport.schema.json`
- **Deviations from original plan**:
  - Diagnostic codes were renamed from `*_NEXT_PLAYER_*` to `*_NEXT_IN_ORDER_*` to remove legacy seat-specific naming drift.
  - Runtime anchor matching supports deep structural equality (not only primitive equality), enabling robust traversal over non-scalar ordered domains.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
