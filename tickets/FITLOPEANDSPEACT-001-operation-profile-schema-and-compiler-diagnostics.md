# FITLOPEANDSPEACT-001 - Operation Profile Schema and Compiler Diagnostics

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: Spec 17 acceptance tests passing

## Goal
Add a generic declarative operation-profile contract to `GameSpecDoc` and compiled `GameDef` with strict compiler diagnostics for legality, cost, targeting, sequencing, and partial-execution policy completeness.

## Scope
- Extend `GameSpecDoc` type surface with a generic operation-profile section.
- Extend parser/validator/compiler lowering so operation profiles are validated and emitted deterministically into `GameDef`.
- Reject ambiguous or underspecified operation profiles with blocking diagnostics.
- Keep the contract reusable for non-FITL games.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-spec.ts`
- `src/cnl/compiler.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/validate-gamedef.ts`
- `schemas/GameDef.schema.json`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/compiler-api.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/unit/schemas-top-level.test.ts`

## Out of scope
- Runtime execution semantics for applying operation profiles.
- Optional-cardinality (`up to N`) selection behavior.
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
