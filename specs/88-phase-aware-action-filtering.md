# Spec 88 -- Phase-Aware Action Filtering

## Status

Proposed

## Problem

`enumerateRawLegalMoves` iterates ALL `def.actions` (45 for FITL) on every
game step, running `resolveActionApplicabilityPreflight` for each. Many
actions are inapplicable in the current phase:

- ~10 coup-specific actions (`coupPacifyUS`, `coupAgitateVC`,
  `coupArvnRedeployMandatory`, etc.) are only valid during coup phases.
- ~20 operation/special-activity actions (`train`, `sweep`, `assault`, etc.)
  are only valid during the main phase.
- Event and pass actions span multiple phases.

Currently, there is no phase-based pre-filtering -- every action goes through
the full preflight on every step regardless of phase. The preflight evaluates
executor resolution, selector contracts, pipeline dispatch, and preconditions.
While individual preflights are cheap (<0.5ms), the cumulative cost of ~30
unnecessary preflights per step over 600 steps is significant.

More importantly, this creates an **architectural gap**: the kernel has no
mechanism to express which actions are applicable in which phases, forcing
runtime evaluation of a compile-time-determinable property.

## Objective

Pre-compute phase-to-action mappings so that `enumerateRawLegalMoves` only
iterates actions applicable to the current phase.

## Design

### Static Phase Applicability Analysis

At `GameDefRuntime` creation time (or via a module-level WeakMap cache keyed
on `def.actions`), analyze each action to determine which phases it can be
active in.

**Analysis inputs** (all available at compile time / runtime init):

1. **Pipeline phase restrictions**: Each `ActionPipelineDef` profile may
   declare phase restrictions in its predicates. If ALL profiles for an action
   restrict to specific phases, the action is phase-restricted.

2. **Turn structure phase membership**: Actions are declared within phase
   definitions in `def.turnStructure.phases` and `def.turnStructure.interrupts`.
   The phase that CONTAINS an action's definition determines its phase scope.

3. **Action preconditions**: Some preconditions explicitly check the current
   phase (e.g., `{ op: '==', left: { ref: 'currentPhase' }, right: 'coup' }`).
   Static analysis of simple phase-equality conditions can tighten the mapping.

**Analysis output**:

```typescript
interface PhaseActionIndex {
  /** Actions known to be valid only in specific phases. */
  readonly actionsByPhase: ReadonlyMap<string, readonly ActionDef[]>;
  /** Actions valid in ALL phases (no phase restriction detected). */
  readonly universalActions: readonly ActionDef[];
}
```

For a given `state.currentPhase`, the enumeration iterates:
`[...universalActions, ...(actionsByPhase.get(currentPhase) ?? [])]`

### Cache Strategy

**V8 constraint**: Adding fields to `GameDefRuntime` causes 2-7% V8 hidden
class deoptimization (proven across 5 experiments). The phase index MUST use
the existing module-level WeakMap cache pattern from `def-lookup.ts`.

```typescript
// In a new file: phase-action-index.ts (or in def-lookup.ts)
const phaseActionIndexCache = new WeakMap<readonly ActionDef[], PhaseActionIndex>();

export function getPhaseActionIndex(def: GameDef): PhaseActionIndex {
  let cached = phaseActionIndexCache.get(def.actions);
  if (cached === undefined) {
    cached = buildPhaseActionIndex(def);
    phaseActionIndexCache.set(def.actions, cached);
  }
  return cached;
}
```

This follows the exact pattern of `getZoneMap`, `getLatticeMap`, and
`seatResolutionCache` -- all proven to work without V8 deopt because the
WeakMap is keyed on a STABLE array reference, not created in the hot loop.

### Enumeration Integration

In `enumerateRawLegalMoves`, replace the `for (const action of def.actions)`
loop with:

```typescript
const phaseIndex = getPhaseActionIndex(def);
const phaseActions = phaseIndex.actionsByPhase.get(String(state.currentPhase)) ?? [];
const actionsToEnumerate = [...phaseIndex.universalActions, ...phaseActions];

for (const action of actionsToEnumerate) {
  // ... existing preflight + enumeration logic
}
```

### Conservative Analysis

The analysis MUST be conservative -- if phase applicability cannot be
determined statically, the action goes into `universalActions` (always
iterated). This ensures correctness: no action is ever incorrectly excluded.

Actions classified as universal:
- Actions with no pipeline and no phase-related precondition.
- Actions whose pipeline predicates reference dynamic state (not just phase).
- `pass` and `event` (applicable in multiple phases).

Actions classified as phase-restricted:
- Coup actions whose pipeline predicates check `currentPhase === 'coup*'`.
- Actions whose `pre` condition is a simple phase-equality check.
- Actions declared exclusively within a single phase's action list.

### Fallback

If the analysis produces an empty `actionsByPhase` (no restrictions detected),
the optimization has zero effect -- `universalActions` contains all actions and
the loop iterates them all. This is the safe default.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Phase filtering uses the generic phase system, not game IDs |
| F5 (Determinism) | Conservative analysis -- never excludes an action that could be legal |
| F6 (Bounded Computation) | Tighter iteration bounds: O(phase_actions) vs O(all_actions) |
| F8 (Compiler-Kernel Boundary) | Phase restrictions are compile-time properties analyzed at runtime init |
| F9 (No Backwards Compat) | Clean replacement, no fallback paths |
| F10 (Completeness) | Addresses the root cause (unnecessary iteration) |
| F11 (Testing as Proof) | Parity test proves same legal moves in all phases |

## Acceptance Criteria

1. `getPhaseActionIndex(def)` returns a correct phase-action mapping for FITL
   (coup actions restricted to coup phases, operations to main phase).
2. `enumerateRawLegalMoves` only iterates phase-applicable actions.
3. All existing tests pass (including `classified-move-parity`,
   `no-hardcoded FITL audit`).
4. The phase index uses a module-level WeakMap cache (NOT on GameDefRuntime).
5. Conservative analysis: any action whose phase cannot be statically
   determined is included in `universalActions`.
6. FITL benchmark shows measurable improvement (target: >3% reduction in
   `simLegalMoves`).

## Estimated Impact

For FITL with ~10 coup-specific actions and ~20 main-phase operations:
- During main phase: skip 10 coup actions (22% fewer iterations).
- During coup phases: skip 20 operation actions (44% fewer iterations).

Estimated 10-20% reduction in enumeration preflight cost.

## Files to Create

- `packages/engine/src/kernel/phase-action-index.ts` -- analysis + cache

## Files to Modify

- `packages/engine/src/kernel/legal-moves.ts` -- use phase index in enumeration
- `packages/engine/test/` -- phase index unit tests
