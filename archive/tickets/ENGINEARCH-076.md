# ENGINEARCH-076: Unify compound/pipeline preflight to remove duplicated kernel validation paths

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel `apply-move.ts` preflight structure + unit regression tests
**Deps**: ENGINEARCH-072 (archived)

## Problem

`apply-move.ts` currently resolves pipeline dispatch and compound timing validity in both `validateMove` and `executeMoveAction`. The duplicate path exists to support `skipValidation` execution flows, but duplicated dispatch/validation logic increases drift risk (future edits can diverge between validation-time and execution-time behavior).

This is an architectural cleanliness issue in core engine flow: one conceptual preflight is represented twice.

## Assumption Reassessment (2026-02-26)

1. `validateMove` currently performs more than legality checks:
   - action lookup
   - executor resolution
   - pipeline dispatch/profile derivation
   - compound timing validation
   - special-activity accompanying-op and compound-param constraints
   - pipeline viability checks
2. `executeMoveAction` recomputes overlapping preflight responsibilities (executor/pipeline/compound/special-activity/pipeline viability) instead of consuming one resolved preflight artifact.
3. `applyMoveCore` intentionally supports `skipValidation: true` (simultaneous commit fan-in), so execution must still enforce the same invariants.
4. Existing tests already cover many compound timing cases in `packages/engine/test/unit/kernel/apply-move.test.ts`, but they do not explicitly assert invariant parity across normal validated execution vs simultaneous commit (`skipValidation`) for drift-prone compound/pipeline preflight behavior.
5. Additional mismatch: simultaneous submissions reject compound payloads before commit, so skip-validation parity coverage can only be asserted for pipeline/preflight invariants in that path.
6. Correction: this ticket should unify preflight derivation into one authoritative helper/result object and add explicit skip-validation parity tests for pipeline invariants (while keeping compound invariants in the same shared preflight helper for non-simultaneous execution and future internal skip-validation callers).

## Architecture Check

1. A single preflight resolver reduces cognitive load and prevents accidental divergence in legality/execution semantics.
2. The refactor is game-agnostic kernel architecture; it does not encode game-specific behavior.
3. No compatibility shims/aliasing: strict behavior is preserved while internals are simplified.
4. Benefit over current architecture: a typed preflight contract lowers long-term maintenance risk because all invariant-sensitive logic is edited in one place instead of mirrored code branches.

## What to Change

### 1. Introduce a shared move preflight resolver

Create an internal helper (or small struct) in `apply-move.ts` that returns:
- resolved action
- execution player
- pipeline dispatch status
- matched action pipeline/derived execution profile (when matched)
- prebuilt bindings/eval context fields needed by validation and execution

The helper must enforce shared preflight invariants (compound timing + special-activity constraints) so both validation and `skipValidation` execution reuse the same enforcement path.

### 2. Rewire `validateMove` and `executeMoveAction`

- `validateMove` should consume the shared preflight data instead of recomputing overlapping pieces.
- `executeMoveAction` should consume the same preflight output when available and not re-derive overlapping preflight state.
- Ensure `skipValidation: true` paths still enforce compound/pipeline invariants through the same shared helper.

### 3. Add regression coverage for drift-prone paths

Add tests that exercise both normal and `skipValidation`-driven execution behavior (simultaneous commit fan-in) to prove invariant parity for pipeline preflight failures.
Compound timing coverage remains in direct execution/unit tests because simultaneous submission explicitly disallows compound moves.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)

## Out of Scope

- Changes to compound move feature semantics
- New runtime reason codes beyond existing taxonomy

## Acceptance Criteria

### Tests That Must Pass

1. Pipeline preflight invariants behave identically in standard validated execution and simultaneous commit skip-validation execution contexts.
2. Compound timing invariants continue to be enforced for normal execution paths through the shared preflight helper.
3. No behavior regression for existing operation pipeline legality/cost preflight checks.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pipeline/compound preflight has one authoritative implementation path.
2. `skipValidation` cannot bypass pipeline preflight constraints in simultaneous commit fan-in.
3. Compound timing constraints remain enforced via the shared preflight helper for normal execution paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — parity assertions that the same invariant failures occur in:
   - direct validated execution
   - simultaneous commit path that internally uses `skipValidation: true` (pipeline invariants)

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Refactored `packages/engine/src/kernel/apply-move.ts` to centralize preflight derivation and invariant checks in a shared resolver consumed by both `validateMove` and `executeMoveAction`.
  - Added explicit preflight-mode handling (`validation` vs `execution`) so simultaneous commit `skipValidation` keeps prior execution semantics while still sharing invariant enforcement logic.
  - Added regression coverage in `packages/engine/test/unit/kernel/apply-move.test.ts` for pipeline-invariant parity between direct validated execution and simultaneous commit fan-in.
- **Deviations from original plan**:
  - Scope was narrowed for skip-validation parity: simultaneous submission forbids compound payloads, so parity in that path is asserted for pipeline invariants (compound timing remains covered in direct execution tests).
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"` passed.
  - `pnpm -F @ludoforge/engine test` passed.
