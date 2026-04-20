# 140MICRODECPRO-006: D4 — simulator rewrite + DecisionLog / GameTrace rework + snapshot extension (F14 atomic)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — rewrites `sim/simulator.ts`, replaces `MoveLog` with `DecisionLog`, extends `GameTrace`, migrates ~183 test files
**Deps**: `archive/tickets/140MICRODECPRO-005.md`

## Problem

With publishMicroturn / applyDecision / advanceAutoresolvable fully implemented (tickets 003–005), this ticket pivots the simulator loop from move-at-a-time to decision-at-a-time. `MoveLog` retires, `DecisionLog` replaces it, and `GameTrace` gains `decisions[]` + `compoundTurns[]` + `traceProtocolVersion: 'spec-140'`.

This is an F14 atomic cut — **the full deletion blast radius lands here**. ~183 engine test files reference `applyMove` / `applyTrustedMove` today; all are migrated to `applyDecision` in the same change. The atomic cut principle (no transitional period where source and tests disagree) applies.

## Assumption Reassessment (2026-04-20)

1. Current simulator `runGame` signature at `packages/engine/src/sim/simulator.ts:50` uses `applyTrustedMove` + `enumerateLegalMoves` + `agent.chooseMove({legalMoves, certificateIndex, …})` — confirmed by direct file read during reassessment.
2. `MoveLog` is declared in `packages/engine/src/kernel/types-core.ts` and consumed by 8 source files + 5 test files — confirmed by blast-radius scan.
3. `GameTrace` is declared in `types-core.ts` and consumed by 11 source files + 10 test files — confirmed.
4. `~183 test files reference applyMove/applyTrustedMove` — from Explore-agent blast-radius scan during reassessment. Exact current count must be verified by the implementer via `grep -rl "applyMove\|applyTrustedMove" packages/engine/test/` at ticket start.
5. Spec 97's `DecisionPointSnapshot` at `packages/engine/src/sim/snapshot-types.ts:13` is extensible — spec 140 introduces `MicroturnSnapshot` as an extension.
6. Agent API still uses `chooseMove` — this ticket keeps the legacy agent call site in the simulator's inner loop until ticket 007 (which is this ticket's immediate successor). **Transitional coordination**: this ticket's simulator rewrite publishes microturns and applies decisions, but adapts to the legacy agent interface via a shim (`adaptLegacyAgentChooseMove`) that converts a `MicroturnState` to the shape `chooseMove` expects. Ticket 007 deletes the shim and updates agent call sites.

## Architecture Check

1. F14 atomic: `applyMove`, `applyTrustedMove`, `MoveLog`, `GameTrace.moves`, `enumerateLegalMoves` all retire in this ticket in the same commit. No alias, no deprecation wrapper. The simulator, trace consumers, and all tests migrate together. The temporary `adaptLegacyAgentChooseMove` shim is source-visible and marked for deletion in ticket 007 — this is a two-ticket atomic cut bundle per the skill's multi-ticket atomic-cut rule.
2. Reviewability: per the Foundation 14 exception, a Large effort is acceptable because the test migration is mechanically uniform — every `applyMove(state, move)` call site becomes `applyDecision(state, decision)` with decision construction derived from the move shape. The simulator rewrite itself is surgical and stays within one file.
3. Determinism (F8): spec-140 replay identity asserts `decisions[]` byte-identical across runs. Migrated golden fixtures explicitly tagged `traceProtocolVersion: 'spec-140'`.
4. Spec 97 snapshot infrastructure is *extended*, not replaced — `MicroturnSnapshot extends DecisionPointSnapshot` (preserves compatibility with existing snapshot consumers at the type level).

## What to Change

### 1. Rewrite `packages/engine/src/sim/simulator.ts`

Replace the current `while (true)` loop that calls `enumerateLegalMoves` + `agent.chooseMove` + `applyTrustedMove` with the per-microturn loop from spec 140 D4:

