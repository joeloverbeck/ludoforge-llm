# 62BINCCHOPRO-001: Split pending choice request variants and add initial `chooseN` incremental state

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types plus `chooseN` pending-request construction/normalization
**Deps**: Spec 62b

## Problem

`ChoicePendingRequest` currently uses one broad interface for both `chooseOne` and `chooseN`. That shape hides an important invariant: only `chooseN` has selection cardinality and incremental-selection state. The runner still owns multi-select interaction state locally, so the engine cannot yet drive stepwise `chooseN` legality, but the pending request surface is also too weak to model the state cleanly when that protocol lands.

This ticket should establish the correct pending-request shape now:

1. split pending request typing by discriminator (`chooseOne` vs `chooseN`)
2. add explicit incremental-state fields to the `chooseN` variant
3. initialize those fields on engine-produced pending `chooseN` requests so the public API already reflects engine-owned state

## Assumption Reassessment (2026-03-14)

1. `ChoicePendingRequest` is defined in `packages/engine/src/kernel/types-core.ts` and re-exported through `packages/engine/src/kernel/types.ts` and `packages/engine/src/kernel/index.ts`. Confirmed.
2. The current broad interface is consumed across kernel helpers (`legal-choices.ts`, `effects-choice.ts`, `choice-option-policy.ts`, `decision-sequence-satisfiability.ts`, `move-completion.ts`, `free-operation-viability.ts`) and by runner/store/UI tests. This is not an isolated type-only change.
3. Pending `chooseN` requests are currently constructed in `packages/engine/src/kernel/effects-choice.ts`. `effects-choice.ts` also normalizes and structurally keys pending requests for branch merging, so new `chooseN` state cannot be added safely without updating that normalization path.
4. The runner still owns interactive `chooseN` selection state today in `packages/runner/src/ui/ChoicePanel.tsx`, where it keeps local `selectedChoiceValueIds`, computes confirmability locally, and submits a completed array through `GameStore.chooseN(...)`.
5. No existing `selected` or `canConfirm` fields exist on engine pending requests. Confirmed.

## Architecture Check

1. The clean architecture is a discriminated pending-request union, not one interface with loosely meaningful optional fields.
2. `selected` is engine state, not UI-local state. This ticket only establishes the surface and initial value; it does not yet move interactive authority out of the runner.
3. `canConfirm` is kernel-derived state. For this ticket it should reflect the initial pending request (`selected.length === 0`), not a runner-local recomputation contract.
4. `chooseOne` and `chooseN` should have different type shapes. If downstream code breaks because it relied on the old over-broad interface, fix the consumer instead of preserving the ambiguity.

## What to Change

### 1. Split `ChoicePendingRequest` into explicit variants

In `packages/engine/src/kernel/types-core.ts`, replace the single broad pending interface with:

```ts
ChoicePendingChooseOneRequest
ChoicePendingChooseNRequest
type ChoicePendingRequest =
  | ChoicePendingChooseOneRequest
  | ChoicePendingChooseNRequest;
```

Shared fields remain on a small base type. The important invariant this ticket enforces is that `selected` and `canConfirm` belong only on the `chooseN` variant.

### 2. Add explicit `chooseN` incremental-state fields

On `ChoicePendingChooseNRequest`, add:

```ts
readonly selected: readonly MoveParamScalar[];
readonly canConfirm: boolean;
```

For this ticket:

- `selected` starts as `[]`
- `canConfirm` is derived from that initial selection against `min`
- no incremental add/remove protocol is introduced yet

### 3. Populate initial `chooseN` state at construction sites

Update pending `chooseN` construction/normalization so the runtime surface is internally consistent:

- `packages/engine/src/kernel/effects-choice.ts`
- any `chooseN`-specific structural-key / normalization paths used for stochastic alternative merging

`chooseOne` construction must remain unchanged apart from typing.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/effects-choice.ts`
- kernel and runner tests that construct `ChoicePendingRequest` literals or assert `chooseN` pending request shape

## Out of Scope

- Incremental add/remove/confirm protocol (`advanceChooseN`) and runner bridge/store command changes
- The `advanceChooseN` function (ticket 62BINCCHOPRO-004)
- Tier-admissibility logic (ticket 62BINCCHOPRO-002)
- Replacing runner-local `chooseN` interaction state in `ChoicePanel` / `GameStore`
- Schema artifact changes (JSON Schemas are generated separately)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. `pnpm turbo typecheck` succeeds
3. `pnpm -F @ludoforge/engine test` succeeds
4. `pnpm -F @ludoforge/runner test` succeeds

### Invariants

1. `ChoicePendingRequest` is a discriminated union with explicit `chooseN` incremental-state fields
2. All engine-produced pending `chooseN` requests include `selected: []`
3. All engine-produced pending `chooseN` requests include initial `canConfirm`
4. `effects-choice` normalization/structural-key logic preserves `chooseN` incremental-state fields
5. Runner behavior is unchanged for now: it may ignore engine-owned `selected` / `canConfirm`, but it must compile and tests must pass

## Test Plan

### New/Modified Tests

Add or update tests that pin the new invariant:

- engine unit test(s) asserting pending `chooseN` requests expose `selected: []` and initial `canConfirm`
- engine unit test(s) covering any normalization or stochastic alternative surface that would otherwise drop/distort the new fields
- runner/unit tests updated where typed request literals or assertions now need the narrower `chooseN` shape

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-14
- What changed:
  - Split `ChoicePendingRequest` into explicit `chooseOne` / `chooseN` variants.
  - Added engine-owned `selected` and `canConfirm` fields to the `chooseN` variant.
  - Initialized those fields on discovered pending `chooseN` requests.
  - Updated stochastic pending-choice normalization/structural-key logic so the new state is preserved.
  - Strengthened engine tests around initial `chooseN` state and stochastic alternative preservation.
- Deviations from original plan:
  - `selected` and `canConfirm` landed as explicit `chooseN` fields as planned.
  - `min` and `max` were left on the shared pending-choice base for this slice to avoid a much wider non-behavioral refactor across engine tests/helpers. The stronger narrowing can be done later when the incremental protocol work absorbs that ripple.
- Verification results:
  - `pnpm turbo build`
  - `pnpm turbo typecheck`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo lint`
