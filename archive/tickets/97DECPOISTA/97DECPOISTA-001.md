# 97DECPOISTA-001: Snapshot type definitions and core type extensions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, new sim types file
**Deps**: Spec 97 (decision-point state snapshots), Spec 94 (completed — agent evaluation diagnostics)

## Problem

The simulation trace has no type infrastructure for capturing game state at decision points. Before the extraction logic or simulator integration can be built, the type contracts must exist: the `SnapshotDepth` discriminant, the snapshot interfaces at each depth level, and the `MoveLog`/`ExecutionOptions` extensions that carry them.

## Assumption Reassessment (2026-03-30)

1. `MoveLog` (types-core.ts:1506-1520) does NOT have a `snapshot` field — confirmed.
2. `ExecutionOptions` (types-core.ts:1464-1485) does NOT have a `snapshotDepth` field — confirmed.
3. `VariableValue` is `number | boolean` (types-core.ts:89) — matches spec's use in `perPlayerVars`.
4. No `snapshot-types.ts` file exists under `packages/engine/src/sim/` — confirmed.
5. `EnrichedMoveLog` extends `MoveLog` (enriched-trace-types.ts:9-12) — snapshot field will propagate automatically via inheritance.
6. `GameState.activePlayer` is a branded `PlayerId`, not a raw number, and `ZoneDef.id` / phase IDs already use branded domain identifiers — the original ticket wording should not introduce raw-string/raw-number contracts where branded types already exist.
7. `ExecutionOptions` already carries simulation-facing flags such as `skipDeltas`; adding `snapshotDepth` continues an existing shared-options pattern rather than creating a brand-new dependency direction.
8. Existing unit/integration coverage already exercises `runGame`, `enrichTrace`, and type-contract surfaces; this change should strengthen those tests rather than relying only on build/typecheck.

## Architecture Check