```ts
while (true) {
  const autoResult = advanceAutoresolvable(validatedDef, state, currentChanceRng, resolvedRuntime);
  state = autoResult.state;
  currentChanceRng = autoResult.rng;
  for (const log of autoResult.autoResolvedLogs) decisionLogs.push(log);

  const terminal = terminalResult(validatedDef, state, resolvedRuntime);
  if (terminal !== null) { result = terminal; stopReason = 'terminal'; break; }
  if (state.turnCount >= maxTurns) { stopReason = 'maxTurns'; break; }

  const microturn = publishMicroturn(validatedDef, state, resolvedRuntime);
  const player = microturn.seatId as PlayerId;
  const agent = agents[player];
  const agentRng = agentRngByPlayer[player];
  if (agent === undefined || agentRng === undefined) throw new Error(...);

  const snapshot = snapshotDepth === 'none' ? undefined : extractMicroturnSnapshot(...);
  // Transitional: use legacy chooseMove via adapter until ticket 007 lands chooseDecision
  const selected = adaptLegacyAgentChooseMove(agent, { def, state, microturn, rng: agentRng, runtime });
  agentRngByPlayer[player] = selected.rng;

  const applied = applyDecision(validatedDef, state, selected.decision, kernelOptions, resolvedRuntime);
  state = applied.state;
  decisionLogs.push({ ...applied.log, agentDecision: selected.agentDecision, snapshot });
}

const compoundTurns = synthesizeCompoundTurnSummaries(decisionLogs);

return {
  gameDefId: validatedDef.metadata.id,
  seed,
  decisions: decisionLogs,
  compoundTurns,
  finalState: state,
  result,
  turnsCount: state.turnCount,
  stopReason,
  traceProtocolVersion: 'spec-140',
};
```

Use `CHANCE_RNG_MIX` from ticket 003 to seed the chance RNG: `const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX)`.

### 2. Replace `MoveLog` with `DecisionLog`

- Delete `MoveLog` interface from `types-core.ts`.
- Make `DecisionLog` canonical (it already exists from ticket 004); extend its fields per spec 140 D4 if needed (snapshot, agentDecision).
- Delete `applyMove`, `applyTrustedMove`, `enumerateLegalMoves` from `packages/engine/src/kernel/apply-move.ts` and `legal-moves.ts`. Deletion is F14 — no wrapper, no alias.

### 3. Replace `GameTrace.moves` with `GameTrace.decisions` + add `compoundTurns` and `traceProtocolVersion`

Update `types-core.ts`:

```ts
export interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly decisions: readonly DecisionLog[];
  readonly compoundTurns: readonly CompoundTurnSummary[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
  readonly traceProtocolVersion: 'spec-140';
}

export interface CompoundTurnSummary {
  readonly turnId: TurnId;
  readonly seatId: SeatId;
  readonly decisionIndexRange: { readonly start: number; readonly end: number };
  readonly microturnCount: number;
  readonly turnStopReason: 'retired' | 'terminal' | 'maxTurns';
}
```

Add `synthesizeCompoundTurnSummaries(decisions: readonly DecisionLog[])` in `packages/engine/src/sim/compound-turns.ts` (new file).

### 4. Snapshot extension — `MicroturnSnapshot`

In `packages/engine/src/sim/snapshot-types.ts`:

```ts
export interface MicroturnSnapshot extends DecisionPointSnapshot {
  readonly decisionContextKind: DecisionContextKind;
  readonly frameId: DecisionFrameId;
  readonly turnId: TurnId;
  readonly compoundTurnTrace: readonly CompoundTurnTraceEntry[];
}
```

Add `extractMicroturnSnapshot` function alongside existing `extractDecisionPointSnapshot`.

### 5. Migrate engine trace consumers

Update each file that consumed `MoveLog` / `GameTrace.moves`:
- `sim/delta.ts`, `sim/enriched-trace-types.ts`, `sim/index.ts`, `sim/trace-enrichment.ts`, `sim/trace-eval.ts`, `sim/trace-writer.ts`, `sim/eval-report.ts`
- Schema: `schemas-core.ts`, `schema-artifacts.ts`, `serde.ts`

Each consumer now reads `.decisions[]` and aggregates via `compoundTurns[]` when it needs move-level analytics.

### 6. Add temporary legacy-agent adapter

Create `packages/engine/src/sim/adapt-legacy-agent.ts`:

```ts
export const adaptLegacyAgentChooseMove = (
  agent: Agent,
  input: { def: ValidatedGameDef; state: GameState; microturn: MicroturnState; rng: Rng; runtime?: GameDefRuntime },
): { decision: Decision; rng: Rng; agentDecision?: AgentDecisionTrace }
```

The adapter is explicitly marked `// DELETES IN TICKET 007` with a source comment. It exists only to bridge the atomic-cut sequence.

### 7. Migrate ~183 engine test files from `applyMove` to `applyDecision`

This is the mechanical-uniformity step. Every test that constructs a move and applies it:

```ts
// Before:
const { state, moveLog } = applyTrustedMove(def, state, move, options, runtime);

// After:
const { state, log } = applyDecision(def, state, moveToDecision(move), options, runtime);
```

Helper `moveToDecision(move: TrustedExecutableMove): Decision` lives in `packages/engine/test/helpers/` (test-only) and handles the mechanical conversion. Sharded migration — one subdirectory at a time within this ticket:

