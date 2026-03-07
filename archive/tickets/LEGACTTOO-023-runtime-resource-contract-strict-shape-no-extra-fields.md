# LEGACTTOO-023: Runtime Resource Contract Strict Shape (No Extra Fields)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — eval runtime resource boundary validation and runtime contract tests
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-020-canonical-token-state-index-for-kernel-lookups.md

## Problem

After removing `QueryRuntimeCache`, the runtime resource contract accepts extra unknown fields. This silently tolerates legacy/back-compat payloads and weakens fail-fast guarantees at the kernel boundary.

## Assumption Reassessment (2026-03-07)

1. `EvalRuntimeResources` now only declares `collector`. **Confirmed in `packages/engine/src/kernel/eval-context.ts`.**
2. Runtime contract guard validates `collector` shape but does not reject unknown keys. **Confirmed in `packages/engine/src/kernel/eval-runtime-resources-contract.ts`.**
3. Current tests explicitly allow extra fields (legacy `queryRuntimeCache`) at the contract level. **Confirmed in `packages/engine/test/unit/eval-runtime-resources-contract.test.ts` and `packages/engine/test/unit/trigger-dispatch.test.ts`.**
4. Additional malformed-resource tests still include legacy `queryRuntimeCache` payloads even when extra keys are not required for the assertion. **Confirmed in `packages/engine/test/unit/boundary-expiry.test.ts`, `packages/engine/test/unit/kernel/action-executor.test.ts`, `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts`, and `packages/engine/test/unit/kernel/action-actor.test.ts`.**

## Architecture Check

1. Strict exact-shape validation is cleaner and more robust than permissive unknown-field acceptance because boundary contracts become deterministic and enforceable.
2. This is fully game-agnostic infrastructure policy (no GameSpecDoc or visual-config coupling).
3. No backwards-compatibility aliasing: legacy resource keys are rejected.

## What to Change

### 1. Enforce exact `EvalRuntimeResources` shape

- Update runtime contract validation to fail when unknown top-level resource keys are present.
- Keep collector sub-contract strict as today (`warnings` array, `trace` array or null).

### 2. Align runtime contract tests to strict boundary

- Replace permissive tests with fail-fast assertions for unknown fields.
- Ensure callsite-level contract tests (trigger/phase/lifecycle paths) assert unknown keys are rejected.
- Remove legacy `queryRuntimeCache` noise from malformed fixtures that are intended to test collector-shape violations, so each test isolates one contract failure cause.

## Files to Touch

- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` (modify)
- `packages/engine/test/unit/eval-runtime-resources-contract.test.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify)
- `packages/engine/test/unit/boundary-expiry.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-executor.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-actor.test.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify if needed)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify if needed)

## Out of Scope

- Token lookup semantics changes
- GameSpecDoc/game-content updates
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime resources with unknown keys (including `queryRuntimeCache`) fail with `RUNTIME_CONTRACT_INVALID`.
2. Canonical `{ collector }` resources continue passing in all kernel call paths.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Runtime resource boundary is exact and explicit; unknown keys are not tolerated.
2. Runtime remains game-agnostic and independent of game-specific content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-runtime-resources-contract.test.ts` — reject unknown top-level resource keys.
2. `packages/engine/test/unit/trigger-dispatch.test.ts` — reject unknown `evalRuntimeResources` keys at dispatcher boundary.
3. `packages/engine/test/unit/boundary-expiry.test.ts` — malformed contract fixture remains single-cause (collector violation only).
4. `packages/engine/test/unit/kernel/action-executor.test.ts` — malformed contract fixture remains single-cause (collector violation only).
5. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — malformed contract fixture remains single-cause (collector violation only).
6. `packages/engine/test/unit/kernel/action-actor.test.ts` — malformed contract fixture remains single-cause (collector violation only).
7. `packages/engine/test/unit/phase-advance.test.ts` — boundary guard parity if affected.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-runtime-resources-contract.test.js`
3. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-07
- Completion date: 2026-03-07
- What changed:
  - Enforced exact top-level `EvalRuntimeResources` contract shape in `assertEvalRuntimeResourcesContract`, rejecting unknown keys (including legacy `queryRuntimeCache`) with `RUNTIME_CONTRACT_INVALID`.
  - Enforced exact `collector` sub-shape in `assertEvalRuntimeResourcesContract`, rejecting unknown collector keys to remove hidden alias/extension paths at runtime boundaries.
  - Updated unit coverage to assert fail-fast behavior for unknown top-level keys in both direct contract tests and trigger dispatcher boundary tests.
  - Added unit coverage for unknown collector keys at direct contract and dispatcher boundaries.
  - Removed legacy `queryRuntimeCache` noise from malformed resource fixtures in related unit tests so each malformed-fixture assertion targets a single contract violation cause.
- Deviations from original plan:
  - Expanded test-touch scope beyond initial list to include additional malformed fixture tests that still carried legacy extra fields.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused `node --test` runs for changed unit files passed.
  - Focused `node --test packages/engine/dist/test/unit/eval-runtime-resources-contract.test.js packages/engine/dist/test/unit/trigger-dispatch.test.js` passed after collector strictness hardening.
  - `pnpm -F @ludoforge/engine test:unit` passed (286/286).
  - `pnpm -F @ludoforge/engine lint` passed.
