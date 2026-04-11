# 125SURRESCON-001: Extract shared `resolveSurfaceRefValue()` and helpers into `policy-surface.ts`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-surface.ts` (new exports)
**Deps**: None

## Problem

`policy-preview.ts` and `policy-runtime.ts` each implement a `resolveSurface()` function with 8 parallel `ref.family` dispatch chains and 4 near-identical private helper functions (~100-110 lines of duplicated logic). Adding a new surface family requires updating two files with identical logic; forgetting one creates a silent divergence (as happened with `globalMarker`, which exists only in runtime).

This ticket extracts the shared family-dispatch logic and helpers into `policy-surface.ts` so both callers can delegate to a single implementation.

## Assumption Reassessment (2026-04-10)

1. `policy-surface.ts` exists at `packages/engine/src/agents/policy-surface.ts` and already exports shared functions (`buildPolicyVictorySurface`, `getPolicySurfaceVisibility`, `resolvePolicyRoleSelector`, etc.) — confirmed via grep.
2. `CompiledSurfaceRefBase` exists in `packages/engine/src/kernel/types-core.ts` — confirmed via grep.
3. `PolicyValue` is defined as `AgentParameterValue | undefined` at `policy-runtime.ts:37` — confirmed.
4. The 4 duplicated helpers exist in both files with near-identical signatures: `resolvePerPlayerTargetIndex` (preview:436, runtime:380), `resolveSeatVarRef` (preview:482, runtime:400), `resolveActiveCardEntryFromState`/`resolveActiveCardEntry` (preview:456, runtime:412), `resolveActiveCardFamilyValue`/`resolveActiveCardFamily` (preview:467, runtime:423) — confirmed.
5. `globalMarker` family dispatch exists only in `policy-runtime.ts:260-265` — confirmed.

## Architecture Check

1. Extracting shared dispatch into `policy-surface.ts` follows F15 (Architectural Completeness) — completes the extraction that `policy-surface.ts` started when it centralized other shared functions.
2. The shared resolver is game-agnostic — it dispatches on generic `ref.family` values from the compiled surface ref, not game-specific identifiers (F1).
3. No backwards-compatibility shims — callers are updated in subsequent tickets within the same change set (F14).

## What to Change

### 1. Define `SurfaceResolutionContext` interface in `policy-surface.ts`

Create a narrow read-only interface that provides the minimal dependencies both callers need:
- Access to `GameDef` (for `globalMarkerLattices`, token type lookups)
- Access to `GameState` (for reading vars, markers, active card)
- `seatId` and `playerId` for per-player resolution
- Seat resolution index (for `resolvePolicyRoleSelector`)

This must be a focused interface, not a re-export of the full `PolicyEvaluationContext`.

### 2. Extract `resolveSurfaceRefValue()` into `policy-surface.ts`

```typescript
export function resolveSurfaceRefValue(
  state: GameState,
  ref: CompiledSurfaceRefBase,
  seatId: SeatId,
  playerId: PlayerId,
  context: SurfaceResolutionContext,
): PolicyValue;
```

The function implements the family dispatch chain covering all 8+ families: `derivedMetric`, `globalVar`, `perPlayerVar`, `victoryCurrentMargin`, `victoryCurrentRank`, `activeCardAnnotation`, `activeCardIdentity`/`activeCardTag`/`activeCardMetadata`, and `globalMarker`.

### 3. Move the 4 helper functions into `policy-surface.ts`

Move as module-internal (non-exported) functions:
- `resolvePerPlayerTargetIndex()`
- `resolveSeatVarRef()`
- `resolveActiveCardEntry()` (unify the two naming variants)
- `resolveActiveCardFamilyValue()` (unify the two naming variants)

### 4. Export `PolicyValue` from `policy-surface.ts`

Either re-export from `policy-runtime.ts` or move the type definition to `policy-surface.ts` and have `policy-runtime.ts` import from there. Prefer the move to avoid circular dependencies.

### 5. Add unit tests for `resolveSurfaceRefValue()`

Test the shared resolver directly with representative refs from each family. Verify correct raw values for each `(ref.family, state)` combination. Cover at minimum:
- `derivedMetric` — returns computed metric value
- `globalVar` — returns global variable value
- `perPlayerVar` — returns per-player variable for resolved target
- `victoryCurrentMargin` / `victoryCurrentRank` — returns victory surface values
- `activeCardAnnotation` / `activeCardIdentity` / `activeCardTag` / `activeCardMetadata` — returns active card properties
- `globalMarker` — returns marker lattice index

## Files to Touch

- `packages/engine/src/agents/policy-surface.ts` (modify — add `SurfaceResolutionContext`, `resolveSurfaceRefValue()`, 4 helpers, `PolicyValue` export)
- `packages/engine/test/unit/surface-resolution-dispatch.test.ts` (new — unit tests for shared resolver)

## Out of Scope

- Rewiring `policy-runtime.ts` to call the shared resolver (ticket 002)
- Rewiring `policy-preview.ts` to call the shared resolver (ticket 003)
- Changing compiled surface ref types or the compilation pipeline
- Changing the preview outcome classification logic (`ready`/`stochastic`/`unknown`)
- Changing runtime's state-hash-based caching strategy

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests for `resolveSurfaceRefValue()` pass for all family values
2. `globalMarker` family returns correct lattice index value
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `resolveSurfaceRefValue()` is a pure function — same inputs always produce same outputs (F8, F11)
2. No game-specific identifiers in the shared resolver — dispatches on generic `ref.family` values only (F1)
3. `PolicyValue` type definition is available from `policy-surface.ts` without circular imports

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/surface-resolution-dispatch.test.ts` — unit tests for `resolveSurfaceRefValue()` covering all family dispatch branches

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="surface-resolution-dispatch"`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-10
- Changed:
  - extracted shared `PolicyValue`, `SurfaceResolutionContext`, `resolveSurfaceRefValue()`, and the duplicated helper functions into `packages/engine/src/agents/policy-surface.ts`
  - rewired both `packages/engine/src/agents/policy-runtime.ts` and `packages/engine/src/agents/policy-preview.ts` to delegate to the shared resolver
  - updated downstream `PolicyValue` imports in `packages/engine/src/agents/policy-eval.ts` and `packages/engine/src/agents/policy-evaluation-core.ts`
  - added `packages/engine/test/unit/agents/surface-resolution-dispatch.test.ts` for direct shared-resolver coverage
- Deviations from original plan:
  - the runtime and preview rewires originally staged in `125SURRESCON-002` and `125SURRESCON-003` were absorbed here because the shared extraction was not architecturally complete while those duplicate dispatch chains remained live
  - the ticket's `globalMarker` expectation was semantically stale: the live raw contract returns marker-state strings / default-state strings, not a numeric lattice index, so the new direct resolver test asserts the current runtime contract
  - the targeted test command was adapted to the repo's Node test-runner workflow: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/surface-resolution-dispatch.test.js`
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/surface-resolution-dispatch.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
