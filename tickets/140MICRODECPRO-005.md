# 140MICRODECPRO-005: D3 (full) — effect-frame suspend/resume across nested chooseN / chooseOne / chooseStochastic

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — full effect-frame suspend/resume implementation in `microturn/apply.ts` + relocates stochastic resolution logic from `move-completion.ts`
**Deps**: `tickets/140MICRODECPRO-004.md`, `archive/tickets/140MICRODECPRO-001.md`

## Problem

This is the technically-hardest ticket. It implements effect-frame suspend/resume so the kernel can advance through arbitrarily-nested `chooseN` / `chooseOne` / `chooseStochastic` sequences, one atomic microturn at a time, with state serialized at every boundary.

Ticket 001's I5 prototype proves the pattern feasible on a synthetic GameDef. This ticket commits the pattern to production and extends `applyDecision` + `advanceAutoresolvable` to handle the remaining context kinds: `chooseNStep`, `stochasticResolve`, `outcomeGrantResolve`.

Additionally: `move-completion.ts` (389 lines today, 7 src + 9 test consumers) is split — the stochastic resolution logic relocates into `microturn/apply.ts`; the template-completion pipeline stays in place for now (ticket 012 retires the template pipeline when certificate machinery retires).

## Assumption Reassessment (2026-04-20)

1. Ticket 001's I5 prototype test has landed and is green — suspend/resume pattern is proven.
2. Ticket 004 introduced `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` for simple contexts. This ticket *extends* those functions rather than duplicating them.
3. `move-completion.ts` currently contains both template-completion logic AND stochastic resolution logic — confirmed by reassessment (389 lines, 7 src + 9 test consumers). The stochastic-resolve hoist is a surgical extraction, not a full file deletion (the deletion is ticket 012).
4. `ChooseNStepCommand` (add / remove / confirm) is part of the D1 type surface from ticket 003.
5. `FreeOperationGrant` already exists in the kernel — spec preserves the Spec 139 outcome-grant resolution path and simply relocates its invocation into the microturn pipeline.

## Architecture Check

1. **Extends**, not replaces — simple-context handling from ticket 004 continues to work; this ticket only adds the complex cases. The public API signatures of `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` do not change.
2. Effect-frame snapshot is immutable per F11 — each `DecisionStackFrame` is reconstructed, never mutated. The kernel may use F11's scoped-mutation exception *within* a single `applyDecision` call for the draft-state performance path, but the external contract `applyDecision(state) -> newState` is preserved with test-enforced isolation (T4 handles this).
3. Determinism (F8): suspend/resume must be bit-identical across runs. The `effectFrame` snapshot captures every dimension of the execution frontier (program counter, cursor positions, locals, pending trigger queue). Canonical serialization round-trip at any mid-execution point preserves state-hash equality.
4. Bounded computation (F10, amended): `advanceAutoresolvable` chain is bounded by `MAX_AUTO_RESOLVE_CHAIN`; effect execution uses existing trigger-depth bounds; no unbounded recursion introduced.
5. F14 compliant: the stochastic-resolve relocation is a same-change hoist — the source file `move-completion.ts` loses stochastic-resolve code in the same commit that `microturn/apply.ts` gains it. No transitional aliasing.

## What to Change

### 1. Extend `microturn/apply.ts` — full context coverage

Remove the `UNSUPPORTED_CONTEXT_KIND_THIS_TICKET` error paths from ticket 004 and implement:

- **`chooseNStep`**: apply the step command. `add` / `remove` update `selectedSoFar` and republish a new microturn of the same kind. `confirm` validates the selection cardinality against `{min, max}`, binds the resulting subset as a bound value, pops the frame, and resumes the parent.
- **`stochasticResolve`**: sample from the distribution using the chance RNG. Bind the sampled value; pop; resume the parent. Only callable via `advanceAutoresolvable` (never surfaced to a player agent).
- **`outcomeGrantResolve`**: resolve the grant per the deterministic kernel rules preserved from Spec 139 D5. Pop; resume parent. Only callable via `advanceAutoresolvable`.

### 2. Implement effect-frame suspend/resume

In `microturn/apply.ts`, implement the core algorithm per spec 140 D3:

**Suspend path** (during effect execution inside `applyDecision`):

