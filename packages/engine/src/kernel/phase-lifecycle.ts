import { applyEffects } from './effects.js';
import { createExecutionEffectContext } from './effect-context.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { findPhaseDef } from './phase-lookup.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { emitTrace } from './execution-collector.js';
import { createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import type { EffectAST, GameDef, GameState, TriggerEvent, TriggerLogEntry } from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

export const dispatchLifecycleEvent = (
  def: GameDef,
  state: GameState,
  event: TriggerEvent,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  evalRuntimeResources?: EvalRuntimeResources,
  effectPathRoot = 'lifecycle',
  cachedRuntime?: GameDefRuntime,
): GameState => {
  if (evalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(evalRuntimeResources, 'dispatchLifecycleEvent evalRuntimeResources');
  }
  const adjacencyGraph = cachedRuntime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = cachedRuntime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const runtimeResources = evalRuntimeResources ?? createEvalRuntimeResources();
  const runtimeCollector = runtimeResources.collector;
  if (event.type === 'phaseEnter' || event.type === 'phaseExit' || event.type === 'turnStart' || event.type === 'turnEnd') {
    emitTrace(runtimeCollector, {
      kind: 'lifecycleEvent',
      eventType: event.type,
      ...(event.type === 'phaseEnter' || event.type === 'phaseExit' ? { phase: event.phase } : {}),
      provenance: {
        phase: String(state.currentPhase),
        eventContext: 'lifecycleEvent',
        effectPath: `${effectPathRoot}.event`,
      },
    });
  }
  let currentState = state;
  let currentRng = { state: state.rng };
  const lifecycleEffects = resolveLifecycleEffects(def, event);
  if (lifecycleEffects.length > 0) {
    const effectResult = applyEffects(lifecycleEffects, createExecutionEffectContext({
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state: currentState,
      rng: currentRng,
      activePlayer: currentState.activePlayer,
      actorPlayer: currentState.activePlayer,
      bindings: {},
      moveParams: {},
      resources: runtimeResources,
      traceContext: { eventContext: 'lifecycleEffect', effectPathRoot: `${effectPathRoot}.effects` },
      effectPath: '',
      ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
    }));
    currentState = effectResult.state;
    currentRng = effectResult.rng;
    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const emittedResult = dispatchTriggers({
        def,
        state: currentState,
        rng: currentRng,
        event: emittedEvent,
        depth: 0,
        maxDepth: def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
        triggerLog: [],
        adjacencyGraph,
        runtimeTableIndex,
        effectPathRoot: `${effectPathRoot}.triggeredEvent(${emittedEvent.type})`,
        evalRuntimeResources: runtimeResources,
        ...(policy === undefined ? {} : { policy }),
      });
      currentState = emittedResult.state;
      currentRng = emittedResult.rng;
      if (triggerLogCollector !== undefined) {
        triggerLogCollector.push(...emittedResult.triggerLog);
      }
    }
  }

  const result = dispatchTriggers({
    def,
    state: currentState,
    rng: currentRng,
    event,
    depth: 0,
    maxDepth: def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
    triggerLog: [],
    adjacencyGraph,
    runtimeTableIndex,
    effectPathRoot: `${effectPathRoot}.eventDispatch`,
    evalRuntimeResources: runtimeResources,
    ...(policy === undefined ? {} : { policy }),
  });

  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...result.triggerLog);
  }

  if (result.state.rng === result.rng.state) {
    return result.state;
  }

  return {
    ...result.state,
    rng: result.rng.state,
  };
};

const resolveLifecycleEffects = (
  def: GameDef,
  event: TriggerEvent,
): readonly EffectAST[] => {
  if (event.type !== 'phaseEnter' && event.type !== 'phaseExit') {
    return [];
  }
  const phase = findPhaseDef(def, event.phase);
  if (phase === undefined) {
    return [];
  }
  return event.type === 'phaseEnter'
    ? (phase.onEnter ?? [])
    : (phase.onExit ?? []);
};
