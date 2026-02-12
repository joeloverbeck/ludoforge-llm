# FITLMECHINF-006 - Joint Operation Cost Constraint

**Status**: COMPLETED
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Task 25.5)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B)
**Depends on**: `FITLMECHINF-002` (Total Econ computation)

## Goal

Ensure the Joint Operations cost constraint (Rule 1.8.1) is expressible and enforceable: US operations spend ARVN Resources but cannot reduce them below Total Econ. Validate that the existing `costValidation` mechanism in `OperationProfileDef` supports this constraint, and add integration tests proving it works.

## Rationale

The US faction doesn't track its own Resources — it spends ARVN Resources. But spending is capped: `ARVN_Resources - cost >= Total_Econ`. This maps to the existing `costValidation` condition in `OperationProfileDef` (apply-move.ts:89). The condition evaluates `ARVN_Resources - operationCost >= Total_Econ` before allowing cost spend. When validation fails and `partialExecution.mode === 'forbid'`, the operation is blocked. This ticket verifies the mechanism works end-to-end and adds comprehensive tests.

## Scope

### Changes

1. **Verify `costValidation` expressiveness**: Confirm that the existing `ConditionAST` can express `ARVN_Resources - cost >= Total_Econ` using `ValueExpr` arithmetic and `Reference` nodes. If any gap exists (e.g., no way to reference Total Econ as a value expression), extend `ValueExpr` or add a `derivedValue` reference type.

2. **Integration test** (`test/integration/fitl-joint-operations.test.ts`): Build a synthetic GameDef with:
   - ARVN Resources as a per-player variable
   - Total Econ computable from the board state
   - A US operation with `costValidation` condition expressing the constraint
   - Test cases: spend allowed (above Total Econ), spend exactly to Total Econ (passes), spend below Total Econ (blocked), non-US faction unaffected

3. **Free operation interaction**: Verify that free operations (FITLMECHINF-005) bypass the joint operation constraint entirely since they skip all cost spending.

## File List

- `test/integration/fitl-joint-operations.test.ts` — New integration test file
- `src/kernel/types.ts` — Only if `ValueExpr` needs a `derivedValue` reference (likely not needed)
- `src/kernel/eval-value.ts` — Only if a new reference type is added

## Out of Scope

- FITL-specific US operation profile data encoding (Spec 26)
- Individual operation definitions (Spec 26–27)
- Event card effects (Spec 29)
- Stacking enforcement (FITLMECHINF-003/004)
- Derived value computation implementation (FITLMECHINF-002 — this ticket only uses it)
- Changes to `apply-move.ts` core logic (the mechanism already exists)

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/integration/fitl-joint-operations.test.ts`:
  - US operation with ARVN Resources=20, cost=5, Total Econ=10 → allowed (20-5=15 >= 10)
  - US operation with ARVN Resources=15, cost=5, Total Econ=10 → allowed (15-5=10 >= 10, exactly at boundary)
  - US operation with ARVN Resources=14, cost=5, Total Econ=10 → blocked (14-5=9 < 10)
  - Non-US faction operation with same cost structure → allowed (constraint doesn't apply)
  - Free operation → cost not spent, constraint irrelevant
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- No changes to `applyMove` core logic — the `costValidation` mechanism already handles this
- The constraint is expressed purely in data (ConditionAST in `OperationProfileDef.cost.validate`) — no hardcoded US faction logic in kernel code
- Existing non-FITL GameDefs without `costValidation` are unaffected
- `partialExecution.mode === 'forbid'` behavior unchanged: validation failure blocks the operation
- `partialExecution.mode === 'allow'` behavior unchanged: validation failure skips cost but allows resolution

## Outcome

**Completed**: 2026-02-12

**What was done**:
- Verified that existing `ValueExpr` arithmetic (`+`, `-`, `*`) with `pvar` references (explicit player ID) and `gvar` references can express `ARVN_Resources - cost >= Total_Econ` — no type extensions needed
- Created test fixture `test/fixtures/cnl/compiler/fitl-joint-operations.md` with synthetic 2-player game (US=player 0, ARVN=player 1), per-player `resources` variable, global `totalEcon`, and two operation profiles demonstrating cross-player cost validation
- Created integration test `test/integration/fitl-joint-operations.test.ts` with 6 tests covering: compilation, allowed spend, boundary spend, blocked spend, non-US faction unaffected, and free operation bypass

**Deviations**: None. No kernel or type changes were required — the existing `costValidation` mechanism in `apply-move.ts` already supports the joint operation constraint purely through data (ConditionAST).

**Verification**: `npm run build` passes, all 821 tests pass (including 6 new)
