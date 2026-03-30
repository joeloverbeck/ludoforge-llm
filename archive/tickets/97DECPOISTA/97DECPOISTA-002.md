# 97DECPOISTA-002: Snapshot extraction function

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new sim module, focused sim tests
**Deps**: archive/tickets/97DECPOISTA/97DECPOISTA-001.md

## Problem

There is no function to extract a lightweight state snapshot from `GameState` at a decision point. This pure function is the core of Spec 97 — it reads game state, evaluates margin ValueExprs, collects per-player/global variables, and counts tokens, all without modifying state.

## Assumption Reassessment (2026-03-30)

1. `packages/engine/src/sim/snapshot-types.ts` already exists from `97DECPOISTA-001`; this ticket must not redefine snapshot contracts.
2. `ExecutionOptions.snapshotDepth` and `MoveLog.snapshot` already exist in `packages/engine/src/kernel/types-core.ts`; this ticket must not re-open that type work.
3. `buildEvalContext` in `packages/engine/src/kernel/terminal.ts` is private. The extraction function must use the public `createEvalContext()` / `createEvalRuntimeResources()` APIs directly.
4. `evalValue` is exported from `packages/engine/src/kernel/eval-value.ts` and is the correct margin-evaluation path because `terminal.ts` already uses it for final victory ranking.
5. `countSeatTokens` is exported from `packages/engine/src/kernel/derived-values.ts` and already encapsulates token seat resolution via `seatProp`.
6. `def.terminal.margins` is optional, and `def.victoryStandings?.seatGroupConfig` is optional. Snapshot extraction must degrade cleanly when either is absent.
7. `ZoneDef.zoneKind` already exists and is the correct generic boundary for board-vs-aux filtering. Board-only token totals should use `zoneKind === 'board'`.
8. `trace-enrichment.ts` already preserves unknown/additive `MoveLog` fields via spread, so snapshot propagation through enrichment is already structurally in place once the simulator begins attaching snapshots.
9. `packages/engine/src/sim/index.ts` does not currently re-export snapshot types or the extraction function. That integration remains out of scope for this ticket and belongs to `97DECPOISTA-003`.
10. The repo’s engine test workflow is build-first for direct `node --test` runs. Targeted acceptance commands should use built `dist/` tests or package scripts, not raw `.ts` test entrypoints.

## Architecture Check

