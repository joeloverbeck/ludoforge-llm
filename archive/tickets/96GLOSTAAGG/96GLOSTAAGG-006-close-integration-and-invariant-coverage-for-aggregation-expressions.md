# 96GLOSTAAGG-006: Close integration and invariant coverage for aggregation expressions

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — tests only unless coverage exposes a real implementation defect
**Deps**: 96GLOSTAAGG-003, 96GLOSTAAGG-004, 96GLOSTAAGG-005, [packages/engine/test/helpers/production-spec-helpers.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/helpers/production-spec-helpers.ts)

## Problem

Spec 96 aggregation expressions are already implemented in engine source and already have unit/schema coverage. The missing proof is narrower: we still need realistic FITL-derived integration coverage for authored agent policy usage and at least one invariant-oriented test lane that exercises the aggregators beyond hand-picked unit fixtures. The ticket must therefore validate the current implementation against the real codebase rather than assume the feature is still awaiting engine work.

## Assumption Reassessment (2026-03-30)

1. The implementation is already present in engine source:
   - [packages/engine/src/agents/policy-evaluation-core.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/policy-evaluation-core.ts)
   - [packages/engine/src/agents/policy-expr.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/policy-expr.ts)
   - [packages/engine/schemas/GameDef.schema.json](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/schemas/GameDef.schema.json)
2. Unit coverage already exists for compilation and evaluation:
   - [packages/engine/test/unit/agents/policy-expr.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/agents/policy-expr.test.ts)
   - [packages/engine/test/unit/agents/policy-eval.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/agents/policy-eval.test.ts)
   - [packages/engine/test/unit/schemas-top-level.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/schemas-top-level.test.ts)
3. `fitl-policy-catalog.golden.json` and `texas-policy-catalog.golden.json` already exist and are already checked by [packages/engine/test/unit/policy-production-golden.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/policy-production-golden.test.ts).
4. Current production FITL and Texas authoring do not use `globalTokenAgg`, `globalZoneAgg`, or `adjacentTokenAgg`, so golden fixtures should only change if this ticket intentionally changes authored production agent content. Merely having the implementation in place does not require golden churn.
5. [packages/engine/test/integration/fitl-policy-agent.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-policy-agent.test.ts) is still the right home for FITL-derived end-to-end policy behavior tests.
6. FITL production compilation is still routed through `compileProductionSpec()`, but the clean architecture for this ticket is to compile a FITL-derived test document through the normal authoring path rather than mutate compiled runtime catalogs after the fact.
7. The spec examples imply seat-like token filter values such as `seat: { eq: us }`, but FITL runtime token props store numeric `PlayerId`s. Integration tests must therefore use `self`/`active` resolution or explicit runtime ids where appropriate; literal seat-id strings are not a valid FITL runtime ownership match today.

## Architecture Check

1. The current architecture is directionally correct and more robust than adding aliases or special-case helpers. The aggregation operators are generic compiler/runtime constructs, not FITL-specific branches, which matches Foundations #1, #8, and #10.
2. The best remaining validation is FITL-derived authoring compiled through the normal policy pipeline. That proves the authored DSL shape, compiler lowering, schema contract, and runtime evaluation together.
3. Post-compile catalog mutation would be a weaker test architecture because it bypasses the authoring/compiler surface that Spec 96 introduced. Use it only if a compiler-path test is impossible. It is not needed here.
4. Golden fixtures remain valuable, but only as regression checks for actual production authoring. Regenerating unchanged goldens adds noise without architectural benefit.
5. A separate invariant-oriented test file is cleaner than overloading `policy-determinism.test.ts` with aggregation semantics. Aggregation invariants are a distinct concern.

## What to Change

### 1. Add FITL-derived integration tests to `fitl-policy-agent.test.ts`

Test scenarios:
- Recompile a FITL-derived test document whose `agents:` section authors `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` through the normal compiler path.
- Evaluate authored aggregation-backed state features against real FITL game state (or targeted mutations of real FITL state) and verify results against manual counts/sums.
- Add a conditional scoreTerm test that uses an authored aggregation feature to switch between `rally` and `tax` when both are legal for VC in a real FITL turn state.

### 2. Verify, but do not churn, production goldens

- Run [packages/engine/test/unit/policy-production-golden.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/policy-production-golden.test.ts).
- Only regenerate [packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json) or [packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json) if this ticket intentionally changes maintained production agent authoring.

### 3. Add a dedicated aggregation invariant test file

