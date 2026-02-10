# KEREFFINT-008 - Choice Assertions (`chooseOne`, `chooseN`) and Binding Precedence

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement apply-time validation for already-selected move params in `chooseOne` and `chooseN`, and verify binding precedence behavior is covered by tests.

## Reassessed Assumptions
- Binding precedence merge is **already implemented** in `src/kernel/effects.ts` via:
  - `effectiveBindings = { ...ctx.moveParams, ...ctx.bindings }`
  - evaluator/effect call sites already route through this merge.
- `chooseOne`/`chooseN` are currently parsed/typed but **not implemented in effect dispatch** (currently throw `EFFECT_NOT_IMPLEMENTED`).
- Existing coverage for precedence exists in `test/unit/effects-var.test.ts`; this ticket should avoid duplicating that behavior unless needed for `choose*` assertions.

## Scope
- Implement `chooseOne` effect handler:
  - read selected value from `ctx.moveParams[bind]`
  - evaluate `options` domain via `evalQuery`
  - assert value is present and in-domain
- Implement `chooseN` effect handler:
  - assert bound value exists and is array
  - validate `n` is a non-negative integer
  - validate exact cardinality, uniqueness, and domain membership
- Keep `chooseOne`/`chooseN` as pure assertions (no `state` or `rng` mutation)
- Update runtime tests that currently expect `chooseOne` to be unimplemented.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `test/unit/effects-choice.test.ts` (new)
- `test/unit/effects-runtime.test.ts`

## Out Of Scope
- Further binding model refactors (already implemented).
- Legal-move enumeration or move generation prompt mechanics (Spec 06).
- Any mutation behavior unrelated to choice assertion validation.
- Changes to options query semantics.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-choice.test.ts`
  - `chooseOne` succeeds for present in-domain move param.
  - `chooseOne` throws when move param missing.
  - `chooseOne` throws when value is outside evaluated options.
  - `chooseN` succeeds for exact-length unique in-domain array.
  - `chooseN` throws on duplicate selections.
  - `chooseN` throws on wrong cardinality.
  - `chooseN` throws on out-of-domain selections.
  - `chooseN` throws when `n` is negative/non-integer.
  - successful `chooseOne`/`chooseN` leave `state` and `rng` unchanged.
- `test/unit/effects-runtime.test.ts` remains green with updated expectation (no longer asserting `chooseOne` is unimplemented).

## Invariants That Must Remain True
- Choice effects are pure assertions at apply-time; they never prompt or mutate game state.
- Domain checks are deterministic and based solely on evaluated option query output.
- Binding precedence remains stable: `ctx.bindings` shadows colliding `moveParams` keys.

## Outcome
- Completion date: 2026-02-10
- What was changed:
  - Implemented `chooseOne` and `chooseN` apply-time assertion handlers in `src/kernel/effects.ts`.
  - Added `test/unit/effects-choice.test.ts` with success/failure coverage and purity checks.
  - Updated `test/unit/effects-runtime.test.ts` to remove the obsolete expectation that `chooseOne` is unimplemented.
- Deviations from original plan:
  - Did not modify `src/kernel/effect-context.ts` or `src/kernel/effect-error.ts` because existing APIs/errors already supported the required behavior.
  - Existing binding-precedence behavior was retained (already implemented) and validated through tests rather than re-implemented.
- Verification:
  - `npm run test:unit` passed.
  - `npm test` passed.
