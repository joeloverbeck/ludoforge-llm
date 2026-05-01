# 151DECSTACSER-001: Add Serialized* decision-stack types and minimal codecs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: Yes — kernel types and minimal serialization wiring (`packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/microturn/types.ts`, `packages/engine/src/kernel/serde.ts`)
**Deps**: `archive/specs/151-decision-stack-serialization-canonicality.md`

## Problem

The kernel's `SuspendedEffectFrameSnapshot` and surrounding decision-stack types contain nested `GameState` and `Rng` carriers whose serialized form has no explicit type. Today the only thing producing the JSON-safe shape is the generic `sanitizeNestedBigInts` walker in `kernel/serde.ts`, which converts BigInts wherever it finds them — opaque to the type system. Without `Serialized*` sibling types, the explicit serializer/deserializer pair from spec 151 has no compile-time-checked target shape, and a future schema field that adds a BigInt would silently piggyback on the walker. This ticket establishes the typed targets and the minimum `serde.ts` recursion required for the live `SerializedGameState.decisionStack` contract to typecheck.

## Assumption Reassessment (2026-05-01)

1. `SuspendedEffectFrameSnapshot` is at `packages/engine/src/kernel/microturn/types.ts:140-148` with 7 fields (`state`, `rng`, `actorPlayer`, `bindings`, `freeOperationOverlay`, `leaf`, `resumeStack`) — confirmed during spec 151 reassessment.
2. `DecisionStackFrame` is at `packages/engine/src/kernel/microturn/types.ts:205-221` with 6 fields, including `effectFrame: EffectExecutionFrameSnapshot`.
3. `EffectExecutionFrameSnapshot` is at `packages/engine/src/kernel/microturn/types.ts:63-70` with `suspendedFrame?: SuspendedEffectFrameSnapshot`.
4. `SerializedGameState` and `SerializedRngState` already exist in `packages/engine/src/kernel/types-core.ts`. `SerializedRng` (the wrapped form mirroring `Rng = { state: RngState }`) does NOT exist yet.
5. `Rng` (`types-core.ts:76-78`) is the wrapper `{ state: RngState }`; `RngState` (`types-core.ts:70-74`) is the flat `{ algorithm, version, state: bigint[] }`. `GameState.rng` is `RngState` (flat); `SuspendedEffectFrameSnapshot.rng` is `Rng` (wrapped). The new `SerializedRng` mirrors the wrapper.
6. Live typecheck proved the original type-only split was not Foundation-aligned: once `SerializedGameState.decisionStack` is narrowed to `SerializedDecisionStackFrame[]`, `serde.ts` and existing typed serde fixtures cannot keep spreading raw `DecisionStackFrame[]`. Per F14/F15, this ticket absorbs the minimum serializer/deserializer wiring from 002 needed to keep the repo in a coherent state.

## Architecture Check

1. The Serialized* siblings live adjacent to their unwrapped counterparts in `microturn/types.ts` (matching the existing convention where `SerializedGameState` lives next to `GameState` in `types-core.ts`). `SerializedRng` lives in `types-core.ts` next to `Rng`. Each Serialized* sibling enumerates every field explicitly, so the type system rejects a nested `GameState`/`Rng` field appearing in a `Serialized*` shape — no walker safety net needed.
2. F1 preserved: nothing game-specific. The types are generic kernel state shapes.
3. F14 preserved: no compatibility alias is introduced. The generic walkers remain for the later deletion ticket, but decision-stack serialization no longer depends on raw inherited frame types.
4. F15 preserved: the type contract and runtime serializer are updated together because the live repo cannot compile with a type-only serialized decision stack.

## What to Change

### 1. `packages/engine/src/kernel/types-core.ts`

Add `SerializedRng` immediately after the existing `Rng` interface (line 78):

```ts
export interface SerializedRng {
  readonly state: SerializedRngState;
}
```

The existing `SerializedRngState` (already exported) covers the flat form; `SerializedRng` is the wrapper variant used by `SuspendedEffectFrameSnapshot.rng`.

