# FITLSPEACTFULEFF-001 - Shared SA Contracts: Zero Cost and Accompanying-Op Constraints

**Status**: TODO  
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
- Enforce accompanying-op constraints at legal-move/apply-move time for `operationPlusSpecialActivity` class.
- Remove FITL SA resource-cost assumptions from production data and tests so SAs are truly zero-cost.

## File list it expects to touch
- `src/cnl/game-spec-doc.ts`
- `src/kernel/types-operations.ts`
- `src/kernel/schemas-extensions.ts`
- `src/cnl/validate-extensions.ts`
- `src/cnl/compile-operations.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/apply-move.ts`
- `test/unit/validate-spec.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/json-schema.test.ts`
- `test/unit/legal-moves.test.ts`
- `data/games/fire-in-the-lake.md`

## Out of scope
- Implementing the per-SA board effects (piece movement/removal/support shifts).
- Monsoon-specific SA behavior.
- Non-player SA decision logic.
- Capability/momentum modifiers.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `npm run test:unit -- --testNamePattern="validate-spec|compile-top-level|json-schema|legal-moves"`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`

## Invariants that must remain true
- Runtime/compiler remain game-agnostic; no FITL-specific branch logic in kernel code.
- SA cost behavior is data-driven and defaults to zero unless explicitly encoded otherwise.
- If multiple pipelines share an action id, applicability/dispatch determinism remains unchanged.
- Existing turn-flow option-matrix semantics (`operationPlusSpecialActivity`) remain intact.

