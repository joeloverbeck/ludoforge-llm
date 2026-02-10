# GAMSPEPARVAL-007 - Structural Validator: Required Sections and Shape Rules

## Goal
Implement `validateGameSpec` structural checks for required sections and core shape/range constraints.

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
- `node --test dist/test/unit/validate-spec.test.js` covering:
  - valid doc yields zero errors
  - missing metadata error
  - variable with `min > max` error
  - invalid zone enum values error
  - invalid turn structure error

### Invariants that must remain true
- Missing required sections are emitted by `validateGameSpec` (not parser).
- Validator is total for any `GameSpecDoc`.
- Validator does not mutate `GameSpecDoc` input.
- Diagnostic schema remains consistent (`path`, `severity`, `message`, `suggestion`).
