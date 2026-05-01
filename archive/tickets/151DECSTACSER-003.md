# 151DECSTACSER-003: Tighten EffectExecutionFrameSnapshotSchema.suspendedFrame to typed schema

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/schemas-core.ts` (Zod schema tightening)
**Deps**: `archive/tickets/151DECSTACSER-001.md`

## Problem

`SerializedGameStateSchema` (`schemas-core.ts:2138`) is already recursive at the `decisionStack` level via `z.lazy(() => DecisionStackFrameSchema)` (line 2158). However, `EffectExecutionFrameSnapshotSchema.suspendedFrame` (line 1355) is permissive — `z.unknown().optional()` — and bottoms out the recursion before the nested-state shape is reached. This ticket replaces the `z.unknown()` with a typed `SerializedSuspendedEffectFrameSnapshotSchema` that references `SerializedGameStateSchema` recursively via `z.lazy`, completing the schema's structural mirror of the runtime types from 001.

## Assumption Reassessment (2026-05-01)

1. `EffectExecutionFrameSnapshotSchema` is at `packages/engine/src/kernel/schemas-core.ts:1348-1357`. Its `suspendedFrame` field is `z.unknown().optional()` at line 1355 — confirmed during spec 151 reassessment.
2. `SerializedGameStateSchema` is at `schemas-core.ts:2138-2164`. The `decisionStack` field at line 2158 already uses `z.lazy(() => DecisionStackFrameSchema)` — the recursive scaffolding precedent for this ticket.
3. Multiple `z.lazy` precedents exist (lines 1308, 1354, 1524, 2158); the schema author already trusts the pattern.
4. `SerializedRng` does NOT yet need a wrapped schema for the top-level `GameState.rng` case (which is flat `RngState`). The wrapper schema is needed for `SuspendedEffectFrameSnapshot.rng: Rng` only.
5. Independence from 002: this ticket can land in parallel with 002. The schema validates the shape produced by either the walker (still active until 002 lands) or the new explicit recursion (active after 002 lands) — both produce the same `SerializedGameState` shape recursively, so the tightened schema is satisfied either way.

## Architecture Check

1. The schema now structurally mirrors the runtime serialized type. `z.unknown()` was the documented gap; replacing it with `z.lazy(() => SerializedSuspendedEffectFrameSnapshotSchema)` closes it without altering any other schema surface.
2. F8 preserved: schema validation is deterministic.
3. F11 preserved: no mutation; Zod schema authoring is pure.
4. F15 preserved: closes the schema gap rather than relying on the walker's runtime catch-all.

## What to Change

### 1. Add `SerializedRngSchema` for the wrapped `Rng` form

Place near the existing flat-rng schema embedded in `SerializedGameStateSchema`. Add an exportable schema:

```ts
export const SerializedRngSchema = z
  .object({
    state: z.object({
      algorithm: z.literal('pcg-dxsm-128'),
      version: z.literal(1),
      state: z.array(HexBigIntSchema),
    }).strict(),
  })
  .strict();
```

(Reuse the existing `HexBigIntSchema` if present; otherwise use the same `.regex(/^0x[0-9a-f]+$/)` pattern that the rest of the file uses for hex bigints.)

### 2. Add `SerializedSuspendedEffectFrameSnapshotSchema`

Place adjacent to `EffectExecutionFrameSnapshotSchema` (line 1348). Mirror all 7 fields of the type from 001:

```ts
export const SerializedSuspendedEffectFrameSnapshotSchema = z
  .object({
    state: z.lazy(() => SerializedGameStateSchema),
    rng: SerializedRngSchema,
    actorPlayer: PlayerIdSchema, // or whatever the existing GameState['activePlayer'] type maps to
    bindings: z.record(StringSchema, z.unknown()),
    freeOperationOverlay: FreeOperationExecutionOverlaySchema.optional(),
    leaf: SuspendedDecisionLeafSchema,
    resumeStack: z.array(SuspendedResumeFrameSchema),
  })
  .strict();