### 2. `packages/engine/src/kernel/microturn/types.ts`

Add three Serialized* sibling interfaces, each placed adjacent to its unwrapped counterpart:

```ts
// Adjacent to EffectExecutionFrameSnapshot (line 63-70):
export interface SerializedEffectExecutionFrameSnapshot {
  readonly programCounter: number;
  readonly boundedIterationCursors: Readonly<Record<string, number>>;
  readonly localBindings: Readonly<Record<string, MoveParamValue>>;
  readonly pendingTriggerQueue: readonly TriggerId[];
  readonly decisionHistory?: readonly CompoundTurnTraceEntry[];
  readonly suspendedFrame?: SerializedSuspendedEffectFrameSnapshot;
}

// Adjacent to SuspendedEffectFrameSnapshot (line 140-148):
export interface SerializedSuspendedEffectFrameSnapshot {
  readonly state: SerializedGameState;             // recursively serialized (BigInt carrier)
  readonly rng: SerializedRng;                     // wrapped Rng — descends into rng.state.state[]
  readonly actorPlayer: GameState['activePlayer']; // already JSON-safe
  readonly bindings: Readonly<Record<string, unknown>>; // see ticket 005 for BigInt-safety lock-in
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay; // already JSON-safe
  readonly leaf: SuspendedDecisionLeaf;            // already JSON-safe
  readonly resumeStack: readonly SuspendedResumeFrame[]; // already JSON-safe
}

// Adjacent to DecisionStackFrame (line 205-221):
export interface SerializedDecisionStackFrame {
  readonly frameId: DecisionFrameId;
  readonly parentFrameId: DecisionFrameId | null;
  readonly turnId: TurnId;
  readonly context: DecisionContext;
  readonly continuationBindings?: Readonly<Record<DecisionKey, MoveParamValue>>;
  readonly effectFrame: SerializedEffectExecutionFrameSnapshot;
}
```

Add an import for `SerializedGameState` and `SerializedRng` from `../types-core.js` if not already imported.

### 3. Wire SerializedGameState's decisionStack field

Currently `SerializedGameState` (`types-core.ts:1917-1927`) inherits `decisionStack: readonly DecisionStackFrame[]` from `GameState` via `Omit<...>`. Override by adding `decisionStack` and (if present) any other state-bearing fields to the explicit override block, replacing the inherited unwrapped types with the new `Serialized*` siblings:

```ts
export interface SerializedGameState extends Omit<GameState,
  'rng' | 'stateHash' | '_runningHash' | 'reveals' | 'globalMarkers'
  | 'activeLastingEffects' | 'interruptPhaseStack' | 'decisionStack'
> {
  // existing overrides
  readonly decisionStack: readonly SerializedDecisionStackFrame[];
}
```

Import `SerializedDecisionStackFrame` from `./microturn/types.js`.

### 4. Add the minimal decision-stack codecs in `packages/engine/src/kernel/serde.ts`

Add explicit helpers for the new serialized types and wire them into `serializeGameState` / `deserializeGameState`:

- `serializeRng` / `deserializeRng` for the wrapped `Rng`.
- `serializeSuspendedFrame` / `deserializeSuspendedFrame`.
- `serializeEffectFrame` / `deserializeEffectFrame`.
- `serializeDecisionStack` / `deserializeDecisionStack`.
- `serializeGameState` omits `_runningHash`, serializes top-level flat `rng` as before, and serializes `decisionStack` through `serializeDecisionStack`.
- `deserializeGameState` deserializes `decisionStack` through `deserializeDecisionStack` when present.

The walker functions and their final defensive invocations remain for later tickets. This ticket only removes raw decision-stack inheritance from the typed serialized shape and makes the current serializer satisfy that type.

### 5. Existing serde fixture type fallout

