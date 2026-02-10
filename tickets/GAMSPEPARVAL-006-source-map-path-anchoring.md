# GAMSPEPARVAL-006 - Source Map Path Anchoring for Parsed Spec Paths

## Goal
Add canonical path-to-source anchoring so diagnostics can include stable context snippets and line/column spans.

## Scope
- Implement source span capture per mapped canonical path.
- Populate `GameSpecSourceMap.byPath` while parser maps sections.
- Ensure mapping is deterministic and stable across identical input.
- Include parser wiring for `contextSnippet` enrichment when source map exists.

## File List (Expected to Touch)
- `src/cnl/source-map.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-spec.ts` (consume source map option)
- `test/unit/source-map.test.ts`
- `test/unit/parser.test.ts`

## Out of Scope
- New lint rules.
- New structural validator semantics.
- CLI output formatting decisions.
- Any compilation logic.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/source-map.test.js`
- `node --test dist/test/unit/parser.test.js` (source map exists for mapped canonical paths)

### Invariants that must remain true
- Source spans are 1-based and reference markdown coordinates.
- Identical markdown input produces identical `sourceMap` content.
- Missing source map never causes validator failure.
- Parser and validator remain total.
