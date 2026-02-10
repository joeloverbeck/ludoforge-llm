# CORTYPSCHVAL-009 - Integration, Golden, and Property Test Coverage

**Status**: ✅ COMPLETED

## Goal
Add end-to-end confidence tests proving schema + semantic validation + serde behavior work together and remain deterministic.

## Reassessed Assumptions (2026-02-10)
- `validateGameDef` and its core semantic checks already exist in `src/kernel/validate-gamedef.ts`; this ticket is test-coverage focused, not validator feature implementation.
- Existing validation coverage currently lives in `test/unit/validate-gamedef.test.ts`; there is no existing golden/property split yet.
- `test/integration/` exists but is currently empty; adding integration tests there is aligned with repo layout.
- No dedicated property-testing library is installed; property-style checks should be deterministic and table-driven using built-in `node:test`.
- JSON fixtures referenced by this ticket do not exist yet and need to be added if tests depend on fixture files.

## Updated Scope
- Add integration tests that validate Zod + semantic validation behavior together for valid and invalid game definitions.
- Add golden tests that lock stable diagnostics (`code`, `path`, `severity`, message substring) for known fixtures.
- Add deterministic property-style tests for:
  - JSON stringify/parse Zod stability on valid defs.
  - diagnostic shape quality (`code`, `path`, `message` non-empty).
  - deterministic `validateGameDef` output ordering/content for repeated runs.
- Keep runtime/kernel behavior unchanged unless a test exposes a concrete discrepancy with existing expected behavior.
- Preserve existing public exports and APIs.

## File List Expected To Touch
- `test/integration/core-types-validation.integration.test.ts`
- `test/unit/validate-gamedef.golden.test.ts`
- `test/unit/property/core-types-validation.property.test.ts`
- `test/fixtures/gamedef/minimal-valid.json`
- `test/fixtures/gamedef/invalid-reference.json`
- `test/fixtures/trace/valid-serialized-trace.json`

## Implementation Notes
- Add integration coverage where realistic game defs pass both Zod and `validateGameDef`.
- Add multi-error validation assertion to ensure accumulation (not fail-fast).
- Add golden tests for fixed expected diagnostics (path/severity/message substring).
- Add property tests:
  - Zod round-trip `JSON.parse(JSON.stringify(gameDef))` stability.
  - diagnostic quality (`code`, `path`, `message` always non-empty).
  - determinism of `validateGameDef` ordering and content.

## Out Of Scope
- New runtime logic in kernel/sim.
- Additional AST variants or type model changes.
- CLI behavior changes.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/integration/core-types-validation.integration.test.ts`:
  - realistic valid game def passes Zod + semantic validation.
  - invalid game def returns multiple diagnostics in one run.
- `test/unit/validate-gamedef.golden.test.ts`:
  - minimal valid fixture yields zero diagnostics.
  - known invalid fixture yields expected stable diagnostics.
- `test/unit/property/core-types-validation.property.test.ts`:
  - JSON stringify/parse round-trip preserves Zod validity for valid defs.
  - diagnostics always include non-empty `code`, `path`, `message`.
  - repeated validation on same input yields identical diagnostics.

### Invariants That Must Remain True
- Validation outputs are stable enough for golden snapshots.
- System enforces both structural and semantic correctness.
- Property tests do not rely on nondeterministic seeds without explicit seeding.

## Outcome
- Completion date: 2026-02-10
- What was actually changed:
  - Added integration coverage in `test/integration/core-types-validation.integration.test.ts` for valid Zod + semantic validation and multi-diagnostic accumulation on invalid input.
  - Added golden diagnostics coverage in `test/unit/validate-gamedef.golden.test.ts` asserting stable `code`/`path`/`severity` plus message substrings.
  - Added deterministic property-style coverage in `test/unit/property/core-types-validation.property.test.ts` for JSON round-trip schema validity, diagnostic quality fields, and repeated deterministic validator output.
  - Added fixtures:
    - `test/fixtures/gamedef/minimal-valid.json`
    - `test/fixtures/gamedef/invalid-reference.json`
    - `test/fixtures/trace/valid-serialized-trace.json`
- Deviations from originally planned assumptions/scope:
  - No runtime/kernel code changes were required; existing validator logic already satisfied intended semantics.
  - Property coverage was implemented as deterministic table-driven tests using built-in `node:test` (no external property-testing dependency).
- Verification results:
  - `npm test` passed (build + unit + integration).
