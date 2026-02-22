# ANIMDIAG-001: Diagnostic Log Entry Types

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Animation debugging is effectively blind. When tokens don't visually move between zones or appear face-down in wrong zones, there's no structured data to trace what the animation pipeline decided at each stage. A full-pipeline diagnostic logger requires well-defined types for every decision point. This ticket adds the type definitions that all subsequent ANIMDIAG tickets depend on.

## Assumption Reassessment (2026-02-22)

1. `animation-types.ts` exists at `packages/runner/src/animation/animation-types.ts` and already exports animation descriptor types — confirmed.
2. No existing diagnostic log entry types exist in the codebase — types need to be created fresh.
3. Types must use `readonly` fields to match the project's immutability convention.

## Architecture Check

1. Adding types to the existing `animation-types.ts` is cleaner than creating a separate types file — keeps all animation-domain types co-located and discoverable.
2. No engine changes — purely runner-layer UI/debug infrastructure. No GameSpecDoc/GameDef boundary concerns.
3. No backwards-compatibility shims — these are net-new additive types with no existing consumers yet.

## What to Change

### 1. Add diagnostic log entry types to `animation-types.ts`

Append the following types at the end of the file:

- `SpriteResolutionEntry` — records whether a sprite was found for a descriptor, the container type (existing vs ephemeral), and position. Includes `reason` string when `resolved=false`.
- `EphemeralCreatedEntry` — records when an ephemeral sprite container is created, capturing tokenId and dimensions.
- `TweenLogEntry` — records each tween created: descriptor kind, preset name, duration, from/to positions, and face state changes.
- `FaceControllerCallEntry` — records each `setFaceUp()` call with the tokenId, boolean value, and context string identifying the call site (e.g. `'card-deal-to-shared-mid-arc'`).
- `TokenVisibilityInitEntry` — records when a token's alpha is set to 0 before animation starts.
- `DiagnosticBatch` — the top-level container for one animation processing cycle. Contains a batch ID, ISO timestamp, setup flag, serialized trace and descriptors (`readonly unknown[]` to avoid circular reference issues), skipped count, and arrays of all the above entry types. Also includes an optional `queueEvent` and a `warnings` array.

All fields must be `readonly`. Use `unknown[]` for serialized trace/descriptors to avoid circular JSON issues.

## Files to Touch

- `packages/runner/src/animation/animation-types.ts` (modify)

## Out of Scope

- Implementation of the diagnostic buffer (ANIMDIAG-002)
- Logger interface changes (ANIMDIAG-003)
- Any runtime behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. New types are importable and usable in test files without type errors.
2. `DiagnosticBatch` can be constructed as a literal object conforming to the interface.
3. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All new types use `readonly` fields — no mutable properties.
2. No existing types are modified — purely additive.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-types.test.ts` — add type-level assertions confirming the new interfaces are importable and constructible.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
