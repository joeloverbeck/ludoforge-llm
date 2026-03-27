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
import type { FreeOperationExecutionOverlay } from '../../src/kernel/free-operation-overlay.js';
import { createRng } from '../../src/kernel/prng.js';
import { emptyScope, withIterationSegment, type DecisionScope } from '../../src/kernel/decision-scope.js';
import { buildAdjacencyGraph } from '../../src/kernel/spatial.js';
import type { RuntimeTableIndex } from '../../src/kernel/runtime-table-index.js';
import type { AdjacencyGraph } from '../../src/kernel/spatial.js';
import type {
  ExecutionCollector,
  GameDef,
  GameState,
  MoveParamScalar,
  MoveParamValue,
  Rng,
} from '../../src/kernel/types.js';
import { makeEvalRuntimeResources } from './eval-context-test-helpers.js';

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
  readonly runtimeTableIndex?: RuntimeTableIndex | undefined;
  readonly moveParams?: Readonly<Record<string, MoveParamValue>>;
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly freeOperation?: boolean;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay | undefined;
  readonly maxQueryResults?: number | undefined;
  readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  readonly collector?: ExecutionCollector;
  readonly resources?: RuntimeEffectContextOptions['resources'];
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly decisionScope?: DecisionScope;
  readonly iterationPath?: string;
}

export type EffectContextTestOverrides = Partial<RuntimeEffectContextOptions> & {
  readonly collector?: ExecutionCollector;
  readonly iterationPath?: string;
};

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
  resources,
  runtimeTableIndex,
  traceContext,
  effectPath,
  maxEffectOps,
  freeOperation,
  freeOperationOverlay,
  maxQueryResults,
  transientDecisionSelections,
  phaseTransitionBudget,
  decisionScope,
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
  ...(freeOperationOverlay === undefined ? {} : { freeOperationOverlay }),
  ...(maxQueryResults === undefined ? {} : { maxQueryResults }),
  ...(transientDecisionSelections === undefined ? {} : { transientDecisionSelections }),
  resources: resources ?? makeEvalRuntimeResources({ collector }),
  ...(phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget }),
  decisionScope: decisionScope ?? (() => {
    if (iterationPath === undefined || iterationPath === '') {
      return emptyScope();
    }
    const indices = [...iterationPath.matchAll(/\[(\d+)\]/gu)].map((match) => Number.parseInt(match[1]!, 10));
    return indices.reduce<DecisionScope>(
      (scope, index) => withIterationSegment(scope, index),
      emptyScope(),
    );
  })(),
});

export const makeExecutionEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createExecutionEffectContext(makeRuntimeEffectContextOptions(options));

export const makeDiscoveryEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createDiscoveryStrictEffectContext(makeRuntimeEffectContextOptions(options));

export const makeDiscoveryProbeEffectContext = (options: EffectContextTestOptions): EffectContext =>
  createDiscoveryProbeEffectContext(makeRuntimeEffectContextOptions(options));
