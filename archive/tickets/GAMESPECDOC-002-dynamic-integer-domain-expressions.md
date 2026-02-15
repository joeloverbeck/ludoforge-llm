# GAMESPECDOC-002: Dynamic Integer Domains for Action Parameters

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Backwards Compatibility**: None (schema/runtime contract expansion; migrate directly)

## Reassessed Current State (Code + Tests)

Current implementation is static-only for `intsInRange` bounds:

1. `src/kernel/types-ast.ts` defines `intsInRange` as `{ min: number, max: number }`.
2. `src/kernel/schemas-ast.ts` enforces numeric literals for `min`/`max`.
3. `src/cnl/compile-conditions.ts` rejects non-integer literals for `intsInRange`.
4. `src/kernel/eval-query.ts` assumes numeric `min`/`max` and directly enumerates range values.
5. `src/kernel/validate-gamedef-behavior.ts` validates `intsInRange` only with literal comparison `min <= max`.

Existing tests cover static behavior and malformed literal ranges, but do not cover dynamic `ValueExpr` bounds for `intsInRange`.

## What To Change / Add

Add first-class support for dynamic integer parameter bounds in GameSpecDoc/AST/runtime.

1. Extend `OptionsQuery.intsInRange` to allow `min`/`max` as `number | ValueExpr` (no aliases, no compatibility layer).
2. Update `schemas-ast`, CNL lowering, GameDef validation, and runtime `evalQuery` to evaluate dynamic bounds safely and deterministically.
3. Define runtime guardrails:
   - Non-integer evaluated bound values produce deterministic empty domain behavior.
   - `min > max` produces deterministic empty domain behavior.
   - Existing query result bound checks (`maxQueryResults`) still apply.
4. Keep contracts generic/game-agnostic (no per-game branching).
5. Migrate only concrete in-repo cases where a static wide range + guard pattern exists; if none exist, document that no migration was required.

## Invariants

1. Dynamic domain evaluation is deterministic for identical state + seed.
2. Domain result is equivalent to current static behavior when min/max are literals.
3. Invalid evaluated bounds (non-integer, non-finite, `min > max`) do not crash; they produce empty legal-domain behavior deterministically.
4. Compiler/runtime schema contracts remain game-agnostic and generic.

## Tests

1. **Unit (`eval-query`)**: dynamic `intsInRange` min/max via representative `ValueExpr` forms (bindings, refs, arithmetic).
2. **Unit (`eval-query`)**: edge cases (`min == max`, `min > max`, non-integer bound result, non-finite bound result).
3. **Unit (`validate-gamedef`)**: static invalid range diagnostics still emitted; dynamic bounds accepted structurally and checked as `ValueExpr`.
4. **Unit (`compile-conditions`)**: lowering accepts `intsInRange` with expression bounds and still rejects malformed query shape.
5. **Integration (`legal-moves`)**: action param domains with dynamic bounds enumerate only legal values for current state.
6. **Regression**: existing static-domain tests remain unchanged and passing.

## Outcome

- **Completion date**: February 15, 2026
- **What was changed**:
  - Implemented dynamic `intsInRange` bounds across AST type contracts, AST schemas, CNL lowering, runtime query evaluation, and GameDef behavioral validation.
  - Added deterministic runtime guardrails so invalid evaluated bounds produce empty domains instead of crashing.
  - Added/updated unit tests for schema parsing, lowering, runtime evaluation, validation diagnostics, and legal-move enumeration using dynamic bounds.
- **Deviations from original plan**:
  - No concrete in-repo GameSpec/YAML migration candidates were found that required replacing static wide ranges + precondition guards, so no spec migration was performed.
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:unit` passed.
  - `npm test` passed (unit + integration).
