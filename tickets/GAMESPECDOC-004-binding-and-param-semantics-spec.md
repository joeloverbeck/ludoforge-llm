# GAMESPECDOC-004: Binding and Parameter Semantics Specification

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Small  
**Backwards Compatibility**: None (documentation + validation contract lock-in)

## What To Change / Add

Create a normative architecture/spec document for binding and parameter semantics.

1. Document exact rules for:
   - declaration (`params`, `bind`)
   - scope and shadowing
   - reference lookup order
   - action executor binding behavior
   - legality-time vs execution-time binding resolution
2. Align documentation with actual compiler/runtime behavior after strict-contract migration.
3. Add cross-links to relevant schema/validator and kernel modules.
4. Add lint/validation checks where behavior can be statically enforced.

## Invariants

1. One authoritative semantics source exists for binding/param behavior.
2. Documented semantics match implementation and tests.
3. New contributors can implement GameSpecDocs without relying on implicit conventions.
4. Semantics remain game-agnostic and reusable for arbitrary board/card games.

## Tests

1. **Doc/contract test**: targeted tests reference and assert the documented rules (naming/scope/lookup).
2. **Unit**: example cases from the document are executable as tests.
3. **Regression**: validator diagnostics expected by the document are stable.
