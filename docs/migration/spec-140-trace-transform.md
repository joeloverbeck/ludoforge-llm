# Spec 140 Trace Transform Design

This document specifies the one-time offline transform from legacy `GameTrace.moves: MoveLog[]` to the Spec 140 trace protocol (`GameTrace.decisions: DecisionLog[]`, `GameTrace.compoundTurns[]`, `traceProtocolVersion: 'spec-140'`).

The transform exists for analytics continuity only. It is not a replay-compatibility layer.

## Scope

Input:

- Pre-Spec-140 `GameTrace`
- `moves: readonly MoveLog[]`
- final state, terminal result, turn count, and stop reason from the legacy trace

Output:

- Post-Spec-140 `GameTrace`
- `decisions: readonly DecisionLog[]`
- `compoundTurns: readonly CompoundTurnSummary[]`
- `traceProtocolVersion: 'spec-140'`
- `traceGeneration: 'migrated-spec-140'` on the migrated artifact wrapper or migration metadata block

The transform is intentionally lossy. It should preserve enough structure for historical comparison metrics, report playback summaries, and policy-quality witnesses, but it must not be used as the determinism or replay oracle.

## Current Consumers

The live repo consumers that motivate this migration are:

- [trace-eval.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/sim/trace-eval.ts)
  - today reads `trace.moves` for game length proxies, action diversity, branching factor, interaction proxy, and repeated-state checks
- [aggregate-evals.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/sim/aggregate-evals.ts)
  - aggregates per-seed evaluations after `trace-eval.ts`
- [trace-enrichment.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/sim/trace-enrichment.ts)
  - today enriches `trace.moves` with human-readable `seatId`
- evaluation-report historical playback
- cross-spec witnesses in `packages/engine/test/policy-profile-quality/`

## Explicit Non-Consumers

The migrated trace must not be used for:

- replay-identity tests
- determinism gates
- authoritative decision-stack debugging
- byte-identical re-execution of historical games

Those surfaces regenerate from seed under the new kernel per F14/F16.

## Output Contract

Each migrated trace emits a standard Spec-140-shaped trace with migration metadata.

### DecisionLog shape

The target runtime shape is the Spec 140 `DecisionLog` contract:

```ts
interface DecisionLog {
  readonly stateHash: bigint;
  readonly seatId: SeatId | '__chance' | '__kernel';
  readonly decisionContextKind: DecisionContextKind;
  readonly decisionKey: DecisionKey | null;
  readonly decision: Decision;
  readonly turnId: TurnId;
  readonly turnRetired: boolean;
  readonly legalActionCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: MicroturnSnapshot;
}
```

### CompoundTurnSummary shape

```ts
interface CompoundTurnSummary {
  readonly turnId: TurnId;
  readonly seatId: SeatId;
  readonly decisionIndexRange: { readonly start: number; readonly end: number };
  readonly microturnCount: number;
  readonly turnStopReason: 'retired' | 'terminal' | 'maxTurns';
}
```

### Migration metadata

The migrated artifact should carry:

- `traceProtocolVersion: 'spec-140'`
- `traceGeneration: 'migrated-spec-140'`
- a `migrationNotes` string or sibling metadata block that states the trace is analytics-grade only

## Transform Algorithm

### 1. Preserve top-level identity

Copy through unchanged:

- `gameDefId`
- `seed`
- `finalState`
- `result`
- `turnsCount`
- `stopReason`

These fields already describe the observed historical run and do not require replay reconstruction.

### 2. Partition by legacy move index

Process each legacy `MoveLog` in order. Each input move produces one migrated compound-turn group with a fresh monotonic `turnId`.

Base fields copied from the `MoveLog`:

- `stateHash`
- `player` to `seatId`
- `legalMoveCount`
- `deltas`
- `triggerFirings`
- `warnings`
- optional traces (`effectTrace`, `conditionTrace`, `decisionTrace`, `selectorTrace`)
- `agentDecision`
- `snapshot`

### 3. Emit the mandatory lower-bound action-selection decision

Every legacy move yields at least one migrated `DecisionLog`:

- `decisionContextKind: 'actionSelection'`
- `decisionKey: null`
- `decision`: the selected action id from `move.actionId`
- `seatId`: legacy move player seat
- `legalActionCount`: legacy `MoveLog.legalMoveCount`
- `turnRetired`: `true` only if no additional synthetic sub-decisions are emitted for this move

This row is the minimum truthful lower bound because the old trace always proves that one action-selection decision occurred.

### 4. Optionally emit synthetic sub-decisions from final move params

When the move parameters can be decomposed against authored decision-order metadata, emit additional synthetic `DecisionLog` rows after the action-selection row.

