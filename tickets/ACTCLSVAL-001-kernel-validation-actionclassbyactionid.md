# ACTCLSVAL-001: Kernel validation of actionClassByActionId for card-driven defs

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — kernel validation and turn-flow-action-class.ts
**Deps**: None

## Problem

`actionClassByActionId` is defined as a required field in `TurnFlowDef` (`types-turn-flow.ts:134`: `readonly actionClassByActionId: Readonly<Record<string, TurnFlowActionClass>>`). The compiler validates its presence (`compile-turn-flow.ts:175-178`, `validate-extensions.ts:1038`). However, the kernel silently tolerates its absence via optional chaining `?.` at `turn-flow-action-class.ts:16`:

```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId?.[actionId];
```

The `?.` on `actionClassByActionId` means if the field is missing (which TypeScript's type says should never happen), the kernel silently returns `null` instead of failing. This violates Foundation 8 (compiler-kernel validation boundary) and Foundation 10 (architectural completeness — the `?.` papers over a structural gap).

Approximately 20 test files define card-driven `turnFlow` objects without `actionClassByActionId`. These tests pass only because of the `?.` guard, relying on dormant option matrices and null fallback paths.

## Assumption Reassessment (2026-03-22)

1. `TurnFlowDef` at `types-turn-flow.ts:134` declares `actionClassByActionId` as required (no `?`). Confirmed.
2. `turn-flow-action-class.ts:16` uses `?.` on `actionClassByActionId`, making it effectively optional at runtime. Confirmed.
3. `validate-gamedef-core.ts` has zero validation of `actionClassByActionId` or `turnFlow` — no kernel-side validation exists. Confirmed.
4. ~20 test files reference `turnFlow:` without `actionClassByActionId`. Confirmed by grep.
5. The prior `EXEASEATPIP-001` dependency is no longer valid. Those 3 `executeAsSeat` test defs have already been corrected to include `event: 'event'`, so this ticket can proceed independently.

## Architecture Check

1. Adding kernel-side validation for a type-required field aligns with Foundation 8 (kernel validates behavior/semantics) and eliminates a class of silent misconfiguration.
2. Engine-agnostic: `actionClassByActionId` is a generic turn-flow concept. The validation is generic.
3. No backwards-compatibility shims. Per Foundation 9, all test fixtures are updated in the same change.

## What to Change

### 1. Remove `?.` on `actionClassByActionId` in `turn-flow-action-class.ts:16`

Change:
```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId?.[actionId];
```
To:
```typescript
const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId[actionId];
```

This makes the field access fail loudly if `actionClassByActionId` is `undefined` on a card-driven def, matching the type contract.

### 2. Add kernel validation in `validate-gamedef-core.ts`

Add a diagnostic check: if `turnOrder.type === 'cardDriven'` and `turnOrder.config.turnFlow` exists, assert that `actionClassByActionId` is a non-null object. Emit an error diagnostic if missing.

### 3. Update ~20 test files to include `actionClassByActionId`

For each test file that defines a card-driven `turnFlow` object without `actionClassByActionId`, add the appropriate mapping based on the actions defined in that test's GameDef fixture. The typical pattern is `{ event: 'event', operation: 'operation' }` but must match the actual action IDs and their intended classes.

**Files requiring updates** (test files with `turnFlow:` but no `actionClassByActionId`):
- `packages/engine/test/unit/apply-move.test.ts`
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts`
- `packages/engine/test/unit/kernel/free-operation-action-domain.test.ts`
- `packages/engine/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.ts`
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts`
- `packages/engine/test/unit/kernel/seat-resolution.test.ts`
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts`
- `packages/engine/test/unit/initial-state.test.ts`
- `packages/engine/test/unit/phase-advance.test.ts`
- `packages/engine/test/unit/parser.test.ts`
- `packages/engine/test/unit/isolated-state-helpers.test.ts`
- `packages/engine/test/integration/fitl-eligibility-pass-chain.test.ts`
- `packages/engine/test/integration/fitl-card-lifecycle.test.ts`
- `packages/engine/test/integration/fitl-monsoon-pivotal-windows.test.ts`
- `packages/engine/test/integration/event-effect-timing.test.ts`
- `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts`
- `packages/engine/test/integration/fitl-eligibility-window.test.ts`

Each file may have multiple fixture defs — each must be inspected and updated individually.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-action-class.ts` (modify — remove `?.` at line 16)
- `packages/engine/src/kernel/validate-gamedef-core.ts` (modify — add `actionClassByActionId` validation)
- ~20 test files (modify — add `actionClassByActionId` to fixture turnFlow defs)

## Out of Scope

- Validating that `actionClassByActionId` entries correspond to declared action IDs (that is a compiler responsibility per Foundation 8)
- Adding `actionClassByActionId` validation for non-cardDriven turn orders
- Refactoring test fixture helpers to include `actionClassByActionId` by default (helpful but separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. A new validation test: card-driven GameDef without `actionClassByActionId` produces an error diagnostic
2. All updated test fixtures pass with the new validation active
3. Existing suite: `pnpm turbo test`

### Invariants

1. `turn-flow-action-class.ts` must not use optional chaining on `actionClassByActionId` — it is a required field
2. `validate-gamedef-core.ts` must reject card-driven defs missing `actionClassByActionId`
3. No test file may define a card-driven `turnFlow` without `actionClassByActionId`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add test: card-driven def without `actionClassByActionId` produces error diagnostic
2. ~20 test files — modify fixture defs to include `actionClassByActionId`

### Commands

1. `pnpm turbo test --force`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
