# TEXHOLKERPRIGAMTOU-011: Generic Next-Seat-By-Predicate Primitive for Turn Logic

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-012

## Assumption Reassessment (Current Code/Test Reality)

1. Texas seat traversal duplication is real and concentrated in `data/games/texas-holdem/20-macros.md` (`find-next-non-eliminated`, `find-next-to-act`, and repeated preflop seat-selection reductions).
2. The kernel currently has no first-class circular next-player query/primitive by predicate; traversal is encoded through nested `reduce` + aggregate scans in YAML.
3. Existing generic query/value surfaces are expressive but not ergonomic for this use case; they force duplicated control flow and repeated modulo-style arithmetic in game specs.
4. Existing tests already exercise Texas preflop/postflop actor progression and BB-option behavior (`test/integration/texas-runtime-bootstrap.test.ts`, `test/integration/texas-holdem-hand.test.ts`) and structure checks (`test/unit/texas-holdem-spec-structure.test.ts`), but there is no dedicated kernel-level test for reusable next-seat predicate resolution.
5. Architectural fit: adding a single generic kernel query is cleaner than adding more game-local macros, and aligns with the Agnostic Engine rule.

## Problem

Seat traversal and "find next eligible actor" logic is repeated in long, nested Texas macros. This is brittle and difficult to reuse for other games with circular turn order.

## 1) Updated Scope and Implementation Direction

1. Add one canonical, game-agnostic `OptionsQuery` variant for circular next-player lookup by predicate (no aliases).
2. Query semantics must be deterministic and return a zero-or-one player result (empty when no match), so no game-specific sentinels are required in kernel contracts.
3. Extend compiler/query-lowering and schema/type validation to recognize the new canonical query shape.
4. Refactor Texas macros (`find-next-non-eliminated`, `find-next-to-act`, and preflop seat selection paths) to consume the new query and remove duplicated reduce/modulo traversal blocks.
5. Preserve engine genericity: no Texas identifiers or game-specific branches in `src/kernel`/`src/cnl`.

## 2) Invariants that must pass

1. Next-seat resolution is deterministic for the same state and seed.
2. Query result is either a single valid player id in range `[0, playerCount-1]` or empty.
3. Wrap-around semantics are correct for all configured player counts.
4. Predicate constraints are respected exactly (no eliminated/all-in/inactive leakage).
5. Texas runtime behavior remains equivalent after macro refactor for existing gameplay tests.

## 3) Tests that must pass

1. New kernel unit tests for next-seat query:
- wrap-around behavior
- no-match behavior
- include-self toggle semantics
- predicate filtering against per-player state flags
2. New compile/lowering tests proving GameSpecDoc lowers the new query shape correctly.
3. Texas regression tests proving actor progression parity after macro refactor.
4. Existing suites and full gates:
- `npm run build`
- `npm run lint`
- `npm test`

## 4) Implementation Notes

- Preferred canonical query contract:
  - `query: "nextPlayerByCondition"`
  - `from: <NumericValueExpr>`
  - `where: <ConditionAST>` (evaluated with an implicit candidate-player binding)
  - `includeFrom?: boolean` (default `false`)
- Keep result shape consistent with existing query model (array), but constrain cardinality to zero-or-one.
- Update all impacted type/schema surfaces together:
  - `src/kernel/types-ast.ts`
  - `src/kernel/schemas-ast.ts`
  - `src/cnl/compile-conditions.ts`
  - `src/kernel/eval-query.ts`
  - `src/kernel/validate-gamedef-behavior.ts`
  - `schemas/GameDef.schema.json` (regenerated artifact)
- Keep macro edits minimal and localized to Texas traversal paths.

## Outcome

- **Completion date**: 2026-02-16
- **What was changed**:
  - Added canonical query `nextPlayerByCondition` across kernel/runtime/compiler surfaces:
    - `src/kernel/types-ast.ts`
    - `src/kernel/schemas-ast.ts`
    - `src/cnl/compile-conditions.ts`
    - `src/kernel/eval-query.ts`
    - `src/kernel/validate-gamedef-behavior.ts`
  - Regenerated schema artifacts:
    - `schemas/GameDef.schema.json`
    - `schemas/Trace.schema.json`
    - `schemas/EvalReport.schema.json`
  - Refactored Texas traversal macros to consume the new primitive and removed duplicated offset/reduce traversal blocks:
    - `find-next-non-eliminated`
    - `find-next-to-act`
    - `post-forced-bets-and-set-preflop-actor`
  - Added/updated tests for lowering, runtime semantics, validation, and Texas macro structure.
- **Deviations from original plan**:
  - No additional alias/compatibility layer was introduced; only one canonical query shape was added.
  - Query uses a single implicit candidate binding (`$candidate`) for predicate evaluation to keep DSL surface minimal.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅

### Follow-up Refinement

- **Date**: 2026-02-16
- **Architecture upgrade**:
  - Removed implicit candidate-binding semantics from `nextPlayerByCondition`.
  - Added explicit binder declaration to the query contract:
    - `bind: string`
  - Updated compiler lowering to scope-check `where` against the declared `bind`.
  - Updated runtime evaluation to bind candidates using the declared binder name (no magic `$candidate`).
  - Updated binder-surface contract coverage to track `nextPlayerByCondition.bind` as a declared binder surface.
  - Updated Texas macros and tests to use explicit binders.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