- `packages/engine/test/unit/kernel/` first
- then `packages/engine/test/unit/agents/`
- then `packages/engine/test/integration/`
- then `packages/engine/test/determinism/`

All four shards land in the same commit (F14 atomic). Golden-trace fixtures in `packages/engine/test/fixtures/` regenerate under the spec-140 protocol and tag `traceProtocolVersion: 'spec-140'`.

### 8. Update dist regeneration

Engine tests run against `packages/engine/dist/`. After source changes, `pnpm -F @ludoforge/engine build` regenerates the dist; all test commands must show green after the build.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify — full loop rewrite)
- `packages/engine/src/sim/adapt-legacy-agent.ts` (new, temporary)
- `packages/engine/src/sim/compound-turns.ts` (new — `synthesizeCompoundTurnSummaries`)
- `packages/engine/src/sim/snapshot-types.ts` (modify — add `MicroturnSnapshot`)
- `packages/engine/src/sim/snapshot.ts` (modify — add `extractMicroturnSnapshot`)
- `packages/engine/src/sim/delta.ts` (modify)
- `packages/engine/src/sim/enriched-trace-types.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/src/sim/trace-enrichment.ts` (modify)
- `packages/engine/src/sim/trace-eval.ts` (modify)
- `packages/engine/src/sim/trace-writer.ts` (modify)
- `packages/engine/src/sim/eval-report.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify — delete `MoveLog`, rework `GameTrace`)
- `packages/engine/src/kernel/apply-move.ts` (delete — `applyMove` / `applyTrustedMove`)
- `packages/engine/src/kernel/legal-moves.ts` (modify — delete `enumerateLegalMoves`; `LegalMoveEnumerationResult` deletion coordinates with ticket 012's certificate retirement)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/serde.ts` (modify)
- `packages/engine/src/kernel/schema-artifacts.ts` (modify)
- `packages/engine/test/helpers/` (new helper: `move-to-decision.ts`)
- ~183 files under `packages/engine/test/` (modify — mechanical migration, sharded by subdirectory)
- Golden fixtures under `packages/engine/test/fixtures/` (regenerate tagged `traceProtocolVersion: 'spec-140'`)

## Out of Scope

- Agent API rename `chooseMove` → `chooseDecision` and PolicyAgent rework — ticket 007 (next in the atomic-cut chain).
- Worker bridge rewrite — ticket 010.
- Runner store/UI adaptation — ticket 011.
- Certificate machinery retirement — ticket 012 (deletes `LegalMoveEnumerationResult.certificateIndex` and the entire `completion-certificate.ts` tree).
- Tests T6, T7, T13 — bundled in ticket 014.
- Profile migration — ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — all source compiles; no remaining `applyMove` / `applyTrustedMove` references in source (grep-verifiable).
2. `pnpm -F @ludoforge/engine test` — all ~183 migrated tests pass under the new `applyDecision` path. Golden-fixture tests pass against regenerated fixtures.
3. Determinism suite passes — same-seed replay produces bit-identical `decisions[]` across runs.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. **F14 atomic**: zero references to `applyMove`, `applyTrustedMove`, `enumerateLegalMoves`, `MoveLog` in either source or tests after this ticket lands. Transitional references from `adaptLegacyAgentChooseMove` to `chooseMove` persist until ticket 007 — flagged in the file itself.
2. **F8**: `stateHash` equality across replay — every (def, seed) in the determinism corpus produces identical `decisions[].length` + identical `finalState.stateHash` across runs.
3. **F13**: every generated trace has `traceProtocolVersion: 'spec-140'`.
4. `GameTrace.moves` is fully removed (grep returns zero source hits).

### Pre-existing failures note

Downstream invariants introduced in later tickets (T10 no-certificate, T15 FOUNDATIONS conformance) will not pass until those tickets land. Per the skill's multi-ticket atomic-cut rule, this is expected — not a regression. The PR description must acknowledge the transitional state: `adaptLegacyAgentChooseMove` exists until ticket 007.

## Test Plan

### New/Modified Tests

- All existing engine tests migrate mechanically from `applyMove` → `applyDecision`.
- Golden fixtures in `packages/engine/test/fixtures/` regenerate under the spec-140 protocol.
- T6, T7, T13 (new) are authored in ticket 014.

### Commands

1. `pnpm -F @ludoforge/engine build` — must succeed with zero `applyMove` references remaining.
2. `grep -rn "applyMove\|applyTrustedMove\|enumerateLegalMoves\|MoveLog" packages/engine/src/ packages/engine/test/` — should return zero hits (aside from `adapt-legacy-agent.ts`'s internal reference to the legacy agent `chooseMove` method, which is typed, not by name).
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