```

If any of `FreeOperationExecutionOverlaySchema`, `SuspendedDecisionLeafSchema`, or `SuspendedResumeFrameSchema` does not yet exist, add them inline matching the runtime types in `kernel/microturn/types.ts`. Reuse existing schemas where present.

### 3. Tighten `EffectExecutionFrameSnapshotSchema.suspendedFrame`

Replace line 1355:

```ts
suspendedFrame: z.unknown().optional(),
```

with:

```ts
suspendedFrame: z.lazy(() => SerializedSuspendedEffectFrameSnapshotSchema).optional(),
```

The `z.lazy` is required because `SerializedSuspendedEffectFrameSnapshotSchema` references `SerializedGameStateSchema`, which in turn (via `decisionStack` → `DecisionStackFrameSchema` → `EffectExecutionFrameSnapshotSchema`) creates a recursive cycle.

## Files to Touch

- `packages/engine/src/kernel/schemas-core.ts` (modify)

## Out of Scope

- Runtime serializer/deserializer changes — owned by 002.
- Walker deletion — owned by 004.
- Tests for the schema-rejection case (which exercises the new tightening) — owned by 005.
- Adding new schemas for fields the spec did not flag (e.g., `interruptPhaseStack[i]` carries no nested state, confirmed during 151 reassessment).

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test` passes unchanged. The new schema validates the same shape currently produced by either the walker (today) or the new explicit serializer (after 002 lands), so no tests should regress.
2. `pnpm turbo lint typecheck` passes — the new schema imports/exports compile cleanly.
3. `pnpm turbo schema:artifacts` (if applicable to this package) regenerates schema artifacts cleanly with no diff in already-published outputs except for the tightened suspendedFrame.

### Invariants

1. `SerializedGameStateSchema.parse(serializeGameState(state))` succeeds for any in-corpus state, including states with non-empty `decisionStack` carrying a `suspendedFrame`.
2. `SerializedGameStateSchema.parse(payloadWithBigIntInSuspendedFrameStateHash)` fails with a clear error (BigInt is not assignable to `HexBigInt`) — the formal test of this rejection lives in 005, but the schema must be authored to reject it.

## Test Plan

### New/Modified Tests

None directly; 005 owns the schema-rejection test that exercises this ticket's tightening. Existing test corpus must stay green.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint typecheck`

## Outcome (2026-05-01)

Completed. `EffectExecutionFrameSnapshotSchema.suspendedFrame` now uses a lazy typed `SerializedSuspendedEffectFrameSnapshotSchema` instead of `z.unknown()`. The new suspended-frame schema mirrors the runtime serialized shape from 001: recursively serialized `state`, wrapped serialized `rng`, actor player, bindings, optional free-operation overlay, suspended decision leaf, and resume stack.

Supporting schemas were added for the suspended decision leaf/resume-frame payloads, the wrapped `SerializedRng` form, and the optional free-operation execution overlay fields needed by suspended frames. Recursive schema knots are explicitly annotated so TypeScript can compile the `SerializedGameStateSchema -> DecisionStackFrameSchema -> EffectExecutionFrameSnapshotSchema -> SerializedSuspendedEffectFrameSnapshotSchema -> SerializedGameStateSchema` cycle.

Schema artifact fallout was expected and owned: `packages/engine/schemas/Trace.schema.json` was regenerated. `GameDef.schema.json` and `EvalReport.schema.json` remained unchanged after the generator ran.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine run schema:artifacts:check` — initially reported `Trace.schema.json` out of sync, then passed after `pnpm -F @ludoforge/engine run schema:artifacts`.
3. `pnpm -F @ludoforge/engine test` — passed before root lint/typecheck (`59/59 files passed`).
4. `pnpm turbo lint typecheck` — passed (`5 successful, 5 total`).
5. `pnpm -F @ludoforge/engine test` — rerun after the Turbo build cleaned/rebuilt `dist`; passed (`59/59 files passed`).

Deferred sibling scope remains unchanged: 004 owns walker body deletion and grep enforcement; 005 owns the schema-rejection and round-trip tests.
