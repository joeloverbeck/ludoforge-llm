# Spec 112 — Global Marker State in Agent Policy Surface

## Status

Proposed

## Priority

High

## Complexity

Small

## Dependencies

None.

**Related specs**:
- `archive/specs/111-multi-step-preview-for-granted-operations.md` — adds bounded second-step preview for granted operations
- `specs/113-preview-state-policy-surface.md` — broadens what policy scoring can observe from previewed post-move state beyond immediate margin and vars

## Problem

The Agent Policy DSL exposes global variables (`var.global.*`), per-player variables (`var.player.*`), victory metrics, active card properties, zone properties, and token aggregations. It does NOT expose **global marker states** — the lattice-based state values that represent capabilities, leader effects, and other persistent game-rule modifiers.

In FITL, 48 event card sides set global markers (capabilities like Booby Traps, Cadres, Main Force Battalions). These markers permanently modify game rules — making sweeps risky, limiting ambushes, granting free operations. Their strategic value is enormous: human FITL players consider capability acquisition one of the most important decisions in the game.

The agent cannot observe global marker states because `globalMarker.*` is not a recognized reference family in the policy surface. This means:

1. **The agent cannot define state features based on capability state.** It can't express "how many VC-favorable capabilities are active?" or "is Booby Traps currently shaded?"

2. **The preview cannot capture the delta from setting a capability.** When the preview simulates an event that sets a global marker, the margin doesn't change (capabilities affect future rules, not immediate state). Without a global-marker-based state feature, no consideration sees any change. This is the capability-specific subset of the broader preview-surface observability gap described in `specs/113-preview-state-policy-surface.md`.

3. **Evolution cannot learn capability values.** Even with tunable parameters, the agent has no observable signal to attach weights to. You can't learn the value of something you can't see.

### How Human Players Handle This

Human players observe the capability track (a physical board component) and use pattern recognition: "Booby Traps is active — sweeps are risky for COIN." They don't simulate future turns; they read current state and apply learned heuristics.

The agent equivalent is: observe global marker states + apply learned weights. The observation mechanism is missing.

### Evidence from Campaign

In the fitl-vc-agent-evolution campaign (18 experiments), annotation-based event bonuses (weights 2-3) could not bridge the 20-point preview gap between terror (immediate margin improvement) and capability events (zero margin change). The root cause isn't insufficient bonus weight — it's that the agent cannot observe the capability state change at all. The bonus is a static "capabilities are generally good" signal, not a state-aware "this specific capability just became active" signal.

## Goals

1. Add `globalMarker.<markerId>` as a reference family in the agent policy surface
2. Return the current marker state as a string (e.g., `"shaded"`, `"unshaded"`, `"inactive"`)
3. Support observability control (public/seatVisible/hidden) per marker, consistent with other surface families
4. Enable preview to capture marker state deltas (setting a capability changes the observable feature)

## Non-Goals

