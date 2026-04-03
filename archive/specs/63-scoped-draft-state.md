# Spec 63 — Profile-Gated Spread Reduction Audit

**Status**: 🚫 NOT IMPLEMENTED

## Dependencies

None. This spec is independent and should be implemented before Spec 64 (Compiled Expression Evaluation), because the interpreter's overhead profile will change once allocation pressure from remaining object spreads is reduced.

## Problem

The scoped draft state infrastructure already exists in `packages/engine/src/kernel/state-draft.ts` (`MutableGameState`, `DraftTracker`, `createMutableState`, `freezeState`, copy-on-write helpers). It is adopted across all hot-path effect handlers (effects-token.ts, effects-var.ts, effects-choice.ts, effects-resource.ts, effects-reveal.ts) via the `EffectCursor.tracker` field in `effect-dispatch.ts`.

Despite this, CPU profiling (`perf record --perf-basic-prof`) of FITL simulations still shows significant spread overhead:

| V8 Builtin | % of CPU | Cause |
|------------|----------|-------|
| `Builtins_CreateDataProperty` | 7.77% | Object spread property assignment |
| `Builtins_CloneObjectIC` | 1.95% | Shallow clone for spreads |
| `Builtins_CloneObjectIC_Slow` | 1.69% | Slow-path clone (large objects) |
| `ScavengerCollector::CollectGarbage` | 3.80% | GC pressure from short-lived copies |
| **Total** | **~15%** | |

The remaining overhead is NOT from effect handlers — those already use the mutable draft. It comes from spread sites OUTSIDE the effect execution scope:

1. **`apply-move.ts` final state assembly** (lines 1355-1359, 1561-1564): Spreads the entire `GameState` (~19 top-level fields) per move just to assign 1-2 hash fields (`stateHash`, `_runningHash`).
2. **`phase-advance.ts` nested turnOrderState construction** (14 sites): Multiple nested spreads (`{ ...state, turnOrderState: { ...runtime, ... } }`) per phase advance.
3. **`effects-control.ts` PartialEffectResult assembly** (40+ sites): Conditional field spreads per effect handler return, though these are small objects (3-5 fields).
4. **`EffectCursor` spreading** (55+ sites): Already optimized to 5-field spreads, but still numerous.

## Non-Goals

- **Do NOT change EffectCursor shape** — Global lessons prove that adding fields to EffectCursor causes V8 hidden class deoptimization (4-7% regression across 5 experiments in prior campaigns).
- **Do NOT eliminate small-object spreads** (PartialEffectResult, EffectCursor) — Global lessons prove V8 JIT optimizes 3-5 field spreads efficiently; micro-optimizations that try to avoid them are consistently SLOWER.
- **Do NOT remove dead fallback branches** in effects-token.ts — The immutable fallback paths in token handlers are dead code (DraftTracker is always set by `applyEffectsWithBudgetState`). Removing dead code is a cleanup concern, not a performance concern.
- **Do NOT introduce a new DraftGameState type** — `MutableGameState` from `state-draft.ts` already serves this purpose.

## FOUNDATIONS Alignment

Foundation 11 (Immutability) explicitly permits scoped internal mutation:

> "Within a single synchronous effect-execution scope, the kernel MAY use a private draft state or copy-on-write working state for performance. That working state MUST be fully isolated from caller-visible state."

The existing `state-draft.ts` + `EffectCursor.tracker` infrastructure already implements this carve-out. This spec extends the same principle to the `applyMove` return path: `progressedState` at line 1355 is a fresh object produced within `applyTrustedMove`'s scope — assigning hash fields directly on it before return is a scoped internal mutation with no aliasing risk.

Foundation 8 (Determinism): No behavioral change — same state, same hash, same output.

Foundation 15 (Architectural Completeness): Addresses the root cause (unnecessary full-object spreads for field assignment) rather than patching symptoms.

## Proposed Design

### Phase 1: Profiling Baseline (no code changes)

Run `perf record --perf-basic-prof` on the FITL 3-seed benchmark. Use `perf report` with call-graph annotation to attribute the remaining `CreateDataProperty` / `CloneObjectIC` CPU to specific call sites.

**Deliverable**: A table mapping each spread category (apply-move hash assignment, phase-advance turnOrderState, effects-control result, EffectCursor) to measured CPU %.

**Gate**: If no single category exceeds 2% CPU, CLOSE the spec as "not actionable — remaining overhead is distributed across many small efficient spreads."

### Phase 2: apply-move.ts hash assignment (targeted fix)

**Problem**: Two sites in `apply-move.ts` spread the entire `GameState` to add hash fields:

