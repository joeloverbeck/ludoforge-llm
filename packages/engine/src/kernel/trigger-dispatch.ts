import { applyEffects } from './effects.js';
import { createExecutionEffectContext } from './effect-context.js';
import { evalCondition } from './eval-condition.js';
import { createEvalContext, createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { kernelRuntimeError } from './runtime-error.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import type { GameDef, GameState, Rng, TriggerDef, TriggerEvent, TriggerLogEntry } from './types.js';

export interface DispatchTriggersResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly triggerLog: readonly TriggerLogEntry[];
}

export interface DispatchTriggersRequest {
  readonly def: GameDef;
  readonly state: GameState;
  readonly rng: Rng;
  readonly event: TriggerEvent;
  readonly depth: number;
  readonly maxDepth: number;
  readonly triggerLog: readonly TriggerLogEntry[];
  readonly adjacencyGraph?: AdjacencyGraph;
  readonly runtimeTableIndex?: RuntimeTableIndex;
  readonly policy?: MoveExecutionPolicy;
  readonly effectPathRoot?: string;
  readonly evalRuntimeResources?: EvalRuntimeResources;
}

export const dispatchTriggers = (request: DispatchTriggersRequest): DispatchTriggersResult => {
  const {
    def,
    state,
    rng,
    event,
    depth,
    maxDepth,
    triggerLog,
    policy,
  } = request;
  const adjacencyGraph = request.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = request.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const effectPathRoot = request.effectPathRoot ?? `triggerEvent(${event.type})`;
  const runtimeResources = request.evalRuntimeResources ?? createEvalRuntimeResources();
  validateDispatchTriggerRequest(request);

  if (depth > maxDepth) {
    return {
      state,
      rng,
      triggerLog: [...triggerLog, { kind: 'truncated', event, depth }],
    };
  }

  let nextState = state;
  let nextRng = rng;
  let nextTriggerLog: TriggerLogEntry[] = [...triggerLog];

  for (const trigger of def.triggers) {
    if (!matchesEvent(trigger, event)) {
      continue;
    }

    const evalCtx = createEvalContext({
      def,
      adjacencyGraph,
      state: nextState,
      activePlayer: nextState.activePlayer,
      actorPlayer: nextState.activePlayer,
      bindings: createEventBindings(event),
      runtimeTableIndex,
      resources: runtimeResources,
    });

    if (trigger.match !== undefined && !evalCondition(trigger.match, evalCtx)) {
      continue;
    }

    if (trigger.when !== undefined && !evalCondition(trigger.when, evalCtx)) {
      continue;
    }

    const effectResult = applyEffects(trigger.effects, createExecutionEffectContext({
      ...evalCtx,
      resources: runtimeResources,
      rng: nextRng,
      moveParams: {},
      traceContext: {
        eventContext: 'triggerEffect',
        effectPathRoot: `${effectPathRoot}.trigger:${trigger.id}.effects`,
        ...(event.type === 'actionResolved' ? { actionId: String(event.action) } : {}),
      },
      effectPath: '',
      ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
    }));
    nextState = effectResult.state;
    nextRng = effectResult.rng;
    nextTriggerLog.push({
      kind: 'fired',
      triggerId: trigger.id,
      event,
      depth,
    });

    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const cascadeResult = dispatchTriggers({
        def,
        state: nextState,
        rng: nextRng,
        event: emittedEvent,
        depth: depth + 1,
        maxDepth,
        triggerLog: nextTriggerLog,
        adjacencyGraph,
        runtimeTableIndex,
        effectPathRoot: `${effectPathRoot}.cascade(${emittedEvent.type})`,
        evalRuntimeResources: runtimeResources,
        ...(policy === undefined ? {} : { policy }),
      });
      nextState = cascadeResult.state;
      nextRng = cascadeResult.rng;
      nextTriggerLog = [...cascadeResult.triggerLog];
    }
  }

  return {
    state: nextState,
    rng: nextRng,
    triggerLog: nextTriggerLog,
  };
};

const matchesEvent = (trigger: TriggerDef, event: TriggerEvent): boolean => {
  const triggerEvent = trigger.event;
  if (triggerEvent.type !== event.type) {
    return false;
  }

  switch (event.type) {
    case 'turnStart':
    case 'turnEnd':
      return true;
    case 'phaseEnter':
    case 'phaseExit':
      return triggerEvent.type === event.type && triggerEvent.phase === event.phase;
    case 'actionResolved':
      return triggerEvent.type === 'actionResolved' && (triggerEvent.action === undefined || triggerEvent.action === event.action);
    case 'tokenEntered':
      return triggerEvent.type === 'tokenEntered' && (triggerEvent.zone === undefined || triggerEvent.zone === event.zone);
    case 'varChanged':
      return (
        triggerEvent.type === 'varChanged' &&
        (triggerEvent.scope === undefined || triggerEvent.scope === event.scope) &&
        (triggerEvent.var === undefined || triggerEvent.var === event.var) &&
        (triggerEvent.player === undefined || triggerEvent.player === event.player) &&
        (triggerEvent.zone === undefined || triggerEvent.zone === event.zone)
      );
  }
};

const validateDispatchTriggerRequest = (request: DispatchTriggersRequest): void => {
  if (request.effectPathRoot !== undefined && typeof request.effectPathRoot !== 'string') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.effectPathRoot must be a string when provided; received ${typeof request.effectPathRoot}`,
    );
  }
  if (request.evalRuntimeResources !== undefined && !isEvalRuntimeResources(request.evalRuntimeResources)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'dispatchTriggers request.evalRuntimeResources must include collector and queryRuntimeCache ownership fields',
    );
  }
};

const isEvalRuntimeResources = (value: unknown): value is EvalRuntimeResources => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { collector?: unknown; queryRuntimeCache?: unknown };
  return typeof candidate.collector === 'object'
    && candidate.collector !== null
    && typeof candidate.queryRuntimeCache === 'object'
    && candidate.queryRuntimeCache !== null;
};

const createEventBindings = (event: TriggerEvent): Readonly<Record<string, unknown>> => {
  if (event.type === 'phaseEnter' || event.type === 'phaseExit') {
    return { $event: event, $phase: event.phase };
  }

  if (event.type === 'actionResolved') {
    return { $event: event, $action: event.action };
  }

  if (event.type === 'tokenEntered') {
    return { $event: event, $zone: event.zone };
  }

  if (event.type === 'varChanged') {
    return {
      $event: event,
      $scope: event.scope,
      $var: event.var,
      $player: event.player,
      $zone: event.zone,
      $oldValue: event.oldValue,
      $newValue: event.newValue,
    };
  }

  return { $event: event };
};
