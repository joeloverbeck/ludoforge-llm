# FITLSEC3RULGAP-002: ARVN Sweep/Assault Affordability Clamp

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes - value-expression architecture extension (`min`/`max`) + data/tests
**Deps**: FITLSEC3RULGAP-001, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

ARVN Sweep/Assault currently allow selecting more spaces than ARVN can afford in non-LimOp paths. Rule 3.0 requires affordability across selected spaces.

## Assumption Reassessment (2026-02-24)

1. `sweep-arvn-profile` and `assault-arvn-profile` in `data/games/fire-in-the-lake/30-rules-actions.md` still use `chooseN.max: 99` in non-LimOp default branches and `max: 2` in shaded capability branches (`cap_caps`, `cap_abrams`) without affordability composition.
2. `packages/engine/test/integration/fitl-coin-operations.test.ts` contains explicit structural expectations that ARVN Sweep and ARVN Assault normal branches preserve `max: 99`.
3. `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` also assumes shaded capability branches use `max: 2` with an inner fallback preserving `max: 99`, for both US and ARVN profiles.
4. `packages/engine/test/integration/fitl-us-arvn-resource-spend-constraint.test.ts` does not cover ARVN Sweep/Assault select-space `chooseN.max` affordability; it covers shared US-to-ARVN spend predicates.
5. `mom_bodyCount` currently provides ARVN Assault free-op semantics (eligibility at 0 resources + per-space spend guard bypass) and must remain intact.

## Architecture Check

1. Affordability belongs in GameSpecDoc selection bounds (`chooseN.max`) and should stay data-defined, not kernel-special-cased.
2. Per-space spend effects in `resolve-per-space` remain authoritative for resource deduction; selection caps prevent illegal over-selection at decision time.
3. Capability limits and affordability should compose declaratively via expression-valued max (`min(capLimit, affordabilityLimit)`), which is cleaner and more extensible than adding profile-specific branching or aliases.
4. No backward-compatibility alias layer should be introduced; tests should align with the target architecture.

## What to Change

### 1. Clamp ARVN Sweep select-spaces max by resources

1. Replace normal-branch unlimited cap with `floorDiv(arvnResources, 3)`.
2. In `cap_caps` shaded branch, cap to `min(2, floorDiv(arvnResources, 3))`.
3. Keep LimOp branch `max: 1` unchanged.

### 2. Clamp ARVN Assault select-spaces max by resources

1. Keep `mom_bodyCount` branch effectively uncapped (free).
2. Non-Body-Count branch capped by `floorDiv(arvnResources, 3)`.
3. In `cap_abrams` shaded branch, cap to `min(2, floorDiv(arvnResources, 3))` when not free.

### 3. Update assertions and add runtime affordability tests

1. Remove/replace hard-coded `max: 99` expectations where ARVN Sweep/Assault are inspected.
2. Update capability-branch assertions to validate min-composition with affordability for ARVN branches.
3. Add runtime tests for resource-driven ARVN Sweep/Assault space-count limits and `mom_bodyCount` bypass behavior.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` (modify)
- `packages/engine/test/integration/fitl-us-arvn-resource-spend-constraint.test.ts` (optional, only if wiring assertions become relevant)
- `packages/engine/test/integration/fitl-arvn-operation-affordability.test.ts` (new)

## Out of Scope

- US Sweep/Assault behavior changes.
- Insurgent (NVA/VC) Rally/March/Attack/Terror affordability work.
- Any game-specific logic in kernel/compiler (engine changes must remain game-agnostic).

## Acceptance Criteria

### Tests That Must Pass

1. ARVN Sweep affordability runtime checks:
   - 6 resources permits max 2 spaces.
   - 3 resources permits max 1 space.
   - 9 resources permits max 3 spaces.
2. ARVN Assault affordability runtime checks:
   - `mom_bodyCount=true` bypasses affordability cap.
   - `mom_bodyCount=false` caps by `floorDiv(arvnResources,3)`.
3. Capability composition checks:
   - `cap_caps` shaded path respects `min(2, affordability)` for ARVN Sweep.
   - `cap_abrams` shaded path respects `min(2, affordability)` for ARVN Assault when not free.
4. LimOp checks remain enforced at max 1.
5. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
6. `pnpm -F @ludoforge/engine test -- fitl-capabilities-sweep-assault-airstrike.test.ts`
7. `pnpm -F @ludoforge/engine test -- fitl-arvn-operation-affordability.test.ts`
8. `pnpm -F @ludoforge/engine test`
9. `pnpm turbo lint`

### Invariants

1. ARVN per-space spend in resolve stages remains intact (no double-charge/no skipped charge in non-free paths).
2. `mom_bodyCount` semantics remain unchanged outside selection cap logic.
3. Engine changes remain generic (no FITL-specific branching/aliasing in `packages/engine/src/**`).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` - update ARVN Sweep/Assault select-space assertions.
2. `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` - update ARVN capability-branch cap assertions to min-composition semantics.
3. `packages/engine/test/integration/fitl-arvn-operation-affordability.test.ts` - add explicit runtime affordability coverage for ARVN Sweep/Assault.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-sweep-assault-airstrike.test.ts`
4. `pnpm -F @ludoforge/engine test -- fitl-arvn-operation-affordability.test.ts`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-24
- Actual changes:
  - Updated ARVN Sweep/Assault select-space caps in `data/games/fire-in-the-lake/30-rules-actions.md` to enforce affordability from `arvnResources`, preserve LimOp `max: 1`, and preserve `mom_bodyCount` bypass for ARVN Assault.
  - Extended the game-agnostic value-expression architecture to support native arithmetic `min`/`max` in AST types, schemas, compiler lowering, and runtime evaluator (`packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/cnl/compile-conditions.ts`, `packages/engine/src/kernel/eval-value.ts`).
  - Updated engine unit coverage for new value-expression operators in `packages/engine/test/unit/schemas-ast.test.ts`, `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/eval-value.test.ts`, and `packages/engine/test/unit/type-inference.test.ts`.
  - Regenerated schema artifacts in `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/Trace.schema.json`, and `packages/engine/schemas/EvalReport.schema.json`.
  - Updated structural assertions in `packages/engine/test/integration/fitl-coin-operations.test.ts` and `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` to validate affordability-aware expression caps.
  - Added runtime affordability coverage in `packages/engine/test/integration/fitl-arvn-operation-affordability.test.ts`.
  - Updated `packages/engine/test/integration/fitl-limited-ops.test.ts` LimOp contract checks so expression-valued normal-operation caps are treated as valid (not only numeric constants).
- Deviations from original plan:
  - None. The architecture was improved to support the intended declarative `min(2, floorDiv(...))` expression natively, and data definitions now use that form directly.
  - `pnpm -F @ludoforge/engine test -- <file>` executes the full engine suite by script wiring; targeted verification was executed with direct `node --test` against built `dist` files.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-coin-operations.test.js` passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-capabilities-sweep-assault-airstrike.test.js` passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-arvn-operation-affordability.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm turbo lint` passed.
