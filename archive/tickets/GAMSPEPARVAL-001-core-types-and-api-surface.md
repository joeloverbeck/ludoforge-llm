# GAMSPEPARVAL-001 - Core GameSpec Types and API Surface

**Status**: ✅ COMPLETED  
**Spec**: `specs/08a-game-spec-parser-validator.md`

## Goal
Create the foundational parser/validator type layer and public exports so later tickets can implement behavior without interface churn.

## Assumption Reassessment (2026-02-10)
- `src/cnl` currently only contains `expand-macros.ts` and `index.ts`; parser/validator core files listed below did not exist.
- No existing `game-spec-doc`, `parser`, or `validate-spec` tests existed in `test/unit`.
- Spec 08a defines full parser/validator behavior, but this ticket is the bootstrap API surface only. Full behavior remains deferred to later tickets.
- Existing public CNL exports (`generateGrid`, `generateHex`, `expandBoardMacro`) are consumed by tests and had to be preserved.

## Scope
- Add `GameSpecDoc` and related `GameSpec*` pre-compilation types.
- Add `SourceSpan` and `GameSpecSourceMap` types.
- Add parser/validator API signatures with total deterministic stub contracts.
- Export new APIs from `src/cnl/index.ts` without breaking existing exports.
- Add API-shape tests for new types/functions.

## File List (Touched)
- `src/cnl/game-spec-doc.ts` (new)
- `src/cnl/source-map.ts` (new)
- `src/cnl/parser.ts` (new)
- `src/cnl/validate-spec.ts` (new)
- `src/cnl/index.ts`
- `test/unit/game-spec-doc.test.ts` (new)
- `test/unit/parser.test.ts` (new)
- `test/unit/validate-spec.test.ts` (new)

## Out of Scope
- YAML parsing logic.
- Markdown fenced-block extraction.
- Section resolution or merge behavior.
- Structural validation rules.
- Any linter implementation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/parser.test.js` (API shape smoke test only)
- `node --test dist/test/unit/validate-spec.test.js` (API shape smoke test only)
- `npm run test:unit`

### Invariants that must remain true
- `parseGameSpec` and `validateGameSpec` are total contracts (never throw by type/contract and return diagnostics arrays).
- Section fields in `GameSpecDoc` remain nullable (`null` means missing section).
- Public API naming matches Spec 08a exactly (`parseGameSpec`, `validateGameSpec`, `GameSpecDoc`, `GameSpecSourceMap`).
- New types are immutable/readonly-first.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added Spec 08a core pre-compilation type definitions and empty-document factory in `src/cnl/game-spec-doc.ts`.
  - Added `SourceSpan` and `GameSpecSourceMap` in `src/cnl/source-map.ts`.
  - Added total/deterministic API stubs for `parseGameSpec` and `validateGameSpec` in `src/cnl/parser.ts` and `src/cnl/validate-spec.ts`.
  - Expanded `src/cnl/index.ts` exports to include the new types/functions while retaining existing macro exports.
  - Added unit API-shape tests for document shape, parser contract, and validator contract.
- **Deviations from original plan**:
  - Original ticket assumed these files/tests existed and needed adjustment; reassessment showed they were absent, so bootstrap creation was required.
  - Full parser/validator behavior from Spec 08a remains intentionally deferred to later tickets.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/unit/game-spec-doc.test.js` passed.
  - `node --test dist/test/unit/parser.test.js` passed.
  - `node --test dist/test/unit/validate-spec.test.js` passed.
  - `npm run test:unit` passed.
