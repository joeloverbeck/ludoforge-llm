import { applyEffects } from './effects.js';
import { evalCondition } from './eval-condition.js';
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
  const nextTriggerLog: TriggerLogEntry[] = [...triggerLog];

  for (const trigger of def.triggers) {
    if (!matchesEvent(trigger, event)) {
      continue;
    }

    const evalCtx = {
      def,
      state: nextState,
      activePlayer: nextState.activePlayer,
      actorPlayer: nextState.activePlayer,
      bindings: createEventBindings(event),
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
  }

  return {
    state: nextState,
    rng: nextRng,
    triggerLog: nextTriggerLog,
  };
};

const matchesEvent = (trigger: TriggerDef, event: TriggerEvent): boolean => {
  if (trigger.event.type !== event.type) {
    return false;
  }

  switch (event.type) {
    case 'turnStart':
    case 'turnEnd':
      return true;
    case 'phaseEnter':
    case 'phaseExit':
      return 'phase' in trigger.event && trigger.event.phase === event.phase;
    case 'actionResolved':
      return 'action' in trigger.event && (trigger.event.action === undefined || trigger.event.action === event.action);
    case 'tokenEntered':
      return 'zone' in trigger.event && (trigger.event.zone === undefined || trigger.event.zone === event.zone);
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

  return { $event: event };
};
