# FITLSPEACTFULEFF-001 - Shared SA Contracts: Zero Cost and Accompanying-Op Constraints

**Status**: ✅ COMPLETED  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Architectural Patterns, Rule 4.1, Rule 4.1.1)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (Sections 2, 4, 6)  
**Depends on**: Spec 26 interleaving model availability

## Goal
Introduce and enforce shared, game-data-driven contracts required by all 12 FITL special activities:
- SA execution has no added Resource cost.
- SA legality is constrained by which Operation it accompanies.
- Constraints are encoded in GameSpecDoc data and enforced by generic compiler/runtime flow.

## Scope
- Add action-pipeline metadata support for accompanying-operation constraints (for example `accompanyingOps: 'any' | string[]`).
- Compile and validate the metadata through generic CNL/compiler/schema paths.
- Enforce accompanying-op constraints during move validation and move application for compound operation+SA moves (`move.compound` path).
- Remove FITL SA resource-cost assumptions from production data and tests so SAs are truly zero-cost.

## Reassessed assumptions (2026-02-14)
- `accompanyingOps` is not currently present in `GameSpecDoc`, compiler lowering, runtime pipeline types, validators, or JSON schema artifacts.
- Existing FITL SA integration tests (`fitl-us-arvn-special-activities`, `fitl-nva-vc-special-activities`) currently assert non-zero SA resource spend and cost-validation failures; these assumptions conflict with Spec 27 Rule 4.1.
- Current compound SA execution (`move.compound`) applies SA timing but does not enforce an operation/SA compatibility contract.
- The prior acceptance command `npm run test:unit -- --testNamePattern=...` is Jest-style; this repository uses Node test runner (`node --test`) and should use direct test file invocations.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/kernel/types-operations.ts`
- `src/kernel/schemas-extensions.ts`
- `src/cnl/validate-extensions.ts`
- `src/cnl/compile-operations.ts`
- `src/kernel/apply-move.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/json-schema.test.ts`
- `test/unit/apply-move.test.ts`
- `data/games/fire-in-the-lake.md`
- `schemas/GameDef.schema.json`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`

## Out of scope
- Implementing the per-SA board effects (piece movement/removal/support shifts).
- Monsoon-specific SA behavior.
- Non-player SA decision logic.
- Capability/momentum modifiers.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/validate-spec.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/unit/json-schema.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`

## Invariants that must remain true
- Runtime/compiler remain game-agnostic; no FITL-specific branch logic in kernel code.
- SA accompanying-operation constraints are data-driven and reusable by any game.
- SA cost behavior remains data-driven (this ticket sets FITL SA stubs to zero-cost; it does not change global defaults for non-FITL content).
- If multiple pipelines share an action id, applicability/dispatch determinism remains unchanged.
- Existing turn-flow option-matrix semantics (`operationPlusSpecialActivity`) remain intact.

## Outcome
- **Completion date**: 2026-02-14
- **What changed**:
  - Added shared `accompanyingOps` action-pipeline metadata (`'any' | string[]`) to GameSpecDoc/runtime types, validator/compiler lowering, runtime zod schema, and JSON schema artifact.
  - Enforced operation+special-activity compatibility in runtime move validation/application for compound moves via pipeline metadata.
  - Updated FITL production SA stub profiles to zero-cost (`costEffects: []`), removed SA resource gating, and encoded accompanying operation constraints per Spec 27.
  - Updated unit/integration tests to cover `accompanyingOps` contracts, zero-cost SA behavior, and accompanying-op rejection/allow flows.
- **Deviations from original plan**:
  - Enforcement was implemented in `apply-move` validation/application path (compound move validation) rather than `legal-moves` enumeration, because legal move enumeration does not materialize specific operation+SA pairings.
  - Acceptance commands were corrected from Jest-style filtering to direct Node test file invocations.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/validate-spec.test.js` passed.
  - `node --test dist/test/unit/compile-top-level.test.js` passed.
  - `node --test dist/test/unit/json-schema.test.js` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js` passed.
  - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js` passed.
  - `npm run lint` passed.
