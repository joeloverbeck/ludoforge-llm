import { applyEffects } from './effects.js';
import { createExecutionEffectContext } from './effect-context.js';
import {
  CompiledEffectVerificationError,
  makeCompiledLifecycleEffectKey,
  type CompiledEffectSequence,
} from './effect-compiler-types.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { perfStart, perfDynEnd, type PerfProfiler } from './perf-profiler.js';
import { findPhaseDef } from './phase-lookup.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createCollectorLike, emitTrace } from './execution-collector.js';
import { createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { emptyScope } from './decision-scope.js';
import { deepEqual } from './deep-equal.js';
import type { EffectAST, GameDef, GameState, TriggerEvent, TriggerLogEntry } from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import { computeFullHash, createZobristTable } from './zobrist.js';

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
    const beforeWarningCount = runtimeCollector.warnings.length;
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
      ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
      ...(policy?.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: policy.verifyCompiledEffects }),
      ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
      ...(profiler === undefined ? {} : { profiler }),
      }))
      : executeLifecycleEffect({
        def,
        state: currentState,
        rng: currentRng,
        lifecycleEffects,
        compiledEffect,
        runtimeResources,
        adjacencyGraph,
        runtimeTableIndex,
        traceContext,
        policy,
        profiler,
        cachedRuntime,
        beforeWarningCount,
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
        ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
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
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
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

interface ExecuteLifecycleEffectOptions {
  readonly def: GameDef;
  readonly state: GameState;
  readonly rng: { state: GameState['rng'] };
  readonly lifecycleEffects: readonly EffectAST[];
  readonly compiledEffect: CompiledEffectSequence;
  readonly runtimeResources: EvalRuntimeResources;
  readonly adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>;
  readonly runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>;
  readonly traceContext: { readonly eventContext: 'lifecycleEffect'; readonly effectPathRoot: string };
  readonly policy: MoveExecutionPolicy | undefined;
  readonly profiler: PerfProfiler | undefined;
  readonly cachedRuntime: GameDefRuntime | undefined;
  readonly beforeWarningCount: number;
}

const executeLifecycleEffect = ({
  def,
  state,
  rng,
  lifecycleEffects,
  compiledEffect,
  runtimeResources,
  adjacencyGraph,
  runtimeTableIndex,
  traceContext,
  policy,
  profiler,
  cachedRuntime,
  beforeWarningCount,
}: ExecuteLifecycleEffectOptions): ReturnType<CompiledEffectSequence['execute']> => {
  const compiledContext = {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    resources: runtimeResources,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    moveParams: {},
    fallbackApplyEffects: applyEffects,
    traceContext,
    effectPath: '',
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
    ...(policy?.verifyCompiledEffects === undefined ? {} : { verifyCompiledEffects: policy.verifyCompiledEffects }),
    ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
    ...(profiler === undefined ? {} : { profiler }),
  } as const;
  const compiledResult = compiledEffect.execute(state, rng, {}, compiledContext);
  if (policy?.verifyCompiledEffects !== true) {
    return compiledResult;
  }

  const verificationCollector = createCollectorLike(runtimeResources.collector);
  const interpretedResult = applyEffects(lifecycleEffects, createExecutionEffectContext({
    def,
    adjacencyGraph,
    runtimeTableIndex,
    state,
    rng,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: {},
    moveParams: {},
    resources: createEvalRuntimeResources({ collector: verificationCollector }),
    traceContext,
    effectPath: '',
    ...(cachedRuntime === undefined ? {} : { cachedRuntime }),
    verifyCompiledEffects: true,
    ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
    ...(profiler === undefined ? {} : { profiler }),
  }));
  verifyLifecycleResultParity(
    def,
    compiledEffect,
    compiledResult,
    interpretedResult,
    runtimeResources.collector.warnings.slice(beforeWarningCount),
    verificationCollector.warnings,
    cachedRuntime,
  );
  return compiledResult;
};

const verifyLifecycleResultParity = (
  def: GameDef,
  compiledEffect: CompiledEffectSequence,
  compiledResult: ReturnType<CompiledEffectSequence['execute']>,
  interpretedResult: ReturnType<typeof applyEffects>,
  compiledWarnings: readonly unknown[],
  interpretedWarnings: readonly unknown[],
  cachedRuntime?: GameDefRuntime,
): void => {
  const table = cachedRuntime?.zobristTable ?? createZobristTable(def);
  const compiledHash = computeFullHash(table, compiledResult.state);
  const interpretedHash = computeFullHash(table, interpretedResult.state);

  if (compiledHash !== interpretedHash) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledEffect.phaseId,
      lifecycle: compiledEffect.lifecycle,
      coverageRatio: compiledEffect.coverageRatio,
      mismatchKind: 'stateHash',
      compiledValue: compiledHash,
      interpretedValue: interpretedHash,
    });
  }
  if (!deepEqual(compiledResult.rng, interpretedResult.rng)) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledEffect.phaseId,
      lifecycle: compiledEffect.lifecycle,
      coverageRatio: compiledEffect.coverageRatio,
      mismatchKind: 'rng',
      compiledValue: compiledResult.rng,
      interpretedValue: interpretedResult.rng,
    });
  }
  if (!deepEqual(compiledResult.emittedEvents ?? [], interpretedResult.emittedEvents ?? [])) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledEffect.phaseId,
      lifecycle: compiledEffect.lifecycle,
      coverageRatio: compiledEffect.coverageRatio,
      mismatchKind: 'emittedEvents',
      compiledValue: compiledResult.emittedEvents ?? [],
      interpretedValue: interpretedResult.emittedEvents ?? [],
    });
  }
  if (!deepEqual(compiledResult.pendingChoice, interpretedResult.pendingChoice)) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledEffect.phaseId,
      lifecycle: compiledEffect.lifecycle,
      coverageRatio: compiledEffect.coverageRatio,
      mismatchKind: 'pendingChoice',
      compiledValue: compiledResult.pendingChoice,
      interpretedValue: interpretedResult.pendingChoice,
    });
  }
  if (compiledResult.pendingChoice !== undefined || interpretedResult.pendingChoice !== undefined) {
    if (!deepEqual(compiledResult.bindings ?? {}, interpretedResult.bindings ?? {})) {
      throw new CompiledEffectVerificationError({
        phaseId: compiledEffect.phaseId,
        lifecycle: compiledEffect.lifecycle,
        coverageRatio: compiledEffect.coverageRatio,
        mismatchKind: 'bindings',
        compiledValue: compiledResult.bindings ?? {},
        interpretedValue: interpretedResult.bindings ?? {},
      });
    }
    if (!deepEqual(compiledResult.decisionScope ?? emptyScope(), interpretedResult.decisionScope ?? emptyScope())) {
      throw new CompiledEffectVerificationError({
        phaseId: compiledEffect.phaseId,
        lifecycle: compiledEffect.lifecycle,
        coverageRatio: compiledEffect.coverageRatio,
        mismatchKind: 'decisionScope',
        compiledValue: compiledResult.decisionScope ?? emptyScope(),
        interpretedValue: interpretedResult.decisionScope ?? emptyScope(),
      });
    }
  }
  if (!deepEqual(compiledWarnings, interpretedWarnings)) {
    throw new CompiledEffectVerificationError({
      phaseId: compiledEffect.phaseId,
      lifecycle: compiledEffect.lifecycle,
      coverageRatio: compiledEffect.coverageRatio,
      mismatchKind: 'warnings',
      compiledValue: compiledWarnings,
      interpretedValue: interpretedWarnings,
    });
  }
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
