import { applyEffects } from './effects.js';
import { createExecutionEffectContext } from './effect-context.js';
import { makeCompiledLifecycleEffectKey, type CompiledEffectSequence } from './effect-compiler-types.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { perfStart, perfDynEnd, type PerfProfiler } from './perf-profiler.js';
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
  profiler?: PerfProfiler,
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
  const t0_resolve = perfStart(profiler);
  const lifecycleEffects = resolveLifecycleEffects(def, event);
  perfDynEnd(profiler, 'lifecycle:resolveEffects', t0_resolve);
  if (lifecycleEffects.length > 0) {
    const t0_apply = perfStart(profiler);
    const traceContext = { eventContext: 'lifecycleEffect', effectPathRoot: `${effectPathRoot}.effects` } as const;
    const compiledEffect = resolveCompiledLifecycleEffect(cachedRuntime, event);
    const effectResult = compiledEffect === undefined
      ? applyEffects(lifecycleEffects, createExecutionEffectContext({
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
        traceContext,
        effectPath: '',
        ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
        ...(profiler === undefined ? {} : { profiler }),
      }))
      : compiledEffect.execute(currentState, currentRng, {}, {
        def,
        adjacencyGraph,
        runtimeTableIndex,
        resources: runtimeResources,
        activePlayer: currentState.activePlayer,
        actorPlayer: currentState.activePlayer,
        moveParams: {},
        fallbackApplyEffects: applyEffects,
        traceContext,
        effectPath: '',
        ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
        ...(profiler === undefined ? {} : { profiler }),
      });
    perfDynEnd(
      profiler,
      compiledEffect === undefined ? 'lifecycle:applyEffects' : 'lifecycle:applyEffects:compiled',
      t0_apply,
    );
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

  const t0_triggerDispatch = perfStart(profiler);
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
  perfDynEnd(profiler, 'lifecycle:dispatchTriggers', t0_triggerDispatch);

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

const resolveCompiledLifecycleEffect = (
  cachedRuntime: GameDefRuntime | undefined,
  event: TriggerEvent,
): CompiledEffectSequence | undefined => {
  if (cachedRuntime === undefined) {
    return undefined;
  }
  if (event.type !== 'phaseEnter' && event.type !== 'phaseExit') {
    return undefined;
  }
  return cachedRuntime.compiledLifecycleEffects.get(
    makeCompiledLifecycleEffectKey(event.phase, event.type === 'phaseEnter' ? 'onEnter' : 'onExit'),
  );
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
