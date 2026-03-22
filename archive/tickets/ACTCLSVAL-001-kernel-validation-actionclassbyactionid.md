# ACTCLSVAL-001: Kernel validation of actionClassByActionId for card-driven defs

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — kernel validation boundary, turn-flow-action-class.ts, and card-driven runtime fixtures
**Deps**: None

## Problem

`actionClassByActionId` is defined as a required field in `TurnFlowDef` (`types-turn-flow.ts:134`: `readonly actionClassByActionId: Readonly<Record<string, TurnFlowActionClass>>`). The compiler already validates its presence and shape in multiple places (`compile-turn-flow.ts`, `validate-extensions.ts`, `cross-validate.ts`). However, kernel runtime resolution still tolerates its absence via optional chaining at `turn-flow-action-class.ts:16`:

```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId?.[actionId];
```

The `?.` on `actionClassByActionId` means a card-driven runtime `GameDef` can silently behave as if a required field were optional. That violates Foundation 8 (compiler-kernel validation boundary) and Foundation 10 (architectural completeness).

The earlier ticket also overstated the affected fixture surface. The current repo contains:

1. Boundary-crossing runtime/integration fixtures that define card-driven `turnFlow` objects without `actionClassByActionId`
2. One markdown compiler fixture missing the field
3. A few focused unit tests that intentionally cast partial `GameDef` shapes and never cross the validation/runtime boundary

This ticket should correct category 1 and the markdown fixture, and only update category 3 when a test actually exercises validated runtime behavior or turn-flow action-class resolution.

## Assumption Reassessment (2026-03-22)

1. `TurnFlowDef` at `types-turn-flow.ts:134` declares `actionClassByActionId` as required (no `?`). Confirmed.
2. `turn-flow-action-class.ts:16` uses `?.` on `actionClassByActionId`, making the required field effectively optional during runtime action-class resolution. Confirmed.
3. `validate-gamedef-core.ts` currently performs no generic required-key validation for card-driven `turnFlow`, even though the shared contract already declares `TURN_FLOW_REQUIRED_KEYS`. Confirmed.
4. Compiler-side validation is stronger than the original ticket stated: `compile-turn-flow.ts`, `validate-extensions.ts`, and `cross-validate.ts` already validate presence, shape, unknown-action mappings, and required semantic mappings for compiled specs. Confirmed.
5. A raw grep for `turnFlow:` without `actionClassByActionId` currently finds 17 `.test.ts` files plus `packages/engine/test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`. Some helper-based tests also create partial card-driven defs, but not all of them cross the validated/runtime boundary. Confirmed.
6. The prior `EXEASEATPIP-001` dependency is no longer valid. This ticket can proceed independently. Confirmed.

## Architecture Check

1. Adding kernel-side validation for a type-required card-driven turn-flow field aligns with Foundation 8 and removes a silent misconfiguration path at the runtime boundary.
2. The more robust architecture is not a bespoke `actionClassByActionId` check. The kernel should enforce the shared card-driven `turnFlow` required-key contract using the existing `TURN_FLOW_REQUIRED_KEYS` source of truth, then let specialized validators handle higher-order semantics.
3. Engine-agnostic: `actionClassByActionId` and the required turn-flow contract are generic turn-flow concepts, not game-specific logic.
4. No backwards-compatibility shims. Per Foundation 9, fixtures that represent valid card-driven runtime definitions should be updated in the same change.

## What to Change

### 1. Add kernel-side required-key validation for card-driven `turnFlow`

In `validate-gamedef-core.ts`, add a generic validation step for `def.turnOrder.type === 'cardDriven'` that checks the shared required card-driven `turnFlow` keys declared in `TURN_FLOW_REQUIRED_KEYS`.

For this ticket, the new validation must at minimum reject a missing or non-object `actionClassByActionId`, but the implementation should be structured around the shared required-key contract rather than a bespoke one-off check.

### 2. Remove `?.` on `actionClassByActionId` in `turn-flow-action-class.ts:16`

Change:

```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId?.[actionId];
```

To:

```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId[actionId];
```

This removes the last tolerant runtime path after the boundary validator is in place.

### 3. Update boundary-crossing fixtures that model valid card-driven runtime defs

Update fixtures and helper-produced defs that are intended to represent valid card-driven `GameDef`s and that cross either:

1. `validateGameDefBoundary()` / `assertValidatedGameDef()`
2. `initialState()`
3. `applyMove()`
4. `phaseAdvance()`
5. Any other path that resolves turn-flow action classes from validated runtime defs

