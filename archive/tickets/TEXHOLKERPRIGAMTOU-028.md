# TEXHOLKERPRIGAMTOU-028: Legality Surface Parity Hardening + Runtime Smoke Harness API Refinement

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-025
**Blocks**: none

## 0) Reassessed assumptions and corrected scope

Current codebase baseline (verified in this ticket pass):
1. Parity tests between legality surfaces already exist (`test/unit/kernel/legality-surface-parity.test.ts`), but coverage is mostly legality outcome projection and selector contract projection.
2. Runtime smoke harness already exists (`test/helpers/runtime-smoke-harness.ts`) and is already used by both Texas and non-Texas integration suites.
3. Harness policy API previously required policy authors to manually return/forward RNG (`selectMove -> { moveIndex, rng }`), which was error-prone and coupled policy logic to RNG plumbing.
4. Shared helpers specifically for decision-progression parity diagnostics (surface + step + action context) were not centralized.

Scope correction applied:
1. This ticket was executed as an architectural hardening/refactor of existing test infrastructure, not a greenfield harness build.
2. Changes remained test-layer-only; no game-specific kernel branches were introduced.
3. Work focused on cleaner API boundaries and deterministic diagnostics.

Architecture intent:
1. Harness-managed RNG progression as the default contract.
2. Optional advanced policy-state hook for deterministic policy-local state without mandatory RNG threading.
3. Shared parity helper(s) that emit actionable divergence context: surface, step, and action.

## 1) What needs to change / be added

1. Expand legality-surface parity verification to include decision-progression matrix cases for binding-sensitive and control-flow-heavy effects.
2. Add shared parity fixtures/helpers so new effect features can opt into parity checks with low boilerplate.
3. Refine runtime smoke harness policy API to reduce misuse risk:
- harness-managed RNG progression by default (policies should not have to pass RNG through in the common case)
- optional advanced policy state hook for deterministic policy-local state
4. Update existing Texas and non-Texas smoke suites to the refined harness API (no duplicate harness logic in tests).
5. Add failure diagnostics that pinpoint surface + step + action context when parity diverges.

## 2) Invariants that should pass

1. `legalMoves`, `legalChoices`, and `applyMove` agree on decision progression legality for equivalent inputs.
2. Divergences fail with deterministic repro context (surface, step, actionId, decisionId/name where applicable).
3. Smoke harness policy behavior remains deterministic while reducing API misuse risk.
4. New games can onboard parity/smoke checks with shared test helpers instead of bespoke loops.
5. Kernel/compiler remain game-agnostic and free of test-specific policy logic.

## 3) Tests that should pass

1. Unit: expanded legality-surface parity matrix covering binding export/import and nested control-flow decision progression.
2. Unit: parity helper negative test proving divergence diagnostics include surface + step + action context.
3. Unit/Integration: harness API tests for default RNG management and optional policy state hook behavior.
4. Integration: existing Texas and non-Texas smoke suites pass using refined harness API.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
1. Added shared parity helper `test/helpers/legality-surface-parity-helpers.ts` with deterministic surface divergence diagnostics.
2. Expanded `test/unit/kernel/legality-surface-parity.test.ts` with binding/control-flow decision progression matrix cases and a negative diagnostic fixture.
3. Refined smoke harness API in `test/helpers/runtime-smoke-harness.ts` to harness-managed RNG (`drawInt`) and optional policy state hooks (`initPolicyState` / `advancePolicyState`).
4. Added smoke harness API coverage in `test/integration/runtime-smoke-harness.test.ts` for RNG progression semantics and deterministic policy-local state.

- Deviations from original plan:
1. Existing Texas and non-Texas smoke suites already used shared harness infrastructure, so this was executed as API refactor + coverage strengthening rather than creating new base smoke infrastructure.
2. Diagnostic parity negative coverage was implemented with an injectable probe in the shared helper to produce deterministic divergence assertions.

- Verification results:
1. `npm run build` passed.
2. `npm test` passed.
3. `npm run lint` passed.
