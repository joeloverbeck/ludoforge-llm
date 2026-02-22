# ANIMDIAG-001: Diagnostic Log Entry Types

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Animation debugging is effectively blind. When tokens don't visually move between zones or appear face-down in wrong zones, there's no structured data to trace what the animation pipeline decided at each stage. A full-pipeline diagnostic logger requires well-defined types for every decision point. This ticket adds the type definitions that all subsequent ANIMDIAG tickets depend on.

## Assumption Reassessment (2026-02-22)

1. `animation-types.ts` exists at `packages/runner/src/animation/animation-types.ts` and already exports animation descriptor types — confirmed.
2. `animation-logger.ts` already defines stage-level log entry interfaces (`TraceReceivedLogEntry`, `DescriptorsMappedLogEntry`, `TimelineBuiltLogEntry`, `QueueEventLogEntry`) — confirmed. This ticket must add *pipeline diagnostics* types without duplicating existing stage summary concepts.
3. Using `unknown[]` for trace/descriptors is weaker than needed. The current pipeline data (`EffectTraceEntry`, `AnimationDescriptor`) is already serializable and should remain strongly typed.
4. Types must use `readonly` fields to match the project's immutability convention.

## Architecture Check

1. A dedicated module `animation-diagnostics.ts` is cleaner than adding diagnostic/buffer contracts to `animation-types.ts`; it keeps animation descriptor modeling separate from observability/logging concerns.
2. No engine changes — purely runner-layer UI/debug infrastructure. No GameSpecDoc/GameDef boundary concerns.
3. No backwards-compatibility shims — these are net-new additive types with no existing consumers yet.
4. Prefer strongly-typed diagnostics (`EffectTraceEntry[]`, `AnimationDescriptor[]`) over `unknown[]` to keep the logger/buffer contract explicit and extensible.

## What to Change

### 1. Add diagnostic log entry types in a new diagnostics module

Create `packages/runner/src/animation/animation-diagnostics.ts` and define:

- `SpriteResolutionEntry` — records whether a sprite was found for a descriptor, the container type (existing vs ephemeral), and position. Includes `reason` string when `resolved=false`.
- `EphemeralCreatedEntry` — records when an ephemeral sprite container is created, capturing tokenId and dimensions.
- `TweenLogEntry` — records each tween created: descriptor kind, preset name, duration, from/to positions, and face state changes.
- `FaceControllerCallEntry` — records each `setFaceUp()` call with the tokenId, boolean value, and context string identifying the call site (e.g. `'card-deal-to-shared-mid-arc'`).
- `TokenVisibilityInitEntry` — records when a token's alpha is set to 0 before animation starts.
- `DiagnosticBatch` — the top-level container for one animation processing cycle. Contains a batch ID, ISO timestamp, setup flag, trace entries (`readonly EffectTraceEntry[]`) and descriptors (`readonly AnimationDescriptor[]`), skipped count, and arrays of all the above entry types. Also includes an optional `queueEvent` and a `warnings` array.
- `DiagnosticQueueEvent` / `DiagnosticQueueEventType` — queue metadata captured per batch.

All fields must be `readonly`.

### 2. Export diagnostics types from the animation barrel

Update `packages/runner/src/animation/index.ts` to export the new diagnostics module.

## Files to Touch

- `packages/runner/src/animation/animation-diagnostics.ts` (new)
- `packages/runner/src/animation/index.ts` (modify)

## Out of Scope

- Implementation of the diagnostic buffer (ANIMDIAG-002)
- Logger interface changes (ANIMDIAG-003)
- Any runtime behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. New types are importable and usable in test files without type errors.
2. `DiagnosticBatch` can be constructed as a literal object conforming to the interface.
3. New diagnostics types are exported from `packages/runner/src/animation/index.ts`.
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All new types use `readonly` fields — no mutable properties.
2. Existing animation descriptor modeling remains separate from diagnostics modeling.
3. No runtime behavior changes — type-only additions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-diagnostics.test.ts` — add type-level/runtime-shape assertions confirming the new interfaces are importable and constructible.
2. `packages/runner/test/animation/animation-types.test.ts` — keep unchanged unless export-level assertions are easier to host there.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-22
- What changed:
  - Added `packages/runner/src/animation/animation-diagnostics.ts` with immutable diagnostic entry contracts and `DiagnosticBatch`.
  - Exported diagnostics types via `packages/runner/src/animation/index.ts`.
  - Added `packages/runner/test/animation/animation-diagnostics.test.ts` validating type constructibility/importability.
- Deviations from original plan:
  - Implemented diagnostics in a dedicated `animation-diagnostics.ts` module instead of appending to `animation-types.ts`.
  - Replaced `unknown[]` trace/descriptor fields with strong types (`EffectTraceEntry[]`, `AnimationDescriptor[]`) for cleaner contracts.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner test` passed (137 files, 1176 tests).
  - `pnpm -F @ludoforge/runner lint` passed.