In a new property-oriented test file:
- `globalTokenAgg` count with no filter equals a manual board-zone token count across generated states.
- `adjacentTokenAgg` count for a given anchor/filter is never greater than the equivalent `globalTokenAgg` count.
- Empty-state aggregation semantics remain stable for the supported zero-producing cases used by the runtime contract.

### 4. Use FITL state overlays, not fake game models

- Start from compiled FITL production definitions and real FITL initial/advanced states.
- Apply minimal, explicit state overlays in-test to create known counts and thresholds.
- Keep the engine/runtime under test generic; only the fixture data is FITL-specific.

## Files to Touch

- [packages/engine/test/integration/fitl-policy-agent.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-policy-agent.test.ts) — add FITL-derived authoring/integration coverage
- [packages/engine/test/unit/property/policy-aggregation.property.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/property/policy-aggregation.property.test.ts) — new invariant coverage
- [tickets/96GLOSTAAGG-006.md](/home/joeloverbeck/projects/ludoforge-llm/tickets/96GLOSTAAGG-006.md) — corrected scope and assumptions

Conditional only if production authoring changes:
- [packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json)
- [packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json)

## Out of Scope

- Modifying maintained FITL or Texas production authoring to add real aggregation-driven behavior
- Runner package changes
- Schema JSON changes unless a real contract defect is discovered
- Performance benchmarking
- Refactoring working aggregation implementation without evidence of a design defect

## Acceptance Criteria

### Tests That Must Pass

1. Integration: a FITL-derived authored `agents:` document using `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` compiles without parser/validator/compiler errors.
2. Integration: authored `globalTokenAgg` evaluation matches a manual FITL board-token count at a known overlaid state.
3. Integration: authored `globalZoneAgg` evaluation matches a manual FITL province-variable sum at a known overlaid state.
4. Integration: authored `adjacentTokenAgg` evaluation matches a manual FITL adjacency-based token count at a known overlaid state.
5. Integration: an authored conditional scoreTerm switches candidate preference at the intended aggregation threshold in a real FITL VC decision state.
6. Golden verification: [packages/engine/test/unit/policy-production-golden.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/policy-production-golden.test.ts) passes. Goldens remain unchanged unless production authoring changed intentionally.
7. Property/invariant: `globalTokenAgg` count with no filter matches manual board counts across generated states.
8. Property/invariant: `adjacentTokenAgg` never exceeds the equivalent global count for the same token filter.
9. Relevant suites pass, including engine tests that cover the new integration/property coverage.

### Invariants

1. Integration tests prove the authored compiler path, not just post-compile runtime mutation.
2. FITL-derived tests use real FITL definitions and state shapes, not an invented substitute game.
3. Property tests stay game-agnostic even if the integration tests are FITL-derived.
4. Do not modify engine implementation unless the new coverage reveals a real defect.

## Test Plan

### New/Modified Tests

1. [packages/engine/test/integration/fitl-policy-agent.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-policy-agent.test.ts)
   - FITL-derived compilation and runtime assertions for all three aggregators
   - conditional scoreTerm threshold behavior in a real VC decision state
2. [packages/engine/test/unit/property/policy-aggregation.property.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/property/policy-aggregation.property.test.ts)
   - board-count equivalence and adjacency-subset invariants
3. [packages/engine/test/unit/policy-production-golden.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/policy-production-golden.test.ts)
   - verify production catalogs remain stable

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "aggregation|FITL policy agent integration|policy production golden"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-30
- What changed:
  - Added FITL-derived integration coverage in [packages/engine/test/integration/fitl-policy-agent.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-policy-agent.test.ts) for authored `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` expressions compiled through the normal policy authoring path.
  - Added a real VC decision-state threshold test proving aggregation-driven `when` gating can switch preference between `rally` and `tax`.
  - Added invariant coverage in [packages/engine/test/unit/property/policy-aggregation.property.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/property/policy-aggregation.property.test.ts).
  - Corrected this ticket’s assumptions and scope to reflect that the runtime/compiler/schema work was already implemented before this ticket.
- Deviations from original plan:
  - No engine implementation changes were needed; the missing work was test coverage.
  - Production FITL/Texas policy goldens were verified but not regenerated because production authoring does not yet use the new aggregation expressions.
  - Property coverage was added in a new dedicated file instead of overloading `policy-determinism.test.ts`.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js dist/test/unit/property/policy-aggregation.property.test.js dist/test/unit/policy-production-golden.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
