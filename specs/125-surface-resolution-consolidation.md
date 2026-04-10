# Spec 125 — Surface Resolution Dispatch Consolidation

- **Status**: PROPOSED
- **Priority**: Medium
- **Complexity**: Low
- **Dependencies**: None
- **Origin**: Missing-abstractions analysis of `fitl-policy-agent.test.ts` (Finding F1, 2026-04-10)

## Problem Statement

`policy-preview.ts` and `policy-runtime.ts` each implement a `resolveSurface()` function that maps a compiled surface reference (`ref.family` + `ref.id` + `ref.selector`) to a concrete numeric value given a game state and visibility rules. The two implementations contain 8 parallel `ref.family` dispatch chains and 4 near-identical private helper functions, totaling ~100-110 lines of duplicated logic.

### Evidence

**Dispatch chains** (8 family values each, parallel if-chains):
- `policy-preview.ts` ~lines 152-256 (as of 2026-04-10) — `resolveSurface()` with families: `derivedMetric`, `globalVar`, `perPlayerVar`, `victoryCurrentMargin`, `victoryCurrentRank`, `activeCardAnnotation`, `activeCardIdentity`/`activeCardTag`/`activeCardMetadata`
- `policy-runtime.ts` ~lines 222-315 (as of 2026-04-10) — `resolveSurface()` with the same 8 family values plus `globalMarker` (runtime-only, ~9 lines)

**Duplicated helpers** (~50-60 lines, as of 2026-04-10):
| Function | Preview name | Runtime name |
|----------|-------------|-------------|
| Per-player target resolution | `resolvePerPlayerTargetIndex()` | `resolvePerPlayerTargetIndex()` |
| Seat var resolution | `resolveSeatVarRef()` | `resolveSeatVarRef()` |
| Active card entry fetch | `resolveActiveCardEntryFromState()` | `resolveActiveCardEntry()` |
| Active card value extraction | `resolveActiveCardFamilyValue()` | `resolveActiveCardFamily()` |

The two implementations differ in output handling:
- **Preview** wraps results in `PolicyPreviewSurfaceResolution` (`{ kind: 'value', value: number } | { kind: 'unknown', reason } | { kind: 'unavailable' }`). This wrapping is **interleaved** with family-specific logic: visibility/sampling checks return early with `unavailable`/`unknown` before family dispatch, and each family branch applies its own type coercion (e.g., `boolean → 0/1`, `string → 0`, `non-number → unavailable`) inline.
- **Runtime** returns `PolicyValue` (= `AgentParameterValue | undefined`, which includes `number | string | boolean | string[] | undefined`) directly without wrapping.

The family-specific value resolution (given a `ref.family` and game state, produce a raw value) is identical in both implementations. The difference is confined to the surrounding visibility checks and output type coercion.

### Root Cause

The preview and runtime resolvers were developed as independent modules with separate consumers. `policy-surface.ts` already centralizes some shared functions (`buildPolicyVictorySurface`, `getPolicySurfaceVisibility`, `resolvePolicyRoleSelector`, `parseAuthoredPolicySurfaceRef`, `parseStrategicConditionRef`), but the core resolution dispatch was not extracted because the two callers have different return types.

### Why This Matters

- **Maintenance risk**: Adding a new surface family (e.g., `globalMarker` was added to runtime only) requires updating two files with identical logic. Forgetting one creates a silent divergence.
- **Invariant**: For the same `(ref, state, seatId, playerId)` tuple, preview and runtime resolvers must return identical values (or preview returns `unknown` with a reason when the state is uncertain). Duplication makes this invariant harder to verify.
- **Testing surface**: Two dispatch chains means two sets of tests for the same resolution logic.

## Proposed Solution: Shared Resolution Dispatch

### Design

#### 1. Extract `resolveSurfaceRefValue()` into `policy-surface.ts`

Create a shared function that performs the family dispatch and returns a raw resolved value:

```typescript
// In policy-surface.ts
export function resolveSurfaceRefValue(
  state: GameState,
  ref: CompiledSurfaceRefBase,
  seatId: SeatId,
  playerId: PlayerId,
  context: SurfaceResolutionContext,
): PolicyValue;
```

Where `SurfaceResolutionContext` provides the minimal read-only dependencies both callers already have (e.g., access to active card entries, seat resolver). This context type should be a narrow interface, not a re-export of the full `PolicyEvaluationContext`.

Note: `CompiledSurfaceRefBase` is the shared base interface of `CompiledCurrentSurfaceRef` (runtime) and `CompiledPreviewSurfaceRef` (preview), defined in `kernel/types-core.ts`. It carries `family`, `id`, and `selector` — the only fields needed for family dispatch. `PolicyValue` (= `AgentParameterValue | undefined`) is the raw resolved value type, already defined in `policy-runtime.ts`.

