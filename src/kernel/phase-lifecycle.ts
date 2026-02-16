import { applyEffects } from './effects.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createCollector } from './execution-collector.js';
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
): GameState => {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
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
      collector: createCollector(),
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
