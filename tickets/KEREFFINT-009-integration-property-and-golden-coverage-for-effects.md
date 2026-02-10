# KEREFFINT-009 - Integration, Property, and Golden Coverage for Effect Interpreter

**Status**: Proposed
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001` through `KEREFFINT-008`

## Goal
Lock in Spec 05 behavior with end-to-end effect-chain coverage and invariants that detect regression in sequencing, determinism, and conservation properties.

## Scope
- Add integration tests for multi-effect chains combining:
  - `let` + `forEach` + `if`
  - variable mutation + token movement + shuffle/lifecycle
  - `chooseOne`/`chooseN` assertions in realistic action-like contexts
- Add/extend property tests for effect invariants:
  - token conservation under movement effects
  - clamped variable ranges after any successful var mutation
  - exact iteration counts for bounded `forEach`
  - `createToken`/`destroyToken` count deltas
- Add at least one golden state-comparison test with known seed + effect sequence.
- Ensure exported effect APIs and error types are surfaced via `src/kernel/index.ts`.

## File List Expected To Touch
- `test/integration/effects-complex.test.ts` (new)
- `test/unit/property/effects.property.test.ts` (new)
- `test/unit/effects.golden.test.ts` (new)
- `src/kernel/index.ts`

## Out Of Scope
- New effect semantics beyond Spec 05.
- Performance profiling/benchmark harness updates.
- Game-loop orchestration behavior from Spec 06.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/integration/effects-complex.test.ts`
  - 5+ effect chain transforms initial state to expected final state.
  - nested control-flow chain yields expected cumulative variable/token result.
- `test/unit/property/effects.property.test.ts`
  - movement effects conserve total token count.
  - post-`setVar`/`addVar` values remain within `[min, max]`.
  - `forEach` applies nested effects exactly `min(N, limit)` times.
  - successful `chooseN` selections are unique and exact-length.
- `test/unit/effects.golden.test.ts`
  - known seed + fixed effect list produces exact expected final state snapshot.
- Full regression gate passes:
  - `npm run build`
  - `npm test`

## Invariants That Must Remain True
- Effect interpreter remains deterministic for same `(def, state, rng, params, bindings)`.
- Randomness-dependent operations are the only operations that change RNG state.
- No integration test depends on nondeterministic object-key ordering.

