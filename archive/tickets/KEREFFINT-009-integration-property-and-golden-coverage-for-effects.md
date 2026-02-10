# KEREFFINT-009 - Integration, Property, and Golden Coverage for Effect Interpreter

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001` through `KEREFFINT-008`

## Goal
Lock in Spec 05 behavior with end-to-end effect-chain coverage and invariants that detect regression in sequencing, determinism, and conservation properties.

## Reassessed Baseline
- `src/kernel/effects.ts`, `src/kernel/effect-context.ts`, and `src/kernel/effect-error.ts` are already implemented.
- `src/kernel/index.ts` already exports effect APIs and error types.
- Existing unit tests already cover broad single-effect behavior:
  - `test/unit/effects-var.test.ts`
  - `test/unit/effects-token-move-draw.test.ts`
  - `test/unit/effects-zone-ops.test.ts`
  - `test/unit/effects-lifecycle.test.ts`
  - `test/unit/effects-control-flow.test.ts`
  - `test/unit/effects-choice.test.ts`
  - `test/unit/effects-runtime.test.ts`
- Primary gap is cross-effect regression coverage: integration chain behavior, property-style invariants spanning effect families, and a deterministic golden final-state test for effects.

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

## File List Expected To Touch
- `test/integration/effects-complex.test.ts` (new)
- `test/unit/property/effects.property.test.ts` (new)
- `test/unit/effects.golden.test.ts` (new)

## Out Of Scope
- New effect semantics beyond Spec 05.
- Performance profiling/benchmark harness updates.
- Game-loop orchestration behavior from Spec 06.
- Refactoring existing effect runtime modules with no behavior change.

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

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added `test/integration/effects-complex.test.ts` with multi-effect chain coverage including `let` + `forEach` + `if`, choice assertions, movement, shuffle, and lifecycle effects.
  - Added `test/unit/property/effects.property.test.ts` with property-style invariants for token conservation, clamping bounds, bounded `forEach` counts, lifecycle count deltas, and successful `chooseN` constraints.
  - Added `test/unit/effects.golden.test.ts` with fixed-seed, fixed-sequence final-state snapshot coverage.
- Deviations from original plan:
  - No runtime/kernel code changes were needed.
  - No `src/kernel/index.ts` change was needed because effect APIs and errors were already exported.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
