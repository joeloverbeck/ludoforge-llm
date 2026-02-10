# GAMSPEPARVAL-001 - Core GameSpec Types and API Surface

## Goal
Create the foundational parser/validator type layer and public exports so later tickets can implement behavior without interface churn.

## Scope
- Add `GameSpecDoc` and related `GameSpec*` pre-compilation types.
- Add `SourceSpan` and `GameSpecSourceMap` types.
- Add parser/validator API signatures and deterministic return contracts.
- Export new APIs from `src/cnl/index.ts`.

## File List (Expected to Touch)
- `src/cnl/game-spec-doc.ts`
- `src/cnl/source-map.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-spec.ts`
- `src/cnl/index.ts`
- `test/unit/game-spec-doc.test.ts`

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

### Invariants that must remain true
- `parseGameSpec` and `validateGameSpec` are total contracts (never throw by type/contract and return diagnostics arrays).
- Section fields in `GameSpecDoc` remain nullable (`null` means missing section).
- Public API naming matches Spec 08a exactly (`parseGameSpec`, `validateGameSpec`, `GameSpecDoc`, `GameSpecSourceMap`).
- New types are immutable/readonly-first.
