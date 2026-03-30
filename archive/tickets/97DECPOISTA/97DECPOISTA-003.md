# 97DECPOISTA-003: Simulator integration and sim index exports

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — simulator.ts, sim/index.ts
**Deps**: tickets/97DECPOISTA-002.md

## Problem

The snapshot payload types and `extractDecisionPointSnapshot` helper already exist, but the simulator still does not attach snapshots to trace move logs. `runGame()` in `simulator.ts` must read `snapshotDepth`, capture the snapshot immediately before each agent decision, and attach it to the emitted `MoveLog`. The snapshot contracts and extraction helper also still need to be re-exported from `sim/index.ts` so sim consumers can use the same public surface.

## Assumption Reassessment (2026-03-30)

1. `ExecutionOptions.snapshotDepth` and `MoveLog.snapshot` already exist in `packages/engine/src/kernel/types-core.ts`; this ticket must not duplicate or re-specify those type changes.
2. `extractDecisionPointSnapshot()` already exists in `packages/engine/src/sim/snapshot.ts`, with payload coverage in `packages/engine/test/unit/sim/snapshot.test.ts`.
3. `trace-enrichment` already preserves `MoveLog.snapshot`, with explicit coverage in `packages/engine/test/unit/trace-enrichment.test.ts`; enrichment and serialization are therefore not this ticket's responsibility.
4. `runGame()` in `packages/engine/src/sim/simulator.ts` still does not read `snapshotDepth` or attach snapshots. That is the remaining behavior gap this ticket owns.
5. `runGame()` constructs `MoveLog` entries after `applyTrustedMove()`, so the only correct capture point is after legal move enumeration and before `agent.chooseMove()`. The snapshot must then be attached to the post-move `MoveLog`.
6. `sim/index.ts` does not currently re-export the snapshot contracts/helper. That export gap is still in scope here.
7. The existing simulator unit suite in `packages/engine/test/unit/sim/simulator.test.ts` is the right place to prove this behavior. A new integration-only test file would duplicate fixture setup without materially strengthening the simulator contract.

## Architecture Check

1. **This ticket is beneficial relative to the current code**: the current architecture already defines snapshot types and extraction, so leaving the simulator unwired creates a dead feature surface. Wiring the snapshot into `runGame()` completes the trace contract with a minimal, coherent change.
2. **Engine agnosticism (Foundation #1)**: The simulator calls the generic extraction function — it doesn't know what's in the snapshot.
3. **Performance**: When `snapshotDepth` is `'none'` (or undefined), no extraction function is called and no snapshot object is created — zero overhead for non-snapshot runs.
4. **Correct boundary for this ticket**: the only architectural work needed here is simulator wiring and sim-surface exports. Reworking the options boundary would expand scope and obscure whether the snapshot feature itself works.
5. **Ideal architecture remains tracked separately**: sim-only flags (`snapshotDepth`, `skipDeltas`) still live on kernel `ExecutionOptions`, which is not the cleanest ownership boundary. `tickets/97DECPOISTA-005.md` is the right follow-up to move those flags into a dedicated sim options contract without muddying this ticket.

## What to Change

### 1. Modify `packages/engine/src/sim/simulator.ts`

In the `runGame` function:

1. Read `snapshotDepth` from `options?.snapshotDepth ?? 'none'` at function start.
2. Before each `agent.chooseMove()` call, if `snapshotDepth !== 'none'`, call `extractDecisionPointSnapshot(def, state, runtime, snapshotDepth)` and store the result.
3. When constructing the `MoveLog` entry (lines 166-180), spread the snapshot: `...(snapshot !== undefined ? { snapshot } : {})`.

Import `extractDecisionPointSnapshot` from `./snapshot.js`.

### 2. Modify `packages/engine/src/sim/index.ts`

Add re-exports:

```typescript
export type {
  SnapshotDepth,
  DecisionPointSnapshot,
  SeatStandingSnapshot,
  StandardDecisionPointSnapshot,
  VerboseDecisionPointSnapshot,
  ZoneSummary,
} from './snapshot-types.js';
export { extractDecisionPointSnapshot } from './snapshot.js';
```

### 3. Add simulator coverage in `packages/engine/test/unit/sim/simulator.test.ts`

Add focused simulator tests that:
- call `runGame()` with `snapshotDepth: 'standard'` on a minimal validated fixture
- assert the snapshot seen inside `agent.chooseMove()` matches the `snapshot` attached to the emitted `MoveLog`, proving capture happens before agent choice and survives into the trace
- verify omitted / `'none'` depth produces no `snapshot`
- verify `'verbose'` depth attaches `zoneSummaries`

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify)

## Out of Scope

- Type definitions and `ExecutionOptions` / `MoveLog` surface changes (already delivered by 97DECPOISTA-001)
- Snapshot extraction logic (already delivered by 97DECPOISTA-002)
- Refactoring `runGame()` / `runGames()` to use a dedicated sim-local options type instead of shared `ExecutionOptions` — tracked separately in `tickets/97DECPOISTA-005.md`
- Enrichment pipeline changes — snapshot propagation is already covered by `packages/engine/test/unit/trace-enrichment.test.ts`
- Trace writer / serialization verification — that belongs to `97DECPOISTA-004`
- Golden test with known FITL seed (that is 97DECPOISTA-004)
- Any runner-side changes
- Campaign harness changes (consumers decide their own `snapshotDepth`)

## Acceptance Criteria

### Tests That Must Pass

1. `node --test packages/engine/test/unit/sim/simulator.test.ts` — simulator unit coverage passes with snapshot assertions
2. `pnpm turbo typecheck` — simulator changes type-check
3. `pnpm turbo test` — no regressions, including existing simulator and snapshot tests
4. `pnpm turbo lint` — lint remains green

### Invariants

1. `snapshotDepth: 'none'` (or omitted) produces **zero** snapshot objects — no performance overhead for existing behavior
2. Every `MoveLog` entry with a snapshot has `snapshot.turnCount`, `snapshot.phaseId`, `snapshot.activePlayer`, and `snapshot.seatStandings` populated
3. Snapshot is captured BEFORE `agent.chooseMove()` — it reflects the state the agent saw, not the state after the move
4. Existing `runGame` call sites (without `snapshotDepth`) continue to work unchanged
5. All existing `MoveLog` fields remain identical aside from the additive `snapshot` field when enabled

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` — simulator-level tests for `'none'`, `'standard'`, and `'verbose'` snapshot behavior, including pre-decision capture
2. Existing `packages/engine/test/unit/sim/snapshot.test.ts` remains the proof of extraction payload semantics
3. Existing `packages/engine/test/unit/trace-enrichment.test.ts` remains the proof that downstream enrichment preserves snapshot payloads

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/test/unit/sim/simulator.test.ts`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Wired `runGame()` to capture a decision-point snapshot before each agent choice when `snapshotDepth !== 'none'` and attach it to the emitted `MoveLog`
  - Re-exported snapshot contracts and `extractDecisionPointSnapshot` from `packages/engine/src/sim/index.ts`
  - Added simulator-level regression coverage in `packages/engine/test/unit/sim/simulator.test.ts` for omitted/none, standard, and verbose snapshot behavior
- Deviations from original plan:
  - Corrected the ticket before implementation because its assumptions were stale: snapshot type wiring, extraction, and enrichment preservation were already delivered elsewhere
  - Replaced the planned new integration test file with tighter coverage in the existing simulator unit suite, which better matches this ticket's ownership boundary
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/unit/sim/simulator.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
