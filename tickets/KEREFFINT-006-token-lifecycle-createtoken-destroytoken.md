# KEREFFINT-006 - Token Lifecycle (`createToken`, `destroyToken`)

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`, `KEREFFINT-005`

## Goal
Implement token creation and destruction with deterministic ID generation, strict location validation, and safe prop evaluation.

## Scope
- Implement `createToken` effect:
  - resolve destination zone
  - evaluate `props` values via `evalValue`
  - build token with deterministic ID from `state.nextTokenOrdinal`
  - append/prepend according to established zone insertion convention for creation
  - increment `nextTokenOrdinal` exactly once per successful creation
- Implement `destroyToken` effect:
  - resolve bound token
  - find token across zones
  - throw if missing or found in multiple zones
  - remove token from exactly one zone
- Add runtime errors with clear context for invalid lifecycle operations.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `src/kernel/effect-error.ts`
- `test/unit/effects-lifecycle.test.ts` (new)

## Out Of Scope
- Any variable mutation effect behavior.
- `moveToken`/`moveAll`/`draw`/`shuffle` behavior.
- Game-loop trigger emission tied to token enter/exit events (Spec 06).
- Token type schema validation rule changes.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-lifecycle.test.ts`
  - `createToken` adds one token to the target zone.
  - created token has requested `type` and evaluated `props`.
  - repeated `createToken` calls produce unique deterministic IDs for a fixed seed/state.
  - `nextTokenOrdinal` increments by exactly one after successful create.
  - failed `createToken` (e.g., invalid prop expression) does not increment `nextTokenOrdinal`.
  - `destroyToken` removes exactly one token when present.
  - `destroyToken` throws when token not found.
  - `destroyToken` throws when token appears in multiple zones.
- `test/unit/effects-runtime.test.ts` remains green.

## Invariants That Must Remain True
- `createToken` increases total token count by exactly one.
- `destroyToken` decreases total token count by exactly one.
- Lifecycle operations do not mutate unrelated zones/variables.

