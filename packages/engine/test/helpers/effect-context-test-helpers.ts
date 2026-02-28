import { asPlayerId, type PlayerId } from '../../src/kernel/branded.js';
import {
  createDiscoveryProbeEffectContext,
  createDiscoveryStrictEffectContext,
  createExecutionEffectContext,
  type EffectContext,
  type EffectTraceContext,
  type PhaseTransitionBudget,
} from '../../src/kernel/effect-context.js';
import { createCollector } from '../../src/kernel/execution-collector.js';
import { createRng } from '../../src/kernel/prng.js';
import { buildAdjacencyGraph } from '../../src/kernel/spatial.js';
import type { FreeOperationZoneFilterDiagnostics } from '../../src/kernel/eval-context.js';
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

type RuntimeEffectContextOptions = Parameters<typeof createExecutionEffectContext>[0];

interface EffectContextTestOptions {
  readonly def: GameDef;
  readonly state: GameState;
  readonly adjacencyGraph?: AdjacencyGraph;
  readonly rng?: Rng;
  readonly activePlayer?: PlayerId;
  readonly actorPlayer?: PlayerId;
  readonly decisionAuthorityPlayer?: PlayerId;
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
  readonly collector?: ExecutionCollector;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly iterationPath?: string;
}

export type EffectContextTestOverrides = Partial<RuntimeEffectContextOptions>;

const makeRuntimeEffectContextOptions = ({
  def,
  state,
  adjacencyGraph = buildAdjacencyGraph(def.zones),
  rng = createRng(1n),
  activePlayer = asPlayerId(0),
  actorPlayer = activePlayer,
  decisionAuthorityPlayer = activePlayer,
  bindings = {},
  moveParams = {},
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
  iterationPath,
}: EffectContextTestOptions): RuntimeEffectContextOptions => ({
  def,
  adjacencyGraph,
  state,
  rng,
  activePlayer,
  actorPlayer,
  decisionAuthorityPlayer,
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
  collector,
  ...(phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget }),
  ...(iterationPath === undefined ? {} : { iterationPath }),
});

export const makeExecutionEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createExecutionEffectContext(makeRuntimeEffectContextOptions(options));

export const makeDiscoveryEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createDiscoveryStrictEffectContext(makeRuntimeEffectContextOptions(options));

export const makeDiscoveryProbeEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createDiscoveryProbeEffectContext(makeRuntimeEffectContextOptions(options));
