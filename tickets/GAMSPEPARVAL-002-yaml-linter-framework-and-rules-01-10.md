# GAMSPEPARVAL-002 - YAML Hardening Linter Framework and Rules 1-10

## Goal
Implement the YAML hardening linter framework and the first ten mistake detectors (1-10 from Spec 08a) with deterministic diagnostics.

## Scope
- Create `src/cnl/yaml-linter.ts` with a rule-driven linter pipeline.
- Implement mistake detections 1-10:
  1. Unquoted colons in values
  2. Inconsistent indentation
  3. Mixed tabs and spaces
  4. Unquoted boolean-like strings
  5. Trailing whitespace
  6. Duplicate keys
  7. Unknown section key
  8. Invalid YAML syntax
  9. Unescaped special characters
  10. Bare multi-line strings
- Normalize diagnostic structure and deterministic sorting for linter output.

## File List (Expected to Touch)
- `src/cnl/yaml-linter.ts`
- `src/cnl/parser.ts` (wire lint invocation only)
- `test/unit/yaml-linter.test.ts`

## Out of Scope
- Mistake detections 11-20.
- Parser section mapping and merge policy.
- Source map generation.
- Structural or cross-reference validation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/yaml-linter.test.js` with explicit cases covering mistake IDs 1-10
- `node --test dist/test/unit/parser.test.js` (assert lint diagnostics are surfaced)

### Invariants that must remain true
- Linter remains lexical/syntax hardening only (no required-section or semantic enforcement).
- Diagnostics are deterministic for identical input.
- Linter does not mutate raw YAML input.
- Parser remains total when linter emits diagnostics.
