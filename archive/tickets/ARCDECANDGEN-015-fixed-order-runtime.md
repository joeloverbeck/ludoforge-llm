# ARCDECANDGEN-015: Fixed Order Runtime on `turnOrder`

**Status**: ✅ COMPLETED
**Phase**: 5B (Generalized Turn Order Strategy)
**Priority**: P2
**Complexity**: M
**Dependencies**: ARCDECANDGEN-014

## Goal

Reassess assumptions against the real codebase, then complete fixed-order runtime behavior on top of the `turnOrder` architecture from Spec 32 without compatibility aliases.

## Assumption Reassessment (February 13, 2026)

- `turnOrder` and `turnOrderState` are now present in kernel/compiler/types/schema.
- Legacy `turnStructure.activePlayerOrder` is rejected at validation (`turnStructure.activePlayerOrder is no longer supported`).
- Compiler now supports `turnOrder.type: fixedOrder` and emits fixed-order diagnostics (`CNL_COMPILER_FIXED_ORDER_EMPTY`, `CNL_COMPILER_FIXED_ORDER_DUPLICATE`).
- Runtime advancement uses `def.turnOrder` (`roundRobin`, `fixedOrder`, `cardDriven`, `simultaneous` placeholder path).
- Card-driven runtime state is nested under `state.turnOrderState.type === 'cardDriven'`.

## Architecture Assessment

The new architecture is more beneficial than the previous split model:
- one explicit sequencing contract (`turnOrder`) instead of mixed `turnStructure` + FITL-specific top-levels,
- discriminated runtime state (`turnOrderState`) enabling exhaustive dispatch,
- fixed order, card-driven, and round-robin are represented as data, not hardcoded branching conventions.

This is cleaner, more robust, and more extensible for long-term GameSpecDoc goals.

## Updated Scope (Executed)

- Implement and harden fixed-order sequencing through the `turnOrder` model.
- Migrate compiler/parser/schema/tests/fixtures from legacy top-level `turnFlow`/`coupPlan` to `turnOrder`-based contracts.
- Update runtime state serialization/schema (`turnOrderState`) and golden fixtures.
- Keep `simultaneous` runtime as explicitly partial (warning path preserved) rather than introducing fragile pseudo-support.

## File List (Actual Changes)

### Runtime and types
- `src/kernel/types-core.ts`
- `src/kernel/types-turn-flow.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/phase-advance.ts`
- `src/kernel/legal-moves-turn-order.ts`
- `src/kernel/turn-flow-lifecycle.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/terminal.ts`

### Compiler/validation/schema
- `src/cnl/compile-turn-flow.ts`
- `src/cnl/game-spec-doc.ts`
- `src/cnl/parser.ts`
- `src/cnl/validate-actions.ts`
- `src/cnl/validate-extensions.ts`
- `src/cnl/cross-validate.ts`
- `schemas/GameDef.schema.json`
- `schemas/Trace.schema.json`

### Tests/fixtures
- Added: `test/helpers/turn-order-helpers.ts`
- Updated broad unit/integration suites and goldens/fixtures to `turnOrder` + `turnOrderState`.

## Ideal Architecture Next (Post-015)

To move this subsystem closer to the long-term “any game spec playable” target:

1. Complete `simultaneous` runtime semantics end-to-end (submission model, commit/resolve boundary, deterministic tie policy, trace contract).
2. Decouple card-driven naming from FITL semantics by introducing a generic turn-order pipeline model (card-driven as one strategy implementation, not the default extension namespace).
3. Replace numeric string parsing in fixed-order resolution with canonical player identifiers owned by metadata/type system.
4. Add explicit strategy plugin boundary in compiler/runtime (`turnOrder.type` → strategy module) so new game families add data + strategy modules without touching unrelated kernel paths.
5. Add strategy conformance tests (shared invariant suite per strategy: initial state, boundary advance, terminal ordering, serialization roundtrip).

## Out of Scope

- Full generic replacement of current `turnFlow` naming inside `cardDriven` config.
- Full simultaneous strategy runtime and legal-move resolution.

## Outcome

- Completion date: February 13, 2026
- What was actually changed:
  - Corrected ticket assumptions to match implemented architecture.
  - Completed fixed-order behavior within `turnOrder` runtime and aligned compiler/parser/schema.
  - Migrated tests/fixtures/goldens to `turnOrder`/`turnOrderState`.
- Deviations from the original plan:
  - Work exceeded “reassessment-only” scope because the architecture migration had already advanced and required full consistency fixes.
  - Kept simultaneous strategy intentionally partial with warning instead of shipping incomplete semantics.
- Verification results:
  - `npm test` passed (142/142).
  - `npm run test:all` passed (142/142).
