# GAMSPEPARVAL-003 - YAML Hardening Linter Rules 11-20 and Diagnostic Caps
**Status**: ✅ COMPLETED

## Goal
Complete YAML hardening by implementing mistake detectors 11-20 and enforcing diagnostic count safety behavior.

## Reassessed Assumptions (2026-02-10)
- `src/cnl/yaml-linter.ts` currently implements mistake detectors 1-10 only; detectors 11-20 are missing.
- `src/cnl/parser.ts` currently only extracts fenced YAML blocks and forwards linter diagnostics; it does not enforce a diagnostic cap yet.
- `test/unit/yaml-linter.test.ts` currently covers only mistake detectors 1-10.
- `test/unit/parser.test.ts` currently validates API shape and lint passthrough, but does not validate diagnostic cap or truncation warning behavior.
- Per `specs/08a-game-spec-parser-validator.md`, diagnostic safety behavior belongs in parser limits and should append a trailing truncation warning when diagnostics are capped.

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
- Keep parser behavior limited to current ticket intent (YAML hardening + diagnostic cap wiring) and do not expand structural parsing responsibilities.

## File List (Expected to Touch)
- `src/cnl/yaml-linter.ts`
- `src/cnl/parser.ts` (diagnostic cap enforcement/wiring)
- `test/unit/yaml-linter.test.ts`
- `test/unit/parser.test.ts`

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
- `parseGameSpec` remains total and deterministic.

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Implemented YAML hardening detections `CNL_YAML_011` through `CNL_YAML_020` in `src/cnl/yaml-linter.ts`.
  - Added parser diagnostic cap wiring in `src/cnl/parser.ts` with optional `maxDiagnostics` and trailing truncation warning (`CNL_PARSER_DIAGNOSTICS_TRUNCATED`).
  - Expanded unit coverage in `test/unit/yaml-linter.test.ts` to include one case per mistake type across all 20 rules.
  - Added parser cap/truncation behavior coverage in `test/unit/parser.test.ts`.
- Deviations from original plan:
  - No additional parser responsibilities were added beyond diagnostic-cap safety; structural parsing remains out of scope for this ticket.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/unit/yaml-linter.test.js` passed.
  - `node --test dist/test/unit/parser.test.js` passed.
  - `npm test` passed.
