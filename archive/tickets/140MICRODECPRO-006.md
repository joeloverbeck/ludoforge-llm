# 140MICRODECPRO-006: D4 — simulator rewrite + DecisionLog / GameTrace rework + snapshot extension (F14 atomic)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — rewrites `sim/simulator.ts`, replaces `MoveLog` with `DecisionLog`, extends `GameTrace`, and migrates simulator/trace consumers to the spec-140 protocol
**Deps**: `archive/tickets/140MICRODECPRO-005.md`

## Problem

With `publishMicroturn` / `applyDecision` / `advanceAutoresolvable` fully implemented (tickets `003`–`005`), the simulator still advances one whole move at a time and emits the legacy `MoveLog[]` trace shape. This ticket pivots the simulator loop to decision-at-a-time execution, retires `MoveLog` from the simulator trace surface, and upgrades `GameTrace` to `decisions[]` + `compoundTurns[]` + `traceProtocolVersion: 'spec-140'`.

This ticket owns the **simulator/trace atomic cut**, not the full legacy-kernel retirement. Live reassessment shows `applyMove`, `applyTrustedMove`, and `enumerateLegalMoves` are still required by the current microturn bridge and legacy agent stack. Those seams remain internal transitional surfaces until tickets `007` and `012` retire them. The F14 requirement here is therefore: no repo-owned simulator or trace consumer remains on `MoveLog` / `GameTrace.moves` after this ticket lands.

## Assumption Reassessment (2026-04-20)

1. Current simulator `runGame` at `packages/engine/src/sim/simulator.ts` still uses `applyTrustedMove` + `enumerateLegalMoves` + `agent.chooseMove({ legalMoves, certificateIndex, ... })` — confirmed by direct file read.
2. `MoveLog` is declared in `packages/engine/src/kernel/types-core.ts` and is still consumed by simulator/trace modules (`sim/delta.ts`, `sim/enriched-trace-types.ts`, `sim/trace-enrichment.ts`, `sim/trace-eval.ts`, `sim/trace-writer.ts`) plus unit tests — confirmed by blast-radius scan.
3. `GameTrace` still exposes `moves: readonly MoveLog[]` in `types-core.ts`, and that legacy shape is wired through schemas and serialized trace helpers — confirmed.
4. `183` test files currently reference `applyMove` / `applyTrustedMove` — verified via `grep -rl "applyMove\\|applyTrustedMove" packages/engine/test/ | wc -l`. Those files are not all owned by this ticket because many still intentionally prove the still-live legacy application surfaces.
5. Spec 97's `DecisionPointSnapshot` in `packages/engine/src/sim/snapshot-types.ts` is extensible; this ticket can add `MicroturnSnapshot` without replacing the base snapshot contract.
6. Agent API still uses `chooseMove`, and the live `GreedyAgent` / `PolicyAgent` stack still depends on `applyTrustedMove` preview helpers. This ticket therefore keeps the simulator-to-agent boundary transitional via `adaptLegacyAgentChooseMove(...)`. Ticket `007` deletes that shim.
7. Live `packages/engine/src/kernel/microturn/publish.ts` still depends on `enumerateLegalMoves`, and live `packages/engine/src/kernel/microturn/apply.ts` still depends on `applyMove`. Those internal dependencies are outside this ticket's corrected ownership boundary and remain for later retirement.

## Architecture Check

1. F14 atomic at the truthful boundary: `MoveLog`, `GameTrace.moves`, and simulator-owned move-at-a-time trace production retire in this ticket in the same commit. No repo-owned simulator or trace consumer remains on the old trace protocol afterward.
2. Reviewability: the large mechanical fallout is concentrated in simulator, snapshots, trace consumers, schemas, and simulator-adjacent tests rather than the full engine test corpus. This keeps the migration aligned with the actual owned boundary instead of silently absorbing sibling-ticket work.
3. Determinism (F8): spec-140 replay identity is expressed at the decision level. `traceProtocolVersion: 'spec-140'` makes the new trace protocol explicit and reproducible.
4. Spec 97 snapshot infrastructure is extended, not replaced: `MicroturnSnapshot` augments `DecisionPointSnapshot`, preserving compatibility for consumers that still only need the base fields.

## What to Change

### 1. Rewrite `packages/engine/src/sim/simulator.ts`

