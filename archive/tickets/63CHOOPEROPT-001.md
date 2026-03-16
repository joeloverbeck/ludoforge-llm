# 63CHOOPEROPT-001: Add `resolution` field to ChoiceOption type

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — types-core.ts, legal-choices.ts, effects-choice.ts
**Deps**: None

## Problem

Spec 63 requires a `resolution` metadata field on chooseN options so the UI can distinguish exact results from provisional ones. This is the foundation type change that all subsequent tickets depend on.

## Assumption Reassessment (2026-03-15)

1. `ChoiceOption` is defined in `packages/engine/src/kernel/types-core.ts:615` with fields `value`, `legality`, `illegalReason`. Confirmed.
2. `ChoiceOption` is used throughout `legal-choices.ts`, `effects-choice.ts`, `advance-choose-n.ts`, `choice-option-policy.ts`, and tests. The field must be optional to avoid breaking all existing consumers.
3. No existing `resolution` field or similar metadata exists on `ChoiceOption`.

## Architecture Check

1. Adding an optional field is backward-compatible and non-breaking.
2. This is a kernel type change — game-agnostic, no game-specific logic.
3. No shims needed. Existing code that doesn't set `resolution` simply leaves it `undefined`.

## What to Change

### 1. Add `ChooseNOptionResolution` type and extend `ChoiceOption`

In `types-core.ts`:
- Add `type ChooseNOptionResolution = 'exact' | 'provisional' | 'stochastic' | 'ambiguous';`
- Add `readonly resolution?: ChooseNOptionResolution;` to `ChoiceOption`
- Export `ChooseNOptionResolution`

### 2. Tag existing exact surfaces with `resolution: 'exact'`

In `effects-choice.ts` (`buildChooseNPendingChoice`):
- Options marked `illegal` due to already-selected, at-capacity, or tier-blocked get `resolution: 'exact'`.

In `legal-choices.ts` (`mapChooseNOptions`):
- Options resolved by the current exhaustive enumeration get `resolution: 'exact'`.
- Options in the all-unknown fallback get `resolution: 'provisional'` (replacing the implicit semantics).

In `legal-choices.ts` (`mapOptionsForPendingChoice` for chooseOne):
- chooseOne options default to `resolution: 'exact'`.

### 3. Update `ChoiceOption` construction sites

Grep all `{ value: ..., legality: ..., illegalReason: ... }` object literals in kernel code and add `resolution` where the legality source is known.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)

## Out of Scope

- Hybrid resolver algorithm (63CHOOPEROPT-003/004)
- Worker-local session (Phase B tickets)
- UI changes to display resolution (63CHOOPEROPT-011)
- Removing the all-unknown fallback (63CHOOPEROPT-002)
- Changes to `advance-choose-n.ts` (later tickets)
- Changes to `choice-option-policy.ts` logic
- Schema artifact updates (if needed, separate ticket)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `ChoiceOption` with `resolution: 'exact'` is accepted by type system
2. New unit test: existing `buildChooseNPendingChoice` output includes `resolution: 'exact'` on statically-illegal options
3. New unit test: `mapChooseNOptions` exhaustive path produces `resolution: 'exact'` on all resolved options
4. New unit test: `mapChooseNOptions` fallback path produces `resolution: 'provisional'` on all unknown options
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ChoiceOption.resolution` is optional — all existing code that omits it must continue to compile and pass.
2. No change to `legality` semantics — `legal`/`illegal`/`unknown` behavior is identical.
3. Kernel purity preserved — no side effects introduced.
4. `chooseOne` options default to `resolution: 'exact'` where legality is deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — resolution field propagation through `buildChooseNPendingChoice` and `mapChooseNOptions`
2. Modify `packages/engine/test/unit/kernel/legal-choices.test.ts` — add assertions on `resolution` field for existing chooseN test cases

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-15
- **What changed**:
  - `packages/engine/src/kernel/types-core.ts`: Added `ChooseNOptionResolution` type (`'exact' | 'provisional' | 'stochastic' | 'ambiguous'`) and optional `resolution` field to `ChoiceOption`
  - `packages/engine/src/kernel/effects-choice.ts`: `buildChooseNPendingChoice` tags statically-illegal options (already-selected, at-capacity, tier-blocked) with `resolution: 'exact'`
  - `packages/engine/src/kernel/legal-choices.ts`: `mapChooseNOptions` exhaustive path tags all results `resolution: 'exact'`; cap-exceeded fallback tags all results `resolution: 'provisional'`; `mapOptionsForPendingChoice` chooseOne path tags all results `resolution: 'exact'`
  - `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts`: New test file covering resolution propagation through discover, evaluate, and advanceChooseN paths
  - Updated 9 existing `deepStrictEqual`/`deepEqual` assertions across `legal-choices.test.ts`, `advance-choose-n.test.ts`, `effects-choice.test.ts`, and `decision-sequence.test.ts` to include the `resolution` field
- **Deviations**: None. All deliverables implemented as specified.
- **Verification**: 4655 tests pass, 0 failures. Typecheck clean (3/3 packages).
