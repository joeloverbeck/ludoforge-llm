# GAMSPEPARVAL-008 - Cross-References, Unknown Keys, and Deterministic Diagnostics

**Status**: ✅ COMPLETED

## Goal
Complete validator behavior for cross-reference integrity, fuzzy suggestions, identifier hygiene, and deterministic diagnostic ordering.

## Scope
- Cross-reference checks:
  - action `phase` references existing phase IDs
  - trigger `event.phase` and `event.action` references
  - zone adjacency IDs reference existing zones
- Unknown-key warnings with deterministic fuzzy alternatives.
- Identifier hygiene:
  - trimmed/non-empty IDs
  - NFC normalization before uniqueness checks
- Deterministic diagnostic ordering (`path`, then `code`; when `sourceMap` is available, source position is considered first).

## Reassessed Assumptions
- `src/cnl/validate-spec.ts` currently performs only structural checks and does not yet implement the cross-reference, unknown-key, or NFC duplicate behaviors listed above.
- `test/integration/parse-full-spec.test.ts` does not exist in this repository; coverage for this ticket must be implemented in `test/unit/validate-spec.test.ts`.
- Parser changes are not required for this ticket unless validator ordering needs additional source-map plumbing.

## File List (Expected to Touch)
- `src/cnl/validate-spec.ts`
- `test/unit/validate-spec.test.ts`

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
- deterministic ordering assertion for repeated runs of the same invalid spec

### Invariants that must remain true
- Diagnostic output ordering is deterministic for identical input.
- Unknown-key suggestions are stable and reproducible.
- Validator remains total and side-effect free.
- Parser/validator separation boundary remains intact.

## Outcome
- **Completion date**: 2026-02-10
- **What was changed**:
  - Implemented validator cross-reference checks for action phase references, trigger event phase/action references, and zone adjacency references.
  - Implemented unknown-key warnings with deterministic fuzzy suggestions.
  - Implemented identifier hygiene checks (trimmed/non-empty IDs, NFC normalization, and duplicate-after-normalization detection).
  - Implemented deterministic diagnostic sorting (`sourceMap` position when available, then `path`, then `code`).
  - Added focused unit coverage in `test/unit/validate-spec.test.ts`.
- **Deviations from original plan**:
  - Did not add `test/integration/parse-full-spec.test.ts` because it does not exist in this repository; deterministic-order coverage was added in unit tests instead.
  - Parser code changes were not required.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/validate-spec.test.js` passed.
  - `npm test` passed.
