# 97DECPOISTA-002: Snapshot extraction function

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new sim module, unit tests
**Deps**: archive/tickets/97DECPOISTA/97DECPOISTA-001.md

## Problem

There is no function to extract a lightweight state snapshot from `GameState` at a decision point. This pure function is the core of Spec 97 — it reads game state, evaluates margin ValueExprs, collects per-player/global variables, and counts tokens, all without modifying state.

## Assumption Reassessment (2026-03-30)

1. `buildEvalContext` in `terminal.ts` is a **private** helper (not exported). The extraction function must call `createEvalContext` from `eval-context.ts` directly — same pattern, just using the public API.
2. `evalValue` is exported from `eval-value.ts` (line 244) — available for margin evaluation.
3. `createEvalRuntimeResources` is exported from `eval-context.ts` (line 18) — available.
4. `countSeatTokens` is exported from `derived-values.ts` (line 150) — available for token counting.
5. `def.terminal.margins` is an array of objects with `seat` and `value` (ValueExpr) fields — confirmed from `terminal.ts` usage (line 99).
6. `def.victoryStandings?.seatGroupConfig` provides `seatProp` for token ownership — confirmed from `countSeatTokens` usage.
7. `def.zones` has `zoneKind` field to filter board zones — needs verification during implementation.
8. `createEvalContext` takes `{ def, adjacencyGraph, state, activePlayer, actorPlayer, bindings, runtimeTableIndex, resources }` — confirmed from terminal.ts:21-29.

## Architecture Check

1. **Pure function**: `extractDecisionPointSnapshot` is a read-only function. It receives `def`, `state`, `runtime`, `depth` and returns a snapshot object. No side effects, no state mutation (Foundation #7).
2. **Engine agnosticism (Foundation #1)**: Uses generic APIs — `evalValue` for margins, `state.perPlayerVars` for variables, `countSeatTokens` with the game's own `seatProp`. No game-specific logic.
3. **Graceful degradation**: Games without `terminal.margins` get empty `seatStandings`. Games without `victoryStandings.seatGroupConfig` get `undefined` token counts. No crashes, no game-specific fallbacks.

## What to Change

### 1. New file: `packages/engine/src/sim/snapshot.ts`

Implement `extractDecisionPointSnapshot`:

```typescript
export function extractDecisionPointSnapshot(
  def: ValidatedGameDef,
  state: GameState,
  runtime: GameDefRuntime,
  depth: SnapshotDepth,
): DecisionPointSnapshot | StandardDecisionPointSnapshot | VerboseDecisionPointSnapshot
```

**Depth-level logic**:

- **minimal**: Evaluate `def.terminal.margins` ValueExprs via `evalValue` + `createEvalContext`. Return `DecisionPointSnapshot` with turnCount, phaseId, activePlayer, seatStandings (seat + margin only).
- **standard**: Everything in minimal, plus `perPlayerVars` per seat (from `state.perPlayerVars[seatIndex]`), `tokenCountOnBoard` per seat (via `countSeatTokens` over board zones), and `globalVars` (from `state.globalVars`). Return `StandardDecisionPointSnapshot`.
- **verbose**: Everything in standard, plus `zoneSummaries` for each board zone — zoneVars and tokenCountBySeat. Return `VerboseDecisionPointSnapshot`.

**Margin evaluation**: Use `createEvalContext` (from `eval-context.ts`) + `createEvalRuntimeResources` (from `eval-context.ts`) + `evalValue` (from `eval-value.ts`). This mirrors the pattern in `terminal.ts:finalVictoryRanking` but uses the public API.

**Token counting**: Use `countSeatTokens` from `derived-values.ts` with `def.victoryStandings?.seatGroupConfig?.seatProp`. When `seatGroupConfig` is undefined, token fields are `undefined`.

**Board zone filtering**: Filter `def.zones` where `zoneKind === 'board'` to exclude hand/discard/supply zones from token counts and zone summaries.

### 2. New test file: `packages/engine/test/unit/sim/snapshot.test.ts`

Unit tests covering:
- Minimal depth: returns `DecisionPointSnapshot` with correct turnCount, phaseId, activePlayer, margin values
- Standard depth: includes perPlayerVars, tokenCountOnBoard, globalVars
- Verbose depth: includes zoneSummaries with zoneVars and tokenCountBySeat
- Graceful degradation: no `terminal.margins` → empty `seatStandings`
- Graceful degradation: no `victoryStandings` → `undefined` token counts
- Graceful degradation: no seats → empty `seatStandings`
- Margin evaluation: correctly evaluates ValueExpr formulas (not just literal numbers)
- State immutability: state hash is identical before and after extraction (Foundation #7)

Tests should use minimal GameDef fixtures with known state values for deterministic assertions.

## Files to Touch

- `packages/engine/src/sim/snapshot.ts` (new)
- `packages/engine/test/unit/sim/snapshot.test.ts` (new)

## Out of Scope

- Type definitions (delivered by 97DECPOISTA-001)
- Wiring into `simulator.ts` `runGame` loop (that is 97DECPOISTA-003)
- Re-exporting from `sim/index.ts` (that is 97DECPOISTA-003)
- Serialization, enrichment pipeline, or golden tests (that is 97DECPOISTA-004)
- Any changes to `types-core.ts`, `enriched-trace-types.ts`, `trace-enrichment.ts`, `trace-writer.ts`
- Zone-level variable extraction for non-board zones
- Performance optimization (snapshot extraction is called once per decision, not per tick)

## Acceptance Criteria

### Tests That Must Pass

1. `node --test packages/engine/test/unit/sim/snapshot.test.ts` — all new unit tests pass
2. `pnpm turbo typecheck` — new module type-checks cleanly
3. `pnpm turbo build` — new module compiles
4. `pnpm turbo test` — no regressions

### Invariants

1. `extractDecisionPointSnapshot` is a **pure function** — it never modifies `state`, `def`, or `runtime` (verify via state hash comparison test)
2. When `depth === 'none'`, the function is never called (caller responsibility — but if called with `'none'`, it should still not crash)
3. Margin evaluation uses the same `evalValue` + `createEvalContext` path as `finalVictoryRanking` — no divergent margin calculation
4. No game-specific identifiers in extraction logic (Foundation #1)
5. All returned objects are constructed immutably via spread — no cast-and-mutate (Foundation #7)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/snapshot.test.ts` — comprehensive unit tests for extraction at all depth levels + graceful degradation + immutability property

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/sim/snapshot.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
