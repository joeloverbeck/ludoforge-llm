import { applyEffects } from './effects.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createCollector, emitTrace } from './execution-collector.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import type { EffectAST, ExecutionCollector, GameDef, GameState, TriggerEvent, TriggerLogEntry } from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

export const dispatchLifecycleEvent = (
  def: GameDef,
  state: GameState,
  event: TriggerEvent,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
  effectPathRoot = 'lifecycle',
): GameState => {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const runtimeCollector = collector ?? createCollector();
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
    const effectResult = applyEffects(lifecycleEffects, {
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state: currentState,
      rng: currentRng,
      activePlayer: currentState.activePlayer,
      actorPlayer: currentState.activePlayer,
      bindings: {},
      moveParams: {},
      collector: runtimeCollector,
      traceContext: { eventContext: 'lifecycleEffect', effectPathRoot: `${effectPathRoot}.effects` },
      effectPath: '',
      ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
    });
    currentState = effectResult.state;
    currentRng = effectResult.rng;
    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const emittedResult = dispatchTriggers(
        def,
        currentState,
        currentRng,
        emittedEvent,
        0,
        def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
        [],
        adjacencyGraph,
        runtimeTableIndex,
        policy,
        runtimeCollector,
        `${effectPathRoot}.triggeredEvent(${emittedEvent.type})`,
      );
      currentState = emittedResult.state;
      currentRng = emittedResult.rng;
      if (triggerLogCollector !== undefined) {
        triggerLogCollector.push(...emittedResult.triggerLog);
      }
    }
  }

  const result = dispatchTriggers(
    def,
    currentState,
    currentRng,
    event,
    0,
    def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
    [],
    adjacencyGraph,
    runtimeTableIndex,
    policy,
    runtimeCollector,
    `${effectPathRoot}.eventDispatch`,
  );

  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...result.triggerLog);
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
  const phase = [...def.turnStructure.phases, ...(def.turnStructure.interrupts ?? [])]
    .find((entry) => entry.id === event.phase);
  if (phase === undefined) {
    return [];
  }
  return event.type === 'phaseEnter'
    ? (phase.onEnter ?? [])
    : (phase.onExit ?? []);
};