#### 2. Extract shared helpers alongside the dispatch

Move `resolvePerPlayerTargetIndex`, `resolveSeatVarRef`, `resolveActiveCardEntry`, and `resolveActiveCardFamilyValue` into `policy-surface.ts` as private helpers (or module-internal functions) called by `resolveSurfaceRefValue`.

#### 3. Callers handle pre-dispatch checks and post-dispatch interpretation

- **`policy-runtime.ts`**: Calls `resolveSurfaceRefValue()` directly. The raw `PolicyValue` return already matches runtime's needs — no wrapping required.
- **`policy-preview.ts`**: Retains two responsibilities around the shared call:
  1. **Pre-dispatch**: Visibility and hidden-sampling checks (currently ~lines 153-178) that return `{ kind: 'unavailable' }` or `{ kind: 'unknown', reason: 'hidden' }` before family dispatch is reached. These stay in `policy-preview.ts`.
  2. **Post-dispatch**: Per-family type coercion of the raw `PolicyValue` into `PolicyPreviewSurfaceResolution`. Preview surfaces are numeric-only, so the caller maps: `number → { kind: 'value', value }`, `boolean → { kind: 'value', value: bool ? 1 : 0 }`, `string → { kind: 'value', value: 0 }` (for activeCardIdentity/Tag/Metadata), `undefined → { kind: 'unavailable' }`. This coercion logic stays in `policy-preview.ts`.

#### 4. Handle the `globalMarker` asymmetry

`globalMarker` is currently handled only in runtime. The shared resolver includes it. Preview callers will never encounter `globalMarker` refs (they are not compiled into preview surface refs), but if they do, the preview wrapper returns `{ kind: 'unknown', reason: 'unsupported-in-preview' }`.

### What Does NOT Change

- `policy-preview.ts` retains its outcome classification logic (`ready`/`stochastic`/`unknown`)
- `policy-runtime.ts` retains its state-hash-based caching strategy
- `policy-surface.ts`'s existing shared functions are unchanged
- No changes to the compiled surface ref types or the compilation pipeline
- No changes to test assertions — only the internal call graph changes

## Blast Radius

**Source consumers** (no signature changes needed — only internal call graph changes):
- `policy-agent.ts` — imports types from `policy-preview.ts`
- `policy-eval.ts` — imports types from both `policy-preview.ts` and `policy-runtime.ts`
- `policy-evaluation-core.ts` — imports types and factory functions from both
- `cnl/compile-agents.ts` — imports `parseAuthoredPolicySurfaceRef` and `parseStrategicConditionRef` from `policy-surface.ts`

**Test consumer**: `fitl-policy-agent.test.ts` (19 integration tests) — exercises both resolvers through the full evaluation pipeline. All assertions remain unchanged.

## Acceptance Criteria

1. `resolveSurfaceRefValue()` is exported from `policy-surface.ts`
2. Both `policy-preview.ts` and `policy-runtime.ts` delegate family dispatch to `resolveSurfaceRefValue()`
3. All 19 `fitl-policy-agent.test.ts` integration tests pass unchanged
4. No new exported types beyond `SurfaceResolutionContext`

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| **F5** (One Rules Protocol) | Strengthens — single resolution dispatch instead of two parallel implementations |
| **F11** (Immutability) | Aligned — all resolution is read-only projection over game state |
| **F14** (No Backwards Compatibility) | Aligned — no shims needed; callers are updated in the same change |
| **F15** (Architectural Completeness) | Directly addresses — completes the extraction that `policy-surface.ts` started |
| **F16** (Testing as Proof) | Aligned — shared resolver can be tested once; caller-specific wrapping tested per caller |

## Scope

- **In scope**: Extracting shared resolution dispatch + 4 helpers into `policy-surface.ts`. Updating both callers. Updating/consolidating tests.
- **Out of scope**: Changing the compiled surface ref types. Modifying the preview outcome classification logic. Changing caching strategies.

## Testing Strategy

1. **Unit tests for shared resolver**: Test `resolveSurfaceRefValue()` directly with representative refs from each family. Verify correct values for each `(ref.family, state)` combination.
2. **Equivalence test**: For a representative set of refs and states, assert that `policy-preview.ts`'s wrapped result and `policy-runtime.ts`'s direct result both produce the same underlying value.
3. **Existing integration tests**: The `fitl-policy-agent.test.ts` suite (19 tests) exercises both resolvers through the full evaluation pipeline. All must continue passing unchanged.