Replace the current move-at-a-time loop with the per-microturn loop from spec 140 D4:

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
  const selected = adaptLegacyAgentChooseMove(agent, { def, state, microturn, rng: agentRng, runtime });
  agentRngByPlayer[player] = selected.rng;

  const applied = applyDecision(validatedDef, state, selected.decision, kernelOptions, resolvedRuntime);
  state = applied.state;
  decisionLogs.push({ ...applied.log, agentDecision: selected.agentDecision, snapshot });
}

const compoundTurns = synthesizeCompoundTurnSummaries(decisionLogs);
```

Use `CHANCE_RNG_MIX` from ticket `003` to seed the chance RNG: `const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX)`.

### 2. Replace `MoveLog` with `DecisionLog` on the trace surface

- Delete `MoveLog` from `packages/engine/src/kernel/types-core.ts`.
- Reuse the `DecisionLog` shape from `packages/engine/src/kernel/microturn/types.ts` as the canonical trace entry, extending it in the shared surface only if simulator-owned needs require it.
- Update `GameTrace` to carry `decisions`, `compoundTurns`, and `traceProtocolVersion`.
- Do **not** retire `applyMove`, `applyTrustedMove`, or `enumerateLegalMoves` in this ticket. Their remaining live callers are owned by later tickets.

### 3. Add `CompoundTurnSummary` and trace synthesis

Define:

```ts
export interface CompoundTurnSummary {
  readonly turnId: TurnId;
  readonly seatId: SeatId;
  readonly decisionIndexRange: { readonly start: number; readonly end: number };
  readonly microturnCount: number;
  readonly turnStopReason: 'retired' | 'terminal' | 'maxTurns';
}
```

Add `packages/engine/src/sim/compound-turns.ts` with `synthesizeCompoundTurnSummaries(decisions: readonly DecisionLog[]): readonly CompoundTurnSummary[]`.

### 4. Extend snapshot support with `MicroturnSnapshot`

In `packages/engine/src/sim/snapshot-types.ts`:

```ts
export interface MicroturnSnapshot extends DecisionPointSnapshot {
  readonly decisionContextKind: DecisionContextKind;
  readonly frameId: DecisionFrameId;
  readonly turnId: TurnId;
  readonly compoundTurnTrace: readonly CompoundTurnTraceEntry[];
}
```

Add `extractMicroturnSnapshot(...)` alongside `extractDecisionPointSnapshot(...)`.

### 5. Migrate simulator and trace consumers

Update each consumer of `MoveLog` / `GameTrace.moves`:

- `packages/engine/src/sim/delta.ts`
- `packages/engine/src/sim/enriched-trace-types.ts`
- `packages/engine/src/sim/index.ts`
- `packages/engine/src/sim/trace-enrichment.ts`
- `packages/engine/src/sim/trace-eval.ts`
- `packages/engine/src/sim/trace-writer.ts`
- `packages/engine/src/sim/eval-report.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/kernel/schema-artifacts.ts`
- `packages/engine/src/kernel/serde.ts`

Each consumer now reads `.decisions[]` and uses `compoundTurns[]` when it needs aggregate turn-level analytics.

### 6. Add temporary legacy-agent adapter

Create `packages/engine/src/sim/adapt-legacy-agent.ts`:

```ts
export const adaptLegacyAgentChooseMove = (
  agent: Agent,
  input: { def: ValidatedGameDef; state: GameState; microturn: MicroturnState; rng: Rng; runtime?: GameDefRuntime },
): { decision: Decision; rng: Rng; agentDecision?: AgentDecisionTrace }
```

The adapter must be source-commented `DELETES IN TICKET 007`.

### 7. Migrate simulator-owned tests and fixtures

Update the tests and fixtures that consume simulator traces, snapshots, or `GameTrace` shape directly. This includes simulator-unit tests, snapshot serialization tests, trace-eval/report tests, trace writers, and any helper utilities or golden fixtures that serialize or inspect simulator traces.

Do **not** mechanically migrate the full `applyMove` / `applyTrustedMove` engine test corpus here. Those tests still prove live legacy surfaces and remain owned by later tickets.

### 8. Regenerate schemas and built outputs

Engine tests run against `packages/engine/dist/`. After source changes, `pnpm -F @ludoforge/engine build` must regenerate `dist`, and any affected schema artifacts must be kept in sync with the new trace shape.

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
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/serde.ts` (modify)
- `packages/engine/src/kernel/schema-artifacts.ts` (modify)
- simulator and trace-shape tests under `packages/engine/test/unit/sim/`, `packages/engine/test/integration/sim/`, and any directly affected fixtures/helpers under `packages/engine/test/fixtures/` / `packages/engine/test/helpers/`

