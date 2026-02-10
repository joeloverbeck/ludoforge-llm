# GAMSPEPARVAL-009 - End-to-End, Property, and Golden Coverage

## Goal
Add comprehensive integration/property/golden coverage for the complete parse+validate flow (`spec:lint` behavior).

## Scope
- Integration tests for realistic full markdown spec (clean case and multi-issue case).
- Property tests for parser totality and deterministic behavior.
- Golden tests for:
  - valid markdown -> expected `GameSpecDoc` + source map anchors
  - invalid markdown -> expected diagnostics payload
- Ensure `spec:lint` output ordering is stable across repeated runs.

## File List (Expected to Touch)
- `test/integration/parse-full-spec.test.ts`
- `test/unit/parser.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/source-map.test.ts`
- `test/fixtures/` (new golden fixtures)

## Out of Scope
- Functional parser or validator rule additions (except minimal fixes required to make tests pass).
- CLI UX redesign.
- Any schema or kernel runtime changes.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`
- Golden assertions must verify path, severity, message, suggestion, and alternatives shape.

### Invariants that must remain true
- Parser and validator are deterministic for identical inputs.
- Every emitted diagnostic has non-empty `path` and `message`.
- `spec:lint` ordering remains stable and reproducible.
- Tests do not weaken validation expectations to match bugs.
