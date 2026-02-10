# GAMSPEPARVAL-007 - Structural Validator: Required Sections and Shape Rules

**Status**: ✅ COMPLETED

## Goal
Implement `validateGameSpec` structural checks for required sections and core shape/range constraints.

## Reassessed Baseline (Before This Ticket)
- `src/cnl/validate-spec.ts` is currently a stub that always returns `[]`.
- `test/unit/validate-spec.test.ts` currently covers API shape/totality only; no structural-rule assertions exist yet.
- `parseGameSpec` already owns YAML parsing/lint/extraction concerns; this ticket must stay inside validator-only structural checks per Spec 08a.

## Scope
- Required sections: `metadata`, `zones`, `turnStructure`, `actions`, `endConditions`.
- Metadata checks: `players.min >= 1`, `players.min <= players.max`.
- Variable checks: required fields and `min <= init <= max`.
- Zone checks: `owner`, `visibility`, `ordering` enum validation.
- Action checks: required fields (`id`, `actor`, `phase`, `effects`) and shape constraints.
- Turn structure checks: non-empty phases and valid `activePlayerOrder`.

## File List (Expected to Touch)
- `src/cnl/validate-spec.ts`
- `test/unit/validate-spec.test.ts`

## Out of Scope
- Cross-reference checks between sections.
- Unknown-key fuzzy suggestion logic.
- NFC normalization uniqueness checks.
- Parser internals or YAML hardening rules.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/validate-spec.test.js` covering at minimum:
  - valid structural doc yields zero errors
  - missing required-section diagnostics are emitted by `validateGameSpec`
  - variable range violations (`min > max`, `init` outside bounds)
  - invalid zone enum values
  - invalid turn structure (`phases` empty / bad `activePlayerOrder`)
  - action required-field/shape violations (`id`, `actor`, `phase`, `effects`)

### Invariants that must remain true
- Missing required sections are emitted by `validateGameSpec` (not parser).
- Validator is total for any `GameSpecDoc`.
- Validator does not mutate `GameSpecDoc` input.
- Diagnostic schema remains consistent (`path`, `severity`, `message`, `suggestion`).

## Assumptions and Boundaries
- This ticket intentionally excludes cross-reference checks, unknown-key fuzzy suggestions, and deterministic diagnostic ordering work (covered by follow-up tickets).
- Public API remains unchanged: `validateGameSpec(doc, options?) => readonly Diagnostic[]`.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Implemented structural validation in `src/cnl/validate-spec.ts` for required sections, metadata player bounds, variable required fields/ranges, zone enums, action required fields/shape, and turn-structure shape.
  - Expanded `test/unit/validate-spec.test.ts` from API-shape smoke tests to targeted structural rule coverage and non-mutation/totality checks.
- Deviations from original plan:
  - The original ticket assumed relevant structural tests already existed; baseline tests were API-shape-only, so additional structural test cases were added as part of this ticket.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/validate-spec.test.js` passed.
  - `npm test` passed.
