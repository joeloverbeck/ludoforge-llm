# FITLCOUROUANDVIC-001 - Coup/Victory Data Contracts and Compiler Lowering

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: Spec 17/18 data-path foundations already in repo

## Goal
Add generic `GameSpecDoc` and `GameDef` contract support for declarative Coup-phase plans and victory definitions so Spec 19 can be encoded in YAML without FITL-specific runtime branching.

## Assumption Reassessment (2026-02-11)
- Existing support already present: generic turn-flow timing/lifecycle primitives already include `coup` duration windows and coup boundary lifecycle trace steps in `turnFlow`.
- Missing support confirmed: there is currently no generic top-level declarative contract section for Coup phase plans or victory definitions in `GameSpecDoc`/`GameDef`.
- Validation gap confirmed: no structural compiler/runtime validation currently exists for malformed Coup/victory declarations because those sections are not yet modeled.
- Scope correction: this ticket should add only declarative contract modeling + lowering + structural validation. It should not modify turn-flow execution behavior already implemented by prior work.

## Implementation Tasks
1. Extend `GameSpecDoc` schema/types with optional generic declarative sections for Coup round plans and victory definitions.
2. Lower those sections into optional runtime `GameDef` structures without altering existing turn-flow execution.
3. Add structural validation and blocking diagnostics for malformed declarations in both compile path and `validateGameDef`.
4. Keep all new contracts title-agnostic (no FITL literals, no per-title schema files, no special-case branches).

## File List Expected To Touch
- `src/cnl/game-spec-doc.ts`
- `src/cnl/compiler.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `src/kernel/validate-gamedef.ts`
- `test/unit/game-spec-doc.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/schemas-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- Executing any Coup phase behavior.
- Track recomputation algorithms.
- Final ranking/margin calculations.
- FITL YAML content authoring beyond minimal fixtures needed for compilation tests.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/game-spec-doc.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/unit/schemas-top-level.test.js`
- `node --test dist/test/unit/validate-gamedef.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Compiler path remains `GameSpecDoc` -> `GameDef` with deterministic output ordering.
- Runtime/compiler modules contain no FITL-identifier branching.
- Invalid declarations fail with deterministic diagnostics (`code`, `path`, `message` non-empty).

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Added optional generic `coupPlan` and `victory` sections to `GameSpecDoc` and `GameDef` contracts.
  - Added compiler lowering and blocking diagnostics for malformed `doc.coupPlan`/`doc.victory`.
  - Added runtime schema support (`GameDefSchema`) for `coupPlan`/`victory`.
  - Added `validateGameDef` structural/reference checks for new contracts.
  - Added/updated unit tests across parser/doc/compiler/schema/validator coverage.
- **Deviations from original plan**:
  - `src/kernel/index.ts` was not changed because it already re-exported `types`/`schemas`/`validate-gamedef`; no new export wiring was required.
  - Parser section resolution (`src/cnl/parser.ts`, `src/cnl/section-identifier.ts`) was updated although not listed originally, because YAML sections must be parseable to satisfy Spec 19’s data-path intent.
- **Verification results**:
  - `npm run build` passed.
  - Required tests passed:
    - `node --test dist/test/unit/game-spec-doc.test.js`
    - `node --test dist/test/unit/compile-top-level.test.js`
    - `node --test dist/test/unit/schemas-top-level.test.js`
    - `node --test dist/test/unit/validate-gamedef.test.js`
    - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - Additional modified-surface test passed:
    - `node --test dist/test/unit/parser.test.js`
