# KEREFFINT-002 - Variable Effects (`setVar`, `addVar`) and Clamping

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement variable mutation effects for global and per-player scopes with strict runtime validation and clamping to declared variable bounds.

## Scope
- Implement `setVar` handler.
- Implement `addVar` handler.
- Use Spec 04 evaluators (`evalValue`, `resolvePlayerSel`) to resolve inputs.
- Validate variable existence and type (`int` only).
- Clamp post-update value to `[VariableDef.min, VariableDef.max]`.
- Ensure scalar player selection for per-player variable operations.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-var.test.ts` (new)

## Out Of Scope
- Token movement effects (`moveToken`, `moveAll`, `draw`, `shuffle`).
- Token lifecycle effects (`createToken`, `destroyToken`).
- Control flow and choice assertion effects.
- Any change to variable declaration schemas or `validate-gamedef` rules.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-var.test.ts`
  - `setVar` global updates the targeted global variable.
  - `setVar` pvar updates only the resolved player variable.
  - `setVar` clamps above max and below min.
  - `addVar` global and pvar apply signed deltas correctly.
  - `addVar` clamps above max and below min.
  - unknown variable name throws descriptive runtime error.
  - non-numeric evaluated value/delta throws type mismatch runtime error.
  - per-player scalar cardinality mismatch throws descriptive runtime error.
- `test/unit/effects-runtime.test.ts` remains green.

## Invariants That Must Remain True
- Only the targeted variable cell changes; unrelated state branches remain byte-for-byte equivalent references where possible.
- All updated variable values remain within declared min/max bounds.
- Input state object is never mutated.

