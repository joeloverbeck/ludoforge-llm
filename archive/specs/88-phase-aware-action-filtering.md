# Spec 88 -- Phase-Aware Action Filtering

## Status

COMPLETED

## Problem

`enumerateRawLegalMoves` iterates ALL `def.actions` (45 for FITL) on every
game step. For each action, it calls `resolveActionApplicabilityPreflight`,
which performs several checks before reaching the phase filter:

1. `buildMoveRuntimeBindings()` — allocates a bindings object.
2. Linear `.some()` scan of `def.actionPipelines` — in both the caller
   (line 1207) and inside the preflight (line 93).
3. `evaluateActionSelectorContracts()` — validates actor/executor selectors.
4. Only then: `action.phase.includes(state.currentPhase)` — the actual
   phase check (line 112).

When the phase check fails, all preceding work is wasted. In FITL, ~30 of 45
actions are inapplicable in any given phase (e.g., ~10 coup actions during
main phase, ~20 operation actions during coup phases). Over 600+ simulation
steps, this accumulates into significant unnecessary computation.

The kernel already has the data to avoid this: every `ActionDef` carries an
explicit `phase: readonly PhaseId[]` array populated by the compiler. The
missing piece is a **phase-to-actions index** that lets the enumeration loop
skip inapplicable actions without entering the preflight at all.

## Objective

Pre-compute a phase-to-actions index so that `enumerateRawLegalMoves` only
iterates actions whose `phase` array includes the current phase.

## Design

### Phase-to-Actions Index

At `GameDef` initialization time (cached via module-level WeakMap), invert
each action's `phase` array into a `Map<PhaseId, ActionDef[]>`:

```typescript
interface PhaseActionIndex {
  readonly actionsByPhase: ReadonlyMap<PhaseId, readonly ActionDef[]>;
}

function buildPhaseActionIndex(def: GameDef): PhaseActionIndex {
  const map = new Map<PhaseId, ActionDef[]>();
  for (const action of def.actions) {
    for (const phaseId of action.phase) {
      let list = map.get(phaseId);
      if (list === undefined) {
        list = [];
        map.set(phaseId, list);
      }
      list.push(action);
    }
  }
  return { actionsByPhase: map };
}
```

No `universalActions` bucket is needed. The compiler enforces that every
action has a non-empty `phase` array (`compile-lowering.ts:842-846` rejects
empty arrays). Actions spanning multiple phases (e.g., `coupPacifyUS` with
`["coupSupport", "honoluluPacify"]`) simply appear in multiple buckets.

### Cache Strategy

**V8 constraint**: Adding fields to `GameDefRuntime` causes 2-7% V8 hidden
class deoptimization (proven across 5 experiments). The phase index MUST use
the existing module-level WeakMap cache pattern from `def-lookup.ts`.

```typescript
// In a new file: phase-action-index.ts
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

This follows the exact pattern of `getZoneMap` and `getLatticeMap` — keyed on
a stable array reference, not created in the hot loop.

### Enumeration Integration

In `enumerateRawLegalMoves`, replace `for (const action of def.actions)` with:

```typescript
const phaseIndex = getPhaseActionIndex(def);
const actionsForPhase = phaseIndex.actionsByPhase.get(state.currentPhase) ?? [];

for (const action of actionsForPhase) {
  // ... existing preflight + enumeration logic
}
```

The same replacement applies to the early-exit trivial-action pass
(lines 1158-1194), which also iterates all `def.actions`.

The preflight's phase check (line 112) becomes redundant for actions obtained
from the index, but SHOULD be retained as a belt-and-suspenders safety check.
Its cost is negligible (~nanoseconds for `.includes()` on a 1-2 element
array) and it guards against future index bugs.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Phase filtering uses the generic phase system, not game IDs |
| F5 (Determinism) | Index is derived from immutable `ActionDef.phase` arrays |
| F6 (Bounded Computation) | Tighter iteration bounds: O(phase_actions) vs O(all_actions) |
| F8 (Compiler-Kernel Boundary) | Phase membership is compiler-assigned; kernel just indexes it |
| F9 (No Backwards Compat) | Clean replacement, no fallback paths |
| F10 (Completeness) | Addresses the root cause (unnecessary iteration and preflight entry) |
| F11 (Testing as Proof) | Parity test proves same legal moves in all phases |

## Acceptance Criteria

1. `getPhaseActionIndex(def)` correctly groups FITL's 45 actions across 7
   phases (43 single-phase actions, 2 dual-phase actions).
2. `enumerateRawLegalMoves` iterates only phase-applicable actions in both
   the main loop and the early-exit trivial-action pass.
3. All existing tests pass (including `classified-move-parity`,
   `no-hardcoded FITL audit`).
4. The phase index uses a module-level WeakMap cache (NOT on GameDefRuntime).
5. The preflight phase check is retained as a safety assertion.

## Estimated Impact

For FITL with 45 actions across 7 phases:
- During main phase: skip ~35 non-main actions (iterate ~10 instead of 45).
- During any coup sub-phase: skip ~30+ non-coup actions.

Per skipped action, the optimization avoids:
- `buildMoveRuntimeBindings()` allocation
- Two linear `.some()` pipeline scans (`def.actionPipelines`)
- `evaluateActionSelectorContracts()` validation
- Function call overhead into `resolveActionApplicabilityPreflight`

Estimated 60-75% reduction in preflight invocations per step.

## Files to Create

- `packages/engine/src/kernel/phase-action-index.ts` — index builder + WeakMap cache

## Files to Modify

- `packages/engine/src/kernel/legal-moves.ts` — use phase index in both enumeration loops
- `packages/engine/test/` — phase index unit tests, enumeration parity tests

## Outcome

Completed: 2026-03-28

What actually changed:
- Added `packages/engine/src/kernel/phase-action-index.ts` as the canonical WeakMap-cached `PhaseId -> ActionDef[]` runtime index keyed by `def.actions`.
- Updated `packages/engine/src/kernel/legal-moves.ts` so both raw enumeration loops derive `actionsForPhase` once and iterate the narrowed phase bucket instead of scanning all actions.
- Retained the phase check in `packages/engine/src/kernel/action-applicability-preflight.ts` as the semantic safety guard.
- Added proof in `packages/engine/test/unit/kernel/phase-action-index.test.ts` and `packages/engine/test/unit/kernel/legal-moves.test.ts`.
- Followed up with the shared action-pipeline lookup cleanup captured separately in archived ticket `88PHAAWAACTFIL-004`.

Deviations from original plan:
- The original split across separate implementation, integration, and test tickets was collapsed in practice into a cleaner architectural unit documented in archived `88PHAAWAACTFIL-001`.
- The anticipated standalone parity test file was not kept as a separate ownership point; the durable proof now lives with the index module tests and `legal-moves` behavior/source-guard tests.

Verification results:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/phase-action-index.test.js`
- `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
