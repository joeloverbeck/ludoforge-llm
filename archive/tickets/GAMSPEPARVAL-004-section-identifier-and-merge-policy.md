# GAMSPEPARVAL-004 - Deterministic Section Identification and Merge Policy

**Status**: ✅ COMPLETED

## Goal
Implement deterministic section resolution and merge behavior independent of markdown/YAML block order.

## Assumption Reassessment (2026-02-10)
- Previous assumption: parser already performed strict YAML parsing and section mapping, and this ticket only needed incremental merge-policy logic.
- Actual code state: `parseGameSpec` only ran YAML lint and returned an empty `GameSpecDoc`/`sourceMap`; no section mapping or merge behavior existed yet.
- Scope adjustment: this ticket includes the minimum parser plumbing required to support deterministic section identification and merge policy as defined in Spec 08a, without expanding into validator work or broad parser hardening.

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

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added `src/cnl/section-identifier.ts` for deterministic section resolution with precedence rules (explicit `section`, canonical keys, fallback fingerprint with ambiguity handling).
  - Updated `src/cnl/parser.ts` to parse YAML blocks, resolve sections, apply singleton/list merge policy, emit parser diagnostics, and populate section-level `sourceMap`.
  - Expanded `test/unit/parser.test.ts` with order-independence, duplicate singleton warning, list append order, and ambiguous fallback coverage.
- Deviations from original plan:
  - None in behavior. Implementation also included minimal YAML parse diagnostics wiring because the parser baseline was a lint-only stub and could not satisfy this ticket without it.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/unit/parser.test.js` passed.
  - `npm run test:unit` passed.
