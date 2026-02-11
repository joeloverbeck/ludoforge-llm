# FITLOPEANDSPEACT-001 - Operation Profile Schema and Compiler Diagnostics

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: Existing Spec 17 turn-flow scaffolding already present in `main`

## Assumption Reassessment (2026-02-11)
- `turnFlow` compiler/validator support from Spec 17 is already implemented and tested; this ticket should mirror that pattern for operation profiles rather than introducing a parallel architecture.
- Compiler behavior coverage for top-level section pass-through/diagnostics currently lives in `test/unit/compile-top-level.test.ts` (not `test/unit/compiler-api.test.ts`).
- Parser document-shape expectations are asserted in `test/unit/parser.test.ts`; adding a new top-level `GameSpecDoc` section requires updating those expectations.
- Runtime JSON schema parity is validated both via Zod top-level tests and schema artifact tests (`test/unit/schemas-top-level.test.ts`, `test/unit/json-schema.test.ts`), so both are in scope for this ticket.

## Goal
Add a generic declarative operation-profile contract to `GameSpecDoc` and compiled `GameDef` with strict compiler diagnostics for legality, cost, targeting, sequencing, and partial-execution policy completeness.

## Scope
- Extend `GameSpecDoc` type surface with a generic operation-profile section.
- Extend parser/validator/compiler lowering so operation profiles are validated and emitted deterministically into `GameDef`.
- Reject ambiguous or underspecified operation profiles with blocking diagnostics.
- Keep the contract reusable for non-FITL games.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/section-identifier.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-spec.ts`
- `src/cnl/compiler.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/validate-gamedef.ts`
- `schemas/GameDef.schema.json`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/parser.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/json-schema.test.ts`

## Out of scope
- Runtime execution semantics for applying operation profiles.
- Optional-cardinality (`up to N`) selection behavior (ticket `FITLOPEANDSPEACT-002`).
- FITL-specific operation content for US/ARVN/NVA/VC.
- Monsoon/highland/tunnel/base-rule mechanics implementation.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/validate-spec.test.js`
- `node --test dist/test/unit/compiler-api.test.js`
- `node --test dist/test/unit/validate-gamedef.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`

## Invariants that must remain true
- Compiler output is deterministic for identical input YAML.
- Existing non-operation CNL sections compile unchanged.
- No FITL-specific ids are hardcoded into shared compiler/kernel logic.
- `GameSpecDoc -> GameDef -> simulation` remains the only execution path.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added generic `operationProfiles` contract support in `GameSpecDoc`, parser section routing, CNL validator, compiler lowering, `GameDef` types, runtime schemas, JSON schema artifact, and `validateGameDef`.
  - Added strict diagnostics for underspecified/ambiguous profiles (missing required fields, unknown action references, duplicate/ambiguous action mappings, invalid partial-execution mode, invalid linked windows).
  - Added focused tests across parser/spec-validator/compiler/runtime-validator/schema layers.
- **Deviation from original plan**:
  - Compiler diagnostics coverage landed in `test/unit/compile-top-level.test.ts` instead of `test/unit/compiler-api.test.ts` (which remains unchanged and passing), matching the current repo’s compiler-top-level test structure.
  - Included `test/unit/parser.test.ts` and `test/unit/json-schema.test.ts` updates to keep parser shape and schema artifact checks aligned.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/game-spec-doc.test.js dist/test/unit/parser.test.js dist/test/unit/validate-spec.test.js dist/test/unit/compile-top-level.test.js dist/test/unit/compiler-api.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/schemas-top-level.test.js dist/test/unit/json-schema.test.js`
