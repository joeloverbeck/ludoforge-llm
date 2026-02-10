# KEREFFINT-008 - Choice Assertions (`chooseOne`, `chooseN`) and Binding Precedence

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement apply-time validation for already-selected move params and enforce effective binding precedence (`moveParams` merged with `bindings`, where `bindings` shadows collisions).

## Scope
- Implement `chooseOne` effect:
  - read selected value from `ctx.moveParams[bind]`
  - evaluate `options` domain via `evalQuery`
  - assert value is present and in-domain
- Implement `chooseN` effect:
  - assert bound value exists and is array
  - validate `n` is non-negative integer
  - validate exact cardinality, uniqueness, and domain membership
- Introduce helper for effective bindings resolution:
  - `effectiveBindings = { ...moveParams, ...bindings }`
  - ensure all evaluators/effects read through this merge consistently
- Ensure successful choice assertions do not change `state` or `rng`.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-context.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-choice.test.ts` (new)

## Out Of Scope
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
  - binding precedence test proves `ctx.bindings` shadows colliding `moveParams` keys in evaluator lookups.
- `test/unit/effects-runtime.test.ts` remains green.

## Invariants That Must Remain True
- Choice effects are pure assertions at apply-time; they never prompt or mutate game state.
- Domain checks are deterministic and based solely on evaluated option query output.
- Binding precedence is stable and consistent across all effect evaluations.