1. **Pure function**: `extractDecisionPointSnapshot` remains the right architecture. It is a read-only projection from `(def, state, runtime, depth)` to snapshot data and belongs in `sim/`, not in the kernel mutation path.
2. **Current architecture vs benefit**: Adding a dedicated extraction module is better than scattering snapshot logic into `simulator.ts` because it keeps the simulator loop thin, makes snapshot behavior directly unit-testable, and gives later trace/golden work a stable seam.
3. **Engine agnosticism (Foundation #1)**: The function should use only generic runtime APIs: `evalValue` for margins, direct state branches for vars, and `countSeatTokens` plus `zoneKind` for token accounting. No game-specific identifiers or hardcoded seat semantics.
4. **No aliasing / no compatibility shims (Foundation #9)**: The extraction code should consume the existing snapshot contracts and kernel APIs directly. Do not add parallel helpers or duplicate “legacy-safe” paths.
5. **Ideal architecture note**: The private `terminal.ts` helper duplication is acceptable for now, but the cleaner long-term architecture would be a shared public evaluation-context factory for read-only terminal/snapshot projections. That broader consolidation is not required to deliver this ticket and should not be smuggled in here.
6. **Graceful degradation**: Games without `terminal.margins` should produce empty `seatStandings`; games without `seatGroupConfig` should omit token counts. This is robust generic behavior, not a compatibility shim.

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

- **`'none'`**: Return the same shape as `'minimal'` without throwing. The caller is expected not to invoke extraction at this depth, but the function itself should still be total.
- **`'minimal'`**: Evaluate `def.terminal.margins` via `evalValue` + `createEvalContext`. Return `DecisionPointSnapshot` with `turnCount`, branded `phaseId`, branded `activePlayer`, and `seatStandings` containing only `seat` + numeric `margin`.
- **`'standard'`**: Everything in minimal, plus `perPlayerVars` per seat (resolved by seat index), `tokenCountOnBoard` per seat (board zones only, via `countSeatTokens`), and `globalVars`. Return `StandardDecisionPointSnapshot`.
- **`'verbose'`**: Everything in standard, plus `zoneSummaries` for each board zone with `zoneVars` and `tokenCountBySeat`. Return `VerboseDecisionPointSnapshot`.

**Margin evaluation**: Use `createEvalContext` (from `eval-context.ts`) + `createEvalRuntimeResources` (from `eval-context.ts`) + `evalValue` (from `eval-value.ts`). This mirrors the pattern in `terminal.ts:finalVictoryRanking` but uses the public API.

**Token counting**: Use `countSeatTokens` from `derived-values.ts` with `def.victoryStandings?.seatGroupConfig?.seatProp`. When `seatGroupConfig` is undefined, token fields are `undefined`.

**Board zone filtering**: Filter `def.zones` where `zoneKind === 'board'` to exclude hand/discard/supply zones from token counts and zone summaries.

**Non-goals within implementation**:

- Do not modify `simulator.ts` in this ticket.
- Do not re-export from `sim/index.ts` in this ticket.
- Do not widen branded identifiers in snapshot payloads.
- Do not rewrite existing terminal helpers just to remove small evaluation-context duplication.

### 2. New test file: `packages/engine/test/unit/sim/snapshot.test.ts`

Unit tests covering:
- `'none'` / minimal behavior: returns a base snapshot without throwing, with correct `turnCount`, `phaseId`, `activePlayer`, and evaluated margins
- Standard depth: includes per-seat `perPlayerVars`, board-only `tokenCountOnBoard`, and `globalVars`
- Verbose depth: includes board-only `zoneSummaries` with `zoneVars` and `tokenCountBySeat`
- Graceful degradation: no `terminal.margins` → empty `seatStandings`
- Graceful degradation: no `victoryStandings` / no `seatGroupConfig` → token counts omitted rather than guessed
- Graceful degradation: margin seat not present in `def.seats` does not crash and still yields a margin row
- Margin evaluation: evaluates non-literal numeric `ValueExpr` formulas correctly
- Purity / immutability: extraction does not mutate `state` or `runtime`-consumed structures

Tests should use minimal synthetic validated defs and runtime fixtures with deterministic state. Prefer focused unit coverage over large production fixtures here.

### 3. Strengthen existing simulator coverage instead of creating duplicate integration tests

Modify `packages/engine/test/unit/sim/simulator.test.ts` only if needed to assert the current precondition:

- `runGame()` does not attach snapshots yet, even when `snapshotDepth` is present, because simulator wiring belongs to `97DECPOISTA-003`

This keeps ticket boundaries explicit and prevents accidental scope bleed between `002` and `003`.

## Files to Touch

- `packages/engine/src/sim/snapshot.ts` (new)
- `packages/engine/test/unit/sim/snapshot.test.ts` (new)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify only if boundary coverage is useful)

## Out of Scope

- Type definitions and core trace option/log wiring (already delivered by 97DECPOISTA-001)
- Wiring extraction into `simulator.ts` `runGame` loop (that is 97DECPOISTA-003)
- Re-exporting from `sim/index.ts` (that is 97DECPOISTA-003)
- Serialization, enrichment pipeline, or golden tests (that is 97DECPOISTA-004)
- Any changes to `types-core.ts`, `enriched-trace-types.ts`, `trace-enrichment.ts`, `trace-writer.ts`
- Zone-level variable extraction for non-board zones
- Performance optimization (snapshot extraction is called once per decision, not per tick)

## Acceptance Criteria

### Tests That Must Pass

1. Targeted snapshot extraction tests pass
2. `pnpm turbo typecheck` — new module type-checks cleanly
3. `pnpm turbo build` — new module compiles
4. `pnpm turbo test` — no regressions
5. `pnpm turbo lint` — no lint regressions

### Invariants

1. `extractDecisionPointSnapshot` is a **pure function** — it never modifies `state`, `def`, or `runtime` (verify via state hash comparison test)
2. When `depth === 'none'`, the function remains total and does not throw even though the caller is expected to skip invocation
3. Margin evaluation uses the same `evalValue` + `createEvalContext` path as `finalVictoryRanking` — no divergent margin calculation
4. Token totals and verbose zone summaries consider board zones only
5. No game-specific identifiers in extraction logic (Foundation #1)
6. All returned objects are constructed immutably — no cast-and-mutate assembly (Foundation #7)
7. This ticket does not change trace integration boundaries already assigned to `97DECPOISTA-003` / `004`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/snapshot.test.ts` — comprehensive unit tests for extraction at all depth levels, board-zone filtering, graceful degradation, and purity
2. `packages/engine/test/unit/sim/simulator.test.ts` — only if needed to pin the 002/003 boundary explicitly

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/snapshot.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Added `packages/engine/src/sim/snapshot.ts` with `extractDecisionPointSnapshot`, keeping the simulator loop untouched and the extraction logic isolated in `sim/`.
  - Added `packages/engine/test/unit/sim/snapshot.test.ts` covering `'none'`, `standard`, and `verbose` extraction, board-only token aggregation, graceful degradation, unknown-margin-seat handling, and purity / non-aliasing.
  - Corrected this ticket before implementation because its original scope was stale: snapshot contracts, `ExecutionOptions.snapshotDepth`, and `MoveLog.snapshot` were already delivered by `97DECPOISTA-001`.
- Deviations from original plan:
  - No changes were made to `types-core.ts`, `sim/index.ts`, `trace-enrichment.ts`, or `simulator.ts`; those surfaces were already handled or remain assigned to later tickets.
  - The implementation clones projected variable branches into the snapshot instead of returning aliased live state records. That keeps snapshots standalone and harder to misuse.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/snapshot.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
