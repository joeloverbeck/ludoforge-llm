# GAMSPEPARVAL-002 - YAML Hardening Linter Framework and Rules 1-10

**Status**: ✅ COMPLETED

## Goal
Implement the YAML hardening linter framework and the first ten mistake detectors (1-10 from Spec 08a) with deterministic diagnostics.

## Reassessed Assumptions (Codebase Reality)
- `src/cnl/yaml-linter.ts` did not exist before this ticket.
- `test/unit/yaml-linter.test.ts` did not exist before this ticket.
- `parseGameSpec` in `src/cnl/parser.ts` was a deterministic total stub returning empty doc/sourceMap and no diagnostics.
- Therefore, this ticket must introduce initial linter infrastructure and parser lint surfacing from scratch, not incremental rule additions to pre-existing linter code.

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
- Wire parser lint invocation for fenced YAML blocks while preserving current parser API and stubbed section-mapping behavior.

## File List (Expected to Touch)
- `src/cnl/yaml-linter.ts`
- `src/cnl/parser.ts` (wire lint invocation only)
- `src/cnl/index.ts` (export linter API)
- `test/unit/yaml-linter.test.ts`
- `test/unit/parser.test.ts`

## Out of Scope
- Mistake detections 11-20.
- Parser section mapping and merge policy.
- Source map generation.
- Structural or cross-reference validation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/yaml-linter.test.js` with explicit cases covering mistake IDs 1-10
- `node --test dist/test/unit/parser.test.js` (assert lint diagnostics are surfaced while parser remains total/stubbed for doc mapping)

### Invariants that must remain true
- Linter remains lexical/syntax hardening only (no required-section or semantic enforcement).
- Diagnostics are deterministic for identical input.
- Linter does not mutate raw YAML input.
- Parser remains total when linter emits diagnostics.

## Outcome
- Completion date: 2026-02-10
- Implemented an initial rule-driven YAML hardening linter (`src/cnl/yaml-linter.ts`) covering mistake IDs 1-10 with deterministic ordering.
- Wired `parseGameSpec` to run linting on fenced YAML/YML/unlabeled code blocks and surface diagnostics without changing the public parser API or introducing section mapping.
- Added unit tests for linter rules and parser lint surfacing.
- Deviation from original assumption: parser integration was implemented against a stub baseline (no prior linter/framework existed), so this ticket established the first working linter foundation rather than extending existing linter code.
