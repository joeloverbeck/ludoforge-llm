# GAMSPEPARVAL-004 - Deterministic Section Identification and Merge Policy

## Goal
Implement deterministic section resolution and merge behavior independent of markdown/YAML block order.

## Scope
- Create `src/cnl/section-identifier.ts`.
- Implement section precedence:
  1. Explicit `section:` key
  2. Canonical top-level section keys
  3. Fingerprint fallback only on single unambiguous match
- Emit ambiguity diagnostics for 0-or-many fallback matches.
- Implement singleton first-wins + warning behavior (`metadata`, `constants`, `turnStructure`).
- Implement list-section append behavior preserving encounter order.

## File List (Expected to Touch)
- `src/cnl/section-identifier.ts`
- `src/cnl/parser.ts`
- `test/unit/parser.test.ts`

## Out of Scope
- YAML hardening linter internals.
- Source map line/column anchoring logic.
- Structural validator checks.
- CLI command integration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/parser.test.js` covering:
  - reversed section order equivalence
  - duplicate singleton section first-wins warning
  - repeated list section append order
  - ambiguous fallback diagnostic

### Invariants that must remain true
- Section mapping is order-independent.
- Duplicate singleton behavior is deterministic and warns.
- Array item order within each block is preserved exactly.
- Parser remains total even when section resolution fails for specific blocks.