1. **Why this approach**: Defining the snapshot contracts first still enables parallel work on extraction and integration, but the contracts must be architecturally correct: branded identifiers where the engine already has them, readonly data throughout, and no sim-specific aliasing.
2. **Engine agnosticism (Foundation #1)**: Snapshot types use generic game-state concepts (`VariableValue`, seat strings, zone IDs). No game-specific field names.
3. **Branded identifiers (Foundation #12)**: Snapshot contracts must use existing branded domain IDs where available (`PlayerId`, `PhaseId`, `ZoneId`) rather than widening them to raw `number` / `string`.
4. **Current architecture vs ideal architecture**: Extending `ExecutionOptions` is consistent with current simulator architecture because `skipDeltas` already lives there. The cleaner long-term shape would be a sim-local options type layered on top of kernel execution options, but that is a broader refactor than this ticket and is not justified here.
5. **No backwards-compatibility shims (Foundation #9)**: `snapshot` on `MoveLog` and `snapshotDepth` on `ExecutionOptions` are both optional additive fields. No aliases, fallbacks, or duplicate code paths should be introduced.

## What to Change

### 1. New file: `packages/engine/src/sim/snapshot-types.ts`

Define all snapshot types from Spec 97 Section 2:

- `SnapshotDepth = 'none' | 'minimal' | 'standard' | 'verbose'`
- `SeatStandingSnapshot` — per-seat margin + optional per-player vars + optional token count
- `DecisionPointSnapshot` — turnCount, phaseId, activePlayer, seatStandings
- `StandardDecisionPointSnapshot extends DecisionPointSnapshot` — adds globalVars
- `VerboseDecisionPointSnapshot extends StandardDecisionPointSnapshot` — adds zoneSummaries
- `ZoneSummary` — zoneId, optional zoneVars, optional tokenCountBySeat

All interfaces must be `readonly` throughout (Foundation #7).

Type corrections to the original ticket wording:

- `DecisionPointSnapshot.phaseId` should use `PhaseId`, not raw `string`
- `DecisionPointSnapshot.activePlayer` should use `PlayerId`, not raw `number`
- `ZoneSummary.zoneId` should use `ZoneId`, not raw `string`

### 2. Extend `MoveLog` in `packages/engine/src/kernel/types-core.ts`

Add optional `snapshot` field:

```typescript
readonly snapshot?: DecisionPointSnapshot;
```

Import `DecisionPointSnapshot` from `../sim/snapshot-types.js`.

### 3. Extend `ExecutionOptions` in `packages/engine/src/kernel/types-core.ts`

Add optional `snapshotDepth` field:

```typescript
readonly snapshotDepth?: SnapshotDepth;
```

Import `SnapshotDepth` from `../sim/snapshot-types.js`.

## Files to Touch

- `packages/engine/src/sim/snapshot-types.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — add `snapshot` to `MoveLog`, add `snapshotDepth` to `ExecutionOptions`, add imports)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify — compile-time contract coverage for new optional fields)
- `packages/engine/test/unit/trace-enrichment.test.ts` (modify — verify snapshot payloads survive enrichment spread)

## Out of Scope

- Snapshot extraction logic (`extractDecisionPointSnapshot`) — that is 97DECPOISTA-002
- Simulator integration (capturing snapshots in `runGame`) — that is 97DECPOISTA-003
- Re-exporting snapshot types from `sim/index.ts` — that is 97DECPOISTA-003
- Serialization or golden tests — that is 97DECPOISTA-004
- Any changes to `enriched-trace-types.ts`, `trace-enrichment.ts`, or `trace-writer.ts`
- Any runner-side changes

## Acceptance Criteria

### Tests That Must Pass

1. Targeted engine tests covering the touched contracts pass
2. `pnpm turbo typecheck` passes — all new types are well-formed and imports resolve
3. `pnpm turbo build` passes — compiled JS emits correctly for new types file
4. `pnpm turbo test` passes — no regressions from adding optional fields to `MoveLog`/`ExecutionOptions`
5. `pnpm turbo lint` passes — no lint regressions from new imports/types/tests

### Invariants

1. `MoveLog.snapshot` is optional — all existing `MoveLog` construction sites remain valid without changes
2. `ExecutionOptions.snapshotDepth` is optional and defaults conceptually to `'none'` — all existing `runGame` call sites remain valid
3. All snapshot interfaces use `readonly` properties (Foundation #7 — Immutability)
4. No game-specific identifiers appear in any snapshot type (Foundation #1 — Engine Agnosticism)
5. `EnrichedMoveLog` inherits `snapshot` from `MoveLog` without changes to `enriched-trace-types.ts`
6. Snapshot contracts preserve branded identifiers already present in engine types (`PlayerId`, `PhaseId`, `ZoneId`) instead of widening them
7. Snapshot metadata must propagate through trace enrichment without any bespoke copy logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — compile-time assertions for `ExecutionOptions.snapshotDepth` and `MoveLog.snapshot`
2. `packages/engine/test/unit/trace-enrichment.test.ts` — runtime assertion that `snapshot` survives the `enrichTrace()` spread unchanged

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern=\"runGame|enrichTrace|MoveLog\"` if a focused run is needed during iteration
2. `pnpm turbo typecheck`
3. `pnpm turbo build`
4. `pnpm turbo test`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Added `packages/engine/src/sim/snapshot-types.ts` with readonly snapshot contracts and the `SnapshotDepth` union.
  - Extended `packages/engine/src/kernel/types-core.ts` so `ExecutionOptions` can carry `snapshotDepth` and `MoveLog` can carry `snapshot`.
  - Kept branded identifier usage in the new snapshot contracts for `activePlayer`, `phaseId`, and `zoneId`.
  - Strengthened existing tests in `packages/engine/test/unit/types-exhaustive.test.ts` and `packages/engine/test/unit/trace-enrichment.test.ts`.
- Deviations from original plan:
  - The original ticket framed the change as effectively type-only. The implemented scope added explicit compile-time and runtime propagation tests.
  - The original wording used raw `number` / `string` for some identifiers. The final contract uses existing branded engine identifier types instead.
- Verification results:
  - `node --test packages/engine/dist/test/unit/trace-enrichment.test.js packages/engine/dist/test/unit/types-exhaustive.test.js packages/engine/dist/test/unit/sim/simulator.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
