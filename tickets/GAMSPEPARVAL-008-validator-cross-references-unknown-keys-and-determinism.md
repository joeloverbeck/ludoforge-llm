# GAMSPEPARVAL-008 - Cross-References, Unknown Keys, and Deterministic Diagnostics

## Goal
Complete validator behavior for cross-reference integrity, fuzzy suggestions, identifier hygiene, and deterministic diagnostic ordering.

## Scope
- Cross-reference checks:
  - action `phase` references existing phase IDs
  - trigger/action references
  - zone adjacency IDs reference existing zones
- Unknown-key warnings with deterministic fuzzy alternatives.
- Identifier hygiene:
  - trimmed/non-empty IDs
  - NFC normalization before uniqueness checks
- Deterministic diagnostic ordering (source position, then path, then code).

## File List (Expected to Touch)
- `src/cnl/validate-spec.ts`
- `src/cnl/parser.ts` (only if ordering/source metadata plumbing is needed)
- `test/unit/validate-spec.test.ts`
- `test/integration/parse-full-spec.test.ts`

## Out of Scope
- New parser extraction behavior.
- New YAML hardening rule categories.
- CLI interface additions.
- Macro/compiler features from Spec 08b.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/validate-spec.test.js` covering:
  - action phase missing reference error with alternatives
  - unknown key warning with closest suggestion
  - duplicate IDs after NFC normalization error
- `node --test dist/test/integration/parse-full-spec.test.js` deterministic ordering assertion

### Invariants that must remain true
- Diagnostic output ordering is deterministic for identical input.
- Unknown-key suggestions are stable and reproducible.
- Validator remains total and side-effect free.
- Parser/validator separation boundary remains intact.
