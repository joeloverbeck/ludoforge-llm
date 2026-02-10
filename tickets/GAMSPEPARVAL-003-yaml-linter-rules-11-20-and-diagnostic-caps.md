# GAMSPEPARVAL-003 - YAML Hardening Linter Rules 11-20 and Diagnostic Caps

## Goal
Complete YAML hardening by implementing mistake detectors 11-20 and enforcing diagnostic count safety behavior.

## Scope
- Add mistake detections 11-20:
  11. Incorrect list syntax
  12. Type confusion (number vs string)
  13. Anchor/alias misuse
  14. Empty values
  15. Comment-in-string errors
  16. Encoding issues
  17. Missing document markers
  18. Flow vs block style confusion
  19. Nested quoting errors
  20. Multiline folding errors
- Enforce `maxDiagnostics` behavior (truncate with trailing truncation warning).
- Extend tests to one case per mistake type across all 20 rules.

## File List (Expected to Touch)
- `src/cnl/yaml-linter.ts`
- `src/cnl/parser.ts` (diagnostic cap enforcement/wiring)
- `test/unit/yaml-linter.test.ts`

## Out of Scope
- Structural validator rules.
- Section resolver fallback/ambiguity behavior.
- Source map path anchoring details.
- Macro expansion or compilation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/yaml-linter.test.js` with all 20 mistake IDs covered
- `node --test dist/test/unit/parser.test.js` (diagnostic cap + truncation warning behavior)

### Invariants that must remain true
- Exactly the listed 20 hardening mistake categories are covered.
- Diagnostics remain stable in ordering: source position, then path, then code.
- Linter still avoids structural rules owned by `validateGameSpec`.
