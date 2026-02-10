# GAMSPEPARVAL-006 - Source Map Path Anchoring for Parsed Spec Paths

**Status**: ✅ COMPLETED

## Goal
Add canonical path-to-source anchoring so diagnostics can include stable context snippets and line/column spans.

## Assumption Reassessment (2026-02-10)
- `src/cnl/validate-spec.ts` is currently an API-shape stub that returns no diagnostics, so validator-side `contextSnippet` enrichment is not currently reachable in this ticket.
- `test/unit/source-map.test.ts` does not exist in this repo; parser/source-map behavior is currently covered in `test/unit/parser.test.ts`.
- Current parser behavior only anchors top-level section keys (for example, `metadata`) in `sourceMap.byPath`, not canonical nested paths.

## Scope
- Implement source span capture per mapped canonical path.
- Populate `GameSpecSourceMap.byPath` while parser maps sections, including canonical nested paths under mapped sections.
- Ensure mapping is deterministic and stable across identical input.
- Keep parser API total/deterministic and preserve public interfaces.

## File List (Expected to Touch)
- `src/cnl/source-map.ts`
- `src/cnl/parser.ts`
- `test/unit/parser.test.ts`

## Out of Scope
- New lint rules.
- New structural validator semantics.
- `validateGameSpec` semantic implementation beyond current API-shape contract.
- CLI output formatting decisions.
- Any compilation logic.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/parser.test.js` (source map includes mapped canonical paths, including nested paths)

### Invariants that must remain true
- Source spans are 1-based and reference markdown coordinates.
- Identical markdown input produces identical `sourceMap` content.
- Missing source map never causes validator failure.
- Parser and validator remain total.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Parser now captures and stores canonical nested path anchors in `sourceMap.byPath` (for example, `metadata.players.min`, `actions[1].id`) with deterministic first-write-wins behavior.
  - List-section anchoring now accounts for merged index offsets across repeated blocks.
  - Parser tests were expanded to verify nested path anchoring, merged list index anchoring, and deterministic source-map output for identical input.
- **Deviation from original plan**:
  - No `validate-spec.ts` changes were made because validator diagnostics are still stubbed in current code.
  - No `test/unit/source-map.test.ts` was added because source-map assertions are maintained in `test/unit/parser.test.ts`.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/parser.test.js`
  - `npm test`