Update existing typed `SerializedGameState` test fixtures that previously spread raw `GameState` values so they start from `serializeGameState(gameStateFixture)` before overriding serialized fields. This is not a new dedicated test surface; it is the minimum fixture maintenance required by the corrected serialized type.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `SerializedRng`, extend `SerializedGameState`'s `Omit` and add `decisionStack` override)
- `packages/engine/src/kernel/microturn/types.ts` (modify — add `SerializedEffectExecutionFrameSnapshot`, `SerializedSuspendedEffectFrameSnapshot`, `SerializedDecisionStackFrame`)
- `packages/engine/src/kernel/serde.ts` (modify — add minimal explicit decision-stack serializers/deserializers and wire them into `serializeGameState` / `deserializeGameState`)
- `packages/engine/test/unit/serde.test.ts` (modify — keep existing typed serialized fixtures aligned with the corrected `SerializedGameState` shape)

## Out of Scope

- Removing the remaining generic walker invocations from `serializeGameState` / `deserializeGameState` — narrowed 002 owns the final invocation cutover.
- Schema (Zod) updates — 003 owns those.
- Deleting walker functions — 004 owns the deletion.
- New dedicated round-trip/schema/walker tests — 005 owns the test additions.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine typecheck` succeeds — the new types compile without circular-import errors.
2. `pnpm -F @ludoforge/engine build` succeeds — the new types emit cleanly.
3. Existing suite: `pnpm -F @ludoforge/engine test` — no behavioral change yet (walker still active), so all existing tests continue to pass.

### Invariants

1. Every field of `SuspendedEffectFrameSnapshot` has an explicit counterpart in `SerializedSuspendedEffectFrameSnapshot` — adding a future field to the unwrapped type triggers a TS error in the serialized type until mirrored.
2. `SerializedGameState.decisionStack` is typed as `readonly SerializedDecisionStackFrame[]`, NOT `readonly DecisionStackFrame[]` — the type system would reject a raw `DecisionStackFrame` in a serialized payload.
3. `serde.ts` serializes/deserializes decision-stack frames through the new `Serialized*` sibling types rather than by spreading raw frame state into `SerializedGameState`.

## Test Plan

### New/Modified Tests

No new dedicated tests. Existing serde tests are adjusted only where their typed serialized fixtures must use the corrected serialized shape.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test`

## Outcome (2026-05-01)

Outcome amended: 2026-05-01 — spec dependency path updated after Spec 151 archival.

Completed with a Foundation-driven boundary correction. The original type-only split was invalid under live `tsc`: once `SerializedGameState.decisionStack` was narrowed to `SerializedDecisionStackFrame[]`, current `serde.ts` and typed serde fixtures could no longer spread raw `DecisionStackFrame[]` into `SerializedGameState`. Per F14/F15, this ticket absorbed the minimum `serde.ts` decision-stack codec wiring from 002 required to keep the serialized type contract and runtime serializer coherent.

What landed:

- Added `SerializedRng` next to `Rng`.
- Added `SerializedEffectExecutionFrameSnapshot`, `SerializedSuspendedEffectFrameSnapshot`, and `SerializedDecisionStackFrame` next to their unwrapped microturn counterparts.
- Updated `SerializedGameState` so `decisionStack` is `readonly SerializedDecisionStackFrame[]` rather than inherited raw `DecisionStackFrame[]`.
- Added explicit decision-stack serialization/deserialization helpers in `kernel/serde.ts` and wired `serializeGameState` / `deserializeGameState` through them.
- Updated existing serde typed fixtures to start from `serializeGameState(gameStateFixture)` instead of spreading raw `GameState` into `SerializedGameState`.

Scope corrections applied:

- `001 is type-only` -> `001 owns the minimum serializer wiring required for the corrected serialized type contract to compile`.
- `002 owns all serializer/deserializer implementation` -> `002 is narrowed to removing the remaining generic walker invocations after 001's wiring`.
- New dedicated tests, Zod schema tightening, walker deletion, and grep enforcement remain deferred to 003-005.

Schema/artifact fallout: none. This ticket does not edit Zod schemas or generated schema artifacts.

Verification set:

- `pnpm -F @ludoforge/engine typecheck` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine test` — passed (`schema:artifacts:check` plus default lane; 59/59 files passed).