1. When effect execution encounters `chooseN`/`chooseOne`/`chooseStochastic` — snapshot the effect execution frame (program counter, bounded-iteration cursors, local let-bindings, pending trigger queue).
2. Push a new `DecisionStackFrame` with the snapshot as `effectFrame` and the appropriate `DecisionContext` as `context`.
3. Return from `applyDecision` without advancing further.

**Resume path** (on the next `applyDecision` call):

1. Read the top frame's `effectFrame`.
2. Restore program counter and local state.
3. Continue effect execution past the suspension point with the newly-bound value.
4. Iterate: further sub-decisions push further frames; completion unwinds the stack.

### 3. Extend `microturn/advance.ts`

Loop over the full auto-resolvable context set: `stochasticResolve`, `outcomeGrantResolve`, `turnRetirement`. Bounded by `MAX_AUTO_RESOLVE_CHAIN`. Chance RNG is derived from the game seed via `CHANCE_RNG_MIX`; the agent RNGs are untouched.

### 4. Relocate stochastic resolution logic from `move-completion.ts`

Identify the stochastic-resolve code path in `packages/engine/src/kernel/move-completion.ts` (currently invoked by template-completion). Move that logic into `microturn/apply.ts` as an internal helper `resolveStochasticDistribution(state, distribution, rng)`. Update `move-completion.ts` to call the helper via its new location (it remains a consumer until ticket 012 retires it). The hoist is behavior-preserving — same inputs produce same outputs, same RNG advance.

### 5. Serialization

Ensure the expanded `effectFrame` snapshot serializes canonically per F8. Update `schemas-core.ts` / `serde.ts` if the snapshot shape requires new fields beyond the placeholder introduced in ticket 003.

## Files to Touch

- `packages/engine/src/kernel/microturn/apply.ts` (modify — add chooseNStep, stochasticResolve, outcomeGrantResolve + full suspend/resume)
- `packages/engine/src/kernel/microturn/advance.ts` (modify — loop over full auto-resolvable set, use `CHANCE_RNG_MIX` to derive chance RNG)
- `packages/engine/src/kernel/microturn/types.ts` (modify — expand `EffectExecutionFrameSnapshot` if needed)
- `packages/engine/src/kernel/move-completion.ts` (modify — extract stochastic resolution; template-completion logic remains until ticket 012)
- `packages/engine/src/kernel/schemas-core.ts` (modify if serialization needs update)
- `packages/engine/src/kernel/serde.ts` (modify if needed)
- `packages/engine/src/sim/simulator.ts` (modify — use `CHANCE_RNG_MIX` to derive chance RNG seed; simulator loop still uses `applyMove` until ticket 006)

## Out of Scope

- Simulator loop rewrite to publish/apply per-microturn — ticket 006.
- Agent API change — ticket 007.
- Certificate machinery retirement (keeps `move-completion.ts` alive as a template-completion helper for now) — ticket 012.
- `DecisionLog` / `GameTrace` shape change — ticket 006.
- T4 (suspend/resume correctness) and T8 (stochastic auto-advance) tests — bundled in ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — build green, no type errors.
2. Ticket 001's I5 prototype test continues to pass under the production implementation (the prototype scaffolding is replaced by real `publishMicroturn` / `applyDecision` invocations, but the assertions are preserved).
3. Existing determinism suite — unchanged (simulator still uses legacy `applyMove`).
4. Existing template-completion and stochastic tests — behavior-preserving; they invoke the new helper location transparently.
5. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. F8: state-hash is bit-identical across serialize/deserialize at every microturn boundary for the synthetic corpus from I5.
2. F11: `applyDecision` does not mutate input state (test-enforced isolation per F11's scoped-mutation exception).
3. F10: `advanceAutoresolvable` always terminates within `MAX_AUTO_RESOLVE_CHAIN` iterations.
4. Stochastic resolution consumes the chance RNG only, never an agent RNG.

## Test Plan

### New/Modified Tests

- `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` (from ticket 001) — continues to pass; its internal scaffolding is replaced with real kernel calls.
- T1, T2, T3, T4, T8 are authored in ticket 014.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `node --test packages/engine/dist/test/unit/kernel/effect-frame-suspend-resume-prototype.test.js` (targeted)
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