```typescript
// Line 1355-1359: applyTrustedMove return path
const stateWithHash = {
  ...progressedState,
  stateHash: reconciledHash,
  _runningHash: reconciledHash,
};

// Line 1561-1564: commitSimultaneousMoves return path
const finalState = {
  ...progressedState,
  stateHash: computeFullHash(table, progressedState),
};
```

Each spread copies ~19 top-level fields to assign 1-2. This runs once per move (200+ times per game).

**Fix**: Cast `progressedState` to `MutableGameState` (imported from `state-draft.ts`) and assign hash fields directly. This is safe because `progressedState` is a fresh object produced within the current scope — it is not the caller's input state and has no external aliases:

```typescript
import type { MutableGameState } from './state-draft.js';

// Line 1355-1359: replace spread with direct assignment
const stateWithHash = progressedState as MutableGameState;
stateWithHash.stateHash = reconciledHash;
stateWithHash._runningHash = reconciledHash;

// Line 1561-1564: same pattern
const finalState = progressedState as MutableGameState;
finalState.stateHash = computeFullHash(table, progressedState);
```

**Safety justification**:
- `progressedState` is returned by `advanceToDecisionPoint` → fresh object, not caller's input
- The mutation occurs immediately before return — no intermediate readers observe the pre-hash state
- `MutableGameState` is the same type as `GameState` with `readonly` removed — no hidden class change
- Foundation 11 permits this: scoped mutation, isolated, immediately before finalization

### Phase 3: Conditional — phase-advance.ts turnOrderState (profile-gated)

If Phase 1 profiling shows `phase-advance.ts` turnOrderState spreads exceed 3% CPU:

- Evaluate whether phase-advance functions can receive `MutableGameState` from their callers (they already receive state that has passed through mutable scopes)
- If so, assign turnOrderState fields directly instead of spreading nested objects
- Same benchmark gate applies

If profiling shows < 3%: close Phase 3 as not actionable.

## Scope

### Mutable
- `packages/engine/src/kernel/apply-move.ts` — lines 1355-1359 and 1561-1564 (Phase 2)
- `packages/engine/src/kernel/phase-advance.ts` — conditional (Phase 3 only, if profiling warrants)

### Immutable
- `packages/engine/src/kernel/state-draft.ts` — existing infrastructure, no changes needed
- `packages/engine/src/kernel/effects-token.ts` — already uses mutable path
- `packages/engine/src/kernel/effects-var.ts` — already uses mutable path
- `packages/engine/src/kernel/effects-choice.ts` — already uses mutable path
- `packages/engine/src/kernel/effects-control.ts` — small-object spreads, V8-efficient
- `packages/engine/src/kernel/effect-dispatch.ts` — cursor reuse already optimal
- `packages/engine/src/kernel/eval-condition.ts` — reads only
- `packages/engine/src/kernel/eval-value.ts` — reads only
- `packages/engine/src/kernel/resolve-ref.ts` — reads only
- Game spec data (`data/games/*`)

## Testing Strategy

1. **Isolation regression test**: Apply a move, verify the input state is reference-identical before and after (Foundation 11 contract — the caller's state must not be modified).
2. **Determinism test**: Apply the same move sequence, assert identical finalized states including hash values (Foundation 8).
3. **Replay test**: Full game replay produces identical traces (Foundation 9).
4. **Benchmark gate**: FITL 3-seed benchmark must show measurable improvement. If Phase 2 does not improve the metric, revert and close the spec.

## Expected Impact

Conservative: 1-3% reduction in `combined_duration_ms`. The two `apply-move.ts` spreads are per-move costs that copy ~19 fields unnecessarily. Eliminating them saves ~400 bytes of allocation per move × 600 moves = ~240KB of avoided allocation per benchmark run, plus reduced GC pressure.

The remaining ~12% of spread-attributed CPU is likely irreducible — distributed across many small, efficient spreads that V8 handles well (global lesson: "V8 JIT optimizes object spreads efficiently").

## Resolution

- Resolution date: 2026-04-03
- Result: closed as not actionable after `perf record --perf-basic-prof` attribution against the FITL benchmark.
- Profiling summary:
  - `apply-move.ts` hash-assignment spreads did not appear above the focused report floor and are below the ticket gate for follow-up work.
  - `phase-advance.ts` turn-order spreads likewise did not appear above the focused report floor and are below the conditional gate for follow-up work.
  - remaining spread-builtin time is dominated by other call chains centered on query and condition evaluation rather than the spec's proposed mutation sites.
- Decision:
  - do not proceed with the scoped direct-mutation changes proposed here;
  - archive this spec and leave `63PROFSPR-002` / `63PROFSPR-003` inactive unless a future profiling pass with stronger evidence reopens them.
