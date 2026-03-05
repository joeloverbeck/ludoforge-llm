import { applyEffects } from './effects.js';
import { createExecutionEffectContext } from './effect-context.js';
import { evalCondition } from './eval-condition.js';
import { createEvalContext, createEvalRuntimeResources, type EvalRuntimeResources } from './eval-context.js';
import { assertEvalRuntimeResourcesContract } from './eval-runtime-resources-contract.js';
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
  validateDispatchTriggerRequest(request);
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

const validateDispatchTriggerRequest: (request: unknown) => asserts request is DispatchTriggersRequest = (request: unknown) => {
  if (!isObjectRecord(request)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request must be an object; received ${describeType(request)}`,
    );
  }
  if (!isObjectRecord(request.def)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.def must be an object; received ${describeType(request.def)}`,
    );
  }
  if (!Array.isArray(request.def.zones)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.def.zones must be an array; received ${describeType(request.def.zones)}`,
    );
  }
  if (!Array.isArray(request.def.triggers)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.def.triggers must be an array; received ${describeType(request.def.triggers)}`,
    );
  }
  if (!isObjectRecord(request.state)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.state must be an object; received ${describeType(request.state)}`,
    );
  }
  if (!isObjectRecord(request.rng)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.rng must be an object; received ${describeType(request.rng)}`,
    );
  }
  if (!('state' in request.rng) || !isObjectRecord(request.rng.state)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.rng.state must be an object; received ${describeType('state' in request.rng ? request.rng.state : undefined)}`,
    );
  }
  if (!isObjectRecord(request.event)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.event must be an object; received ${describeType(request.event)}`,
    );
  }
  if (typeof request.event.type !== 'string') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.event.type must be a string; received ${describeType(request.event.type)}`,
    );
  }
  if (!Number.isSafeInteger(request.depth)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.depth must be a safe integer; received ${String(request.depth)}`,
    );
  }
  if (!Number.isSafeInteger(request.maxDepth)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.maxDepth must be a safe integer; received ${String(request.maxDepth)}`,
    );
  }
  if (!Array.isArray(request.triggerLog)) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.triggerLog must be an array; received ${describeType(request.triggerLog)}`,
    );
  }
  if (request.effectPathRoot !== undefined && typeof request.effectPathRoot !== 'string') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `dispatchTriggers request.effectPathRoot must be a string when provided; received ${typeof request.effectPathRoot}`,
    );
  }
  if (request.evalRuntimeResources !== undefined) {
    assertEvalRuntimeResourcesContract(
      request.evalRuntimeResources,
      'dispatchTriggers request.evalRuntimeResources',
    );
  }
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const describeType = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'array' : typeof value;
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