- No changes to how global markers work in the kernel (read/write/flip/shift)
- No automatic capability valuation (the agent profile decides which markers to track and what weights to assign — game-specific strategy belongs in YAML, not engine code)
- No new DSL operators (existing expression operators like `eq`, `boolToNumber` suffice for marker state checks)
- No per-game annotations or heuristic scoring (this spec provides the observation mechanism; valuation is the profile's responsibility)

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | Generic mechanism — exposes any game's global markers, not FITL-specific capabilities |
| 2 — Evolution-First | Enables evolution to discover capability values by providing observable state features |
| 4 — Authoritative State and Observer Views | Extends the observer view to include global marker state, controlled by the same visibility system |
| 8 — Determinism | Marker state is deterministic kernel state; reading it is a pure function |
| 14 — No Backwards Compat | New ref family — no migration needed, additive change |
| 15 — Architectural Completeness | Closes the observation gap: the agent can see global vars, per-player vars, zone props, token counts, card annotations, but NOT global marker state |

## Scope

### What to Change

**1. Add `globalMarker` to `SurfaceRefFamily` union** (`types-core.ts:338-347`)

```typescript
export type SurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'
  | 'activeCardTag'
  | 'activeCardMetadata'
  | 'activeCardAnnotation'
  | 'globalMarker';            // NEW
```

**2. Add `globalMarkers` to `CompiledSurfaceCatalog`** (`types-core.ts:548-560`)

```typescript
export interface CompiledSurfaceCatalog {
  // ... existing fields ...
  readonly globalMarkers: Readonly<Record<string, CompiledSurfaceVisibility>>;
}
```

Pattern follows `globalVars: Readonly<Record<string, CompiledSurfaceVisibility>>`.

**3. Parse `globalMarker.*` refs in policy surface** (`policy-surface.ts`)

Add a case in `parseAuthoredPolicySurfaceRef` for paths starting with `globalMarker.`:

```typescript
if (refPath.startsWith('globalMarker.')) {
  const markerId = refPath.slice('globalMarker.'.length);
  const visibility = catalog.globalMarkers[markerId];
  // ... return CompiledSurfaceRef with family: 'globalMarker', id: markerId
}
```

The ref returns the current marker state as a string. Agent profiles use `eq` to check specific states:

```yaml
stateFeatures:
  boobyTrapsShaded:
    type: number
    expr:
      boolToNumber:
        eq:
          - { ref: globalMarker.cap_boobyTraps }
          - "shaded"
```

**4. Resolve `globalMarker` refs at runtime** (`policy-evaluation-core.ts` or the ref resolution module)

When evaluating a `globalMarker` ref:
```typescript
case 'globalMarker':
  return state.globalMarkers?.[ref.id]
    ?? def.globalMarkerLattices?.find(l => l.id === ref.id)?.defaultState;
```

Returns the string state value. Follows the same pattern as `resolve-ref.ts:428-444` in the kernel.

**5. Add observability defaults** (`compile-agents.ts:160-177`)

Default visibility for global markers: `public` (most games treat the capability track as open information). Override via observability config:

```yaml
observability:
  observers:
    currentPlayer:
      surfaces:
        globalMarkers:
          _default: public
          cap_secretIntel:
            current: hidden
```

**6. Update schema validation** (`schemas-core.ts:637-656`)

Add `z.literal('globalMarker')` to `CompiledSurfaceRefBaseSchema.family` union.

**7. Update compile-agents ref validation** (`compile-agents.ts`)

During compilation, validate that `globalMarker.<markerId>` references an actual `globalMarkerLattice` defined in the GameDef. Emit a diagnostic if the marker ID is unknown.

### Mutable Files

- `packages/engine/src/kernel/types-core.ts` (modify) — `SurfaceRefFamily` union, `CompiledSurfaceCatalog` interface
- `packages/engine/src/kernel/schemas-core.ts` (modify) — schema validation for new family
- `packages/engine/src/agents/policy-surface.ts` (modify) — parse `globalMarker.*` refs
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — resolve `globalMarker` refs at runtime
- `packages/engine/src/cnl/compile-agents.ts` (modify) — validate marker IDs, add observability defaults
- `packages/engine/src/contracts/policy-contract.ts` (modify, if surface families are enumerated there)
- `docs/agent-dsl-cookbook.md` (modify) — document `globalMarker.*` reference family

### Immutable

- `packages/engine/src/kernel/effects-choice.ts` — global marker read/write unchanged
- `packages/engine/src/kernel/resolve-ref.ts` — kernel ref resolution unchanged
- `packages/engine/src/kernel/initial-state.ts` — initialization unchanged
- Game spec data (no changes needed — observability config gets a new optional section)

## Usage Example

After implementation, a VC agent profile can observe and value capabilities:

```yaml
# In 92-agents.md
stateFeatures:
  boobyTrapsActive:
    type: number
    expr:
      boolToNumber:
        eq:
          - { ref: globalMarker.cap_boobyTraps }
          - "shaded"
  cadresActive:
    type: number
    expr:
      boolToNumber:
        eq:
          - { ref: globalMarker.cap_cadres }
          - "shaded"
  vcFriendlyCapabilities:
    type: number
    expr:
      add:
        - { ref: feature.boobyTrapsActive }
        - { ref: feature.cadresActive }

parameters:
  capabilityWeight:
    type: number
    default: 3
    min: 0
    max: 20
    tunable: true

considerations:
  valueCapabilities:
    scopes: [move]
    weight:
      param: capabilityWeight
    value:
      ref: feature.vcFriendlyCapabilities
```

With preview: when the agent evaluates "play Booby Traps shaded," the preview simulates the event, the global marker changes from default to "shaded," `boobyTrapsActive` goes from 0 to 1, and the consideration contributes `capabilityWeight * 1`. The weight is tunable by evolution.

## Testing Strategy

1. **Unit test: globalMarker ref compiles** — Write a state feature using `ref: globalMarker.<id>`. Assert it compiles without errors when the marker ID exists in `globalMarkerLattices`.

2. **Unit test: unknown marker ID rejected** — Assert compilation diagnostic when referencing a non-existent marker ID.

3. **Unit test: runtime resolution returns current state** — Set a global marker to a specific state, evaluate the ref, assert it returns the state string.

4. **Unit test: runtime resolution returns default when unset** — Evaluate a global marker ref when the marker hasn't been explicitly set. Assert it returns the lattice's `defaultState`.

5. **Unit test: preview captures marker delta** — Evaluate a candidate that sets a global marker. Assert the preview state has the updated marker value and the state feature reflects the change.

6. **Unit test: observability controls visibility** — Configure a marker as hidden. Assert the ref resolves to undefined (or equivalent hidden behavior) for agents with that observer.

7. **Integration test: FITL capability valuation** — Add a `capabilityWeight` consideration to vc-evolved. Run a game where Booby Traps is active. Verify the state feature correctly reads the marker state and the preview captures the delta when evaluating the event.

## Expected Impact

Enables agents to observe and value global marker state changes. Combined with tunable parameters and evolution, agents can learn which capabilities are worth acquiring — matching how human players use pattern recognition on the capability track. This is the observation-based complement to Spec 111's preview-depth improvement for granted operations: Spec 112 lets agents value capability-setting events, while Spec 111 lets agents value operation-granting events.