The preferred decomposition source is:

1. compiled decision-order metadata from the post-migration `GameDef`
2. if needed, a dedicated offline helper that replays authored chooser order against the move's final params

For each final binding that can be ordered deterministically:

- `chooseOne` bindings emit one synthetic `DecisionLog` with the chosen value
- `chooseNStep` bindings emit the minimum constructive sequence implied by the final set:
  - one synthetic `add` per selected value in stable authored option order
  - one synthetic `confirm`
- `stochasticResolve` is never reconstructed from legacy traces unless the sampled outcome is already explicit in legacy trace data

The transform must choose the minimum constructive sequence, not attempt to guess the exact historical click/order path.

## Ambiguity Resolution

The legacy trace does not record inter-decision state snapshots inside a compound move. That creates three ambiguity classes.

### 1. Unknown intra-turn ordering

If multiple sub-decisions were encoded into one final `Move`, the exact historical order may be unknown. Resolve this by using authored decision order from the compiled action/effect surface. If authored order still leaves ambiguity, choose the deterministic minimum constructive order.

### 2. Unknown choose-N path churn

Legacy moves record the final bound set, not the user's intermediate add/remove path. Resolve this by emitting the smallest constructive path:

- stable ordered `add` decisions for the final selected set
- one terminal `confirm`

Because the historical user may have added, removed, and re-added values, the emitted sequence is only a lower bound on actual microturn count.

### 3. Unknown inter-decision state deltas

Legacy `MoveLog.deltas` and traces describe the post-move effect, not each intermediate decision state's deltas. Resolve this by attaching the legacy `deltas`, trigger firings, warnings, and traces only to the final synthetic decision row in that migrated compound turn. Earlier synthetic rows carry empty `deltas` / traces.

This preserves aggregate end-of-turn effects without fabricating intermediate state transitions the legacy trace never recorded.

## Lower-Bound Semantics

`compoundTurns[].microturnCount` in migrated traces is a floor, not an exact historical count.

Why:

- the old trace proves at least one action-selection decision
- final move params may prove additional chooser bindings
- the old trace does not prove intermediate re-selection churn, invisible kernel auto-resolve steps, or transient choice states

Required wording for downstream consumers:

- migrated `microturnCount` is a lower bound on the decomposed compound turn
- comparisons that depend on exact microturn counts require rerunning from seed under the Spec-140 kernel

## Consumer-Specific Guidance

### `trace-eval.ts`

Safe to preserve or derive:

- turn-count metrics
- action diversity
- dominant action frequency
- interaction proxy based on final deltas

Needs care:

- microturn-level branching factor cannot be reconstructed exactly from `legalMoveCount`
- repeated-state and stall detection remain move-level only on migrated traces unless the evaluator explicitly falls back to `compoundTurns`

Recommended handling:

- keep historical comparisons on move-level metrics using `compoundTurns`
- mark any microturn-specific metric as unavailable or lower-bound-only on migrated traces

### `aggregate-evals.ts`

No special transform logic. It should aggregate the migrated evaluations produced by the updated `trace-eval.ts`.

### `trace-enrichment.ts`

Extend enrichment from legacy `moves` to:

- `decisions[]` by adding human-readable `seatId`
- optionally `compoundTurns[]` by reusing the seat id of the first decision in the range

### Historical report playback

Display should be explicit that migrated traces are reconstructed summaries. Recommended UI wording:

- `Historical migrated trace`
- `Microturn detail reconstructed from legacy move log`

### `policy-profile-quality/`

Use migrated traces only for cross-spec aggregate comparisons and witness summaries. Any witness that depends on exact decision ordering, exact microturn counts, or replay identity must be regenerated from seed under Spec 140.

## Failure Modes

The transform should fail closed when:

- the referenced action id no longer exists in the migrated `GameDef`
- authored decision-order metadata is missing for a move that the transform is configured to decompose
- move params cannot be mapped deterministically to the authored chooser surface

Fallback behavior in those cases:

- still emit the mandatory single action-selection decision row
- attach a migration warning to the artifact metadata
- set `compoundTurns[].microturnCount` to `1`

Do not fabricate partial chooser decisions when the decomposition is not defensible.

## F14 Framing

This transform is a one-time offline migration tool, not a runtime compatibility layer.

That is F14-compliant because:

- production runtime does not keep a legacy replay path alive
- determinism and replay tests rerun from seed under the new protocol
- the migrated artifact exists only to preserve historical experiment comparability through migrated snapshots

In repo terms: historical reproducibility is preserved through migrated analytics artifacts, not through shipping a second runtime protocol.
