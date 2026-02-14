import { applyEffects } from './effects.js';
import { evalCondition } from './eval-condition.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createCollector } from './execution-collector.js';
import type { GameDef, GameState, Rng, TriggerDef, TriggerEvent, TriggerLogEntry } from './types.js';

export interface DispatchTriggersResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly triggerLog: readonly TriggerLogEntry[];
}

export const dispatchTriggers = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  event: TriggerEvent,
  depth: number,
  maxDepth: number,
  triggerLog: readonly TriggerLogEntry[],
  adjacencyGraph: AdjacencyGraph = buildAdjacencyGraph(def.zones),
): DispatchTriggersResult => {
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

    const evalCtx = {
      def,
      adjacencyGraph,
      state: nextState,
      activePlayer: nextState.activePlayer,
      actorPlayer: nextState.activePlayer,
      bindings: createEventBindings(event),
      collector: createCollector(),
    };

    if (trigger.match !== undefined && !evalCondition(trigger.match, evalCtx)) {
      continue;
    }

    if (trigger.when !== undefined && !evalCondition(trigger.when, evalCtx)) {
      continue;
    }

    const effectResult = applyEffects(trigger.effects, {
      ...evalCtx,
      rng: nextRng,
      moveParams: {},
    });
    nextState = effectResult.state;
    nextRng = effectResult.rng;
    nextTriggerLog.push({
      kind: 'fired',
      triggerId: trigger.id,
      event,
      depth,
    });

    for (const emittedEvent of effectResult.emittedEvents ?? []) {
      const cascadeResult = dispatchTriggers(
        def,
        nextState,
        nextRng,
        emittedEvent,
        depth + 1,
        maxDepth,
        nextTriggerLog,
        adjacencyGraph,
      );
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
        (triggerEvent.player === undefined || triggerEvent.player === event.player)
      );
  }
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
      $oldValue: event.oldValue,
      $newValue: event.newValue,
    };
  }

  return { $event: event };
};
