# GAMESPECDOC-002: Dynamic Integer Domains for Action Parameters

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Large  
**Backwards Compatibility**: None (schema/runtime contract expansion; migrate directly)

## What To Change / Add

Add first-class support for dynamic integer parameter bounds in GameSpecDoc/AST/runtime.

1. Extend integer-domain query support so action parameter domains can express runtime-evaluated bounds (e.g., min/max as `ValueExpr`).
2. Update compiler, schema, validator, and runtime query evaluation to support dynamic bounds safely.
3. Enforce deterministic behavior and guardrails for invalid runtime bounds (e.g., min > max => empty domain).
4. Migrate existing specs that currently use wide static ranges + precondition guards where direct dynamic bounds are cleaner.

## Invariants

1. Dynamic domain evaluation is deterministic for identical state + seed.
2. Domain result is equivalent to current static behavior when min/max are literals.
3. Invalid evaluated bounds do not crash; they produce empty legal-domain behavior deterministically.
4. Compiler/runtime schema contracts remain game-agnostic and generic.

## Tests

1. **Unit**: query eval for dynamic min/max with representative `ValueExpr` forms.
2. **Unit**: dynamic bounds edge cases (`min == max`, `min > max`, negative/large values within allowed limits).
3. **Unit**: validation behavior for malformed dynamic bound expressions.
4. **Integration**: action params constrained by dynamic resources (transfer-like flows) enumerate only legal values.
5. **Regression**: static-domain existing tests remain passing unchanged.