Do not blanket-edit every file that happens to mention `turnFlow:`. Focus on fixtures that are asserting valid runtime behavior. The mapping must match the actual action ids and intended classes in each fixture.

**Candidate files to inspect first** (current grep surface, but update only when the fixture is meant to be valid at runtime/boundary):
- `packages/engine/test/integration/event-effect-timing.test.ts`
- `packages/engine/test/integration/fitl-card-lifecycle.test.ts`
- `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts`
- `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts`
- `packages/engine/test/integration/fitl-eligibility-window.test.ts`
- `packages/engine/test/integration/fitl-monsoon-pivotal-windows.test.ts`
- `packages/engine/test/unit/apply-move.test.ts`
- `packages/engine/test/unit/initial-state.test.ts`
- `packages/engine/test/unit/isolated-state-helpers.test.ts`
- `packages/engine/test/unit/parser.test.ts`
- `packages/engine/test/unit/phase-advance.test.ts`
- `packages/engine/test/unit/kernel/free-operation-action-domain.test.ts`
- `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts`
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts`
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- `packages/engine/test/unit/kernel/seat-resolution.test.ts`
- `packages/engine/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.ts`
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts`
- `packages/engine/test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`

The helper `packages/engine/test/helpers/card-seat-order-fixtures.ts` also requires inspection because it currently makes omission of `actionClassByActionId` easy. If its outputs are meant to model valid card-driven runtime defs, make the helper default to an explicit mapping instead of omitting the field.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-action-class.ts`
- `packages/engine/src/kernel/validate-gamedef-core.ts`
- `packages/engine/test/unit/validate-gamedef.test.ts`
- Boundary-crossing test fixtures and helper(s) that currently model valid card-driven runtime defs without `actionClassByActionId`
- `packages/engine/test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` if it is intended to remain a valid compiled spec fixture

## Out of Scope

- Validating that `actionClassByActionId` entries correspond to declared action IDs (compiler responsibility per Foundation 8)
- Adding `actionClassByActionId` validation for non-cardDriven turn orders
- Large-scale refactors of unrelated test helpers or fixture architecture beyond what is needed to keep valid card-driven runtime defs explicit and complete

## Acceptance Criteria

### Tests That Must Pass

1. A new kernel validation test proves card-driven `GameDef` payloads missing `turnFlow.actionClassByActionId` produce an error diagnostic at the validation boundary
2. All updated valid-runtime fixtures pass with the new validation active
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

### Invariants

1. `turn-flow-action-class.ts` must not use optional chaining on `actionClassByActionId`
2. `validate-gamedef-core.ts` must reject card-driven defs missing `actionClassByActionId`
3. The kernel validation implementation must be structured around the shared card-driven turn-flow contract, not a one-off ad hoc check
4. No fixture representing a valid card-driven runtime `GameDef` may omit `actionClassByActionId`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add test: card-driven def without `actionClassByActionId` produces an error diagnostic at the kernel boundary
2. Boundary-crossing runtime/integration fixtures — add explicit `actionClassByActionId` mappings where the fixture is meant to be valid
3. Add or strengthen one focused regression test around runtime action-class resolution so optional-chain removal is directly covered

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test --concurrency=1`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added shared required-key validation for card-driven `turnFlow` at the kernel boundary, including explicit diagnostics for missing required keys and non-object `actionClassByActionId`.
  - Removed the tolerant optional-chain path in `turn-flow-action-class.ts`.
  - Updated validated card-driven runtime fixtures and the FITL inline compiler fixture to carry explicit `actionClassByActionId` mappings where they model valid runtime defs.
  - Added the missing boundary regression in `validate-gamedef.test.ts`.
  - Fixed an exposed architectural inconsistency by making move identity preserve compatible action-class overrides such as `limitedOperation` when they are intentionally distinct from the mapped base class.
- Deviations from original plan:
  - The helper file `packages/engine/test/helpers/card-seat-order-fixtures.ts` did not require changes after reassessment; the runtime-valid fixture surface was narrower than the original ticket implied.
  - The ticket originally framed the work as an `actionClassByActionId`-specific fix. The implementation was generalized around the shared `TURN_FLOW_REQUIRED_KEYS` contract instead.
  - A focused move-identity adjustment was added because the stricter boundary exposed a real class-distinct free-operation identity bug.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test --concurrency=1` passed.
