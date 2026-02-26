import { asPlayerId, type PlayerId } from '../../src/kernel/branded.js';
import { createCollector } from '../../src/kernel/execution-collector.js';
import { createRng } from '../../src/kernel/prng.js';
import { buildAdjacencyGraph } from '../../src/kernel/spatial.js';
import type { FreeOperationZoneFilterDiagnostics } from '../../src/kernel/eval-context.js';
import type { EffectContext, EffectTraceContext, PhaseTransitionBudget } from '../../src/kernel/effect-context.js';
import type { InterpreterMode } from '../../src/kernel/interpreter-mode.js';
import type { RuntimeTableIndex } from '../../src/kernel/runtime-table-index.js';
import type { AdjacencyGraph } from '../../src/kernel/spatial.js';
import type {
  ConditionAST,
  ExecutionCollector,
  GameDef,
  GameState,
  MoveParamValue,
  Rng,
} from '../../src/kernel/types.js';

interface EffectContextTestOptions {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph?: AdjacencyGraph;
  readonly rng?: Rng;
  readonly activePlayer?: PlayerId;
  readonly actorPlayer?: PlayerId;
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly moveParams?: Readonly<Record<string, MoveParamValue>>;
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly freeOperation?: boolean;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly maxQueryResults?: number;
  readonly mode?: InterpreterMode;
  readonly collector?: ExecutionCollector;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
}

export const makeEffectContext = ({
  def,
  state,
  adjacencyGraph = buildAdjacencyGraph(def.zones),
  rng = createRng(1n),
  activePlayer = asPlayerId(0),
  actorPlayer = activePlayer,
  bindings = {},
  moveParams = {},
  mode = 'execution',
  collector = createCollector(),
  runtimeTableIndex,
  traceContext,
  effectPath,
  maxEffectOps,
  freeOperation,
  freeOperationZoneFilter,
  freeOperationZoneFilterDiagnostics,
  maxQueryResults,
  phaseTransitionBudget,
}: EffectContextTestOptions): EffectContext => ({
  def,
  adjacencyGraph,
  state,
  rng,
  activePlayer,
  actorPlayer,
  bindings,
  ...(runtimeTableIndex === undefined ? {} : { runtimeTableIndex }),
  moveParams,
  ...(traceContext === undefined ? {} : { traceContext }),
  ...(effectPath === undefined ? {} : { effectPath }),
  ...(maxEffectOps === undefined ? {} : { maxEffectOps }),
  ...(freeOperation === undefined ? {} : { freeOperation }),
  ...(freeOperationZoneFilter === undefined ? {} : { freeOperationZoneFilter }),
  ...(freeOperationZoneFilterDiagnostics === undefined ? {} : { freeOperationZoneFilterDiagnostics }),
  ...(maxQueryResults === undefined ? {} : { maxQueryResults }),
  mode,
  collector,
  ...(phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget }),
});
