# CORTYPSCHVAL-009 - Integration, Golden, and Property Test Coverage

## Goal
Add end-to-end confidence tests proving schema + semantic validation + serde behavior work together and remain deterministic.

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