## Out of Scope

- Agent API rename `chooseMove` → `chooseDecision` and PolicyAgent rework — ticket `007`
- Profile migration — ticket `008`
- Worker bridge rewrite — ticket `010`
- Runner store/UI adaptation — ticket `011`
- Retirement of `applyMove`, `applyTrustedMove`, `enumerateLegalMoves`, and certificate-era machinery — tickets `007` and `012`
- Tests T6, T7, T13 — ticket `014`

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — all source compiles with the simulator and trace surfaces on the spec-140 protocol.
2. `pnpm -F @ludoforge/engine test` — simulator/trace tests and regenerated golden/serialization fixtures pass under the new `GameTrace` shape.
3. Determinism suite passes — same-seed replay produces bit-identical `decisions[]` across runs.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. **F14 atomic at the simulator/trace boundary**: zero repo-owned simulator or trace consumer references to `MoveLog` or `GameTrace.moves` after this ticket lands.
2. **F8**: `stateHash` equality across replay — every `(def, seed)` in the determinism corpus produces identical `decisions[].length` and identical `finalState.stateHash` across runs.
3. **F13**: every generated trace has `traceProtocolVersion: 'spec-140'`.
4. `GameTrace.moves` is fully removed from source, schemas, and simulator-owned tests/fixtures.

### Pre-existing failures note

Downstream invariants introduced in later tickets (T10 no-certificate, T15 FOUNDATIONS conformance, full legacy-kernel retirement) will not pass until those tickets land. This ticket must record the transitional state truthfully: `adaptLegacyAgentChooseMove` exists until ticket `007`, and legacy kernel application/legality helpers still survive until later retirement work.

## Test Plan

### New/Modified Tests

- Simulator/trace tests and directly affected helper/fixture tests migrate to the `DecisionLog` / `GameTrace.decisions` protocol.
- Golden fixtures in `packages/engine/test/fixtures/` that serialize simulator traces regenerate under the spec-140 protocol.
- T6, T7, T13 (new) are authored in ticket `014`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `grep -rn "MoveLog\\|GameTrace\\.moves" packages/engine/src/ packages/engine/test/`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build`
5. `pnpm turbo test`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-20

Completed the simulator/trace atomic cut for Spec 140 D4 at the truthful Foundation-aligned boundary. `runGame` now advances through `advanceAutoresolvable` + `publishMicroturn` + `adaptLegacyAgentChooseMove` + `applyDecision`, and emitted traces now use `decisions[]`, `compoundTurns[]`, and `traceProtocolVersion: 'spec-140'`. `MoveLog` and `GameTrace.moves` were removed from the simulator-owned trace surface, serialized traces, schemas, snapshots, and trace consumers, while the temporary legacy-agent shim remains in place for ticket `007` and the live internal kernel dependencies on `applyMove` / `enumerateLegalMoves` remain deferred to later retirement tickets.

Live implementation corrections recorded during delivery:

1. The microturn bridge must treat published root `actionSelection` params as a subset of the completed selected move params so event-branch and chooser-expanded actions still match the published frontier.
2. The workspace build exposed a runner bundling regression after `microturn/apply.ts` imported `node:util`; this was fixed by switching the comparison path to the browser-safe local `deepEqual` helper.
3. The convergence witness seeds `1049` and `1054` are truthful `noLegalMoves` terminals under the new protocol, not adapter failures. The stable witness matrix is now `1020 -> terminal`, `1049 -> noLegalMoves`, `1054 -> noLegalMoves`.
4. The grep-zero acceptance criterion is satisfied at the repo-owned trace contract level. The remaining grep hits are helper function names like `makeMoveLog(...)` in simulator trace-eval/report tests, not `MoveLog` type consumers or `GameTrace.moves` accesses.

Proof completed on the final tree with:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `grep -rn "MoveLog\\|GameTrace\\.moves" packages/engine/src/ packages/engine/test/`
4. `pnpm turbo build`
5. `pnpm turbo test`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
