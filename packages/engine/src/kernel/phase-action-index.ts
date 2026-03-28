import type { PhaseId } from './branded.js';
import type { ActionDef, GameDef } from './types.js';

export interface PhaseActionIndex {
  readonly actionsByPhase: ReadonlyMap<PhaseId, readonly ActionDef[]>;
}

const phaseActionIndexCache = new WeakMap<readonly ActionDef[], PhaseActionIndex>();

const buildPhaseActionIndex = (def: GameDef): PhaseActionIndex => {
  const actionsByPhase = new Map<PhaseId, ActionDef[]>();

  for (const action of def.actions) {
    for (const phaseId of action.phase) {
      let actionsForPhase = actionsByPhase.get(phaseId);
      if (actionsForPhase === undefined) {
        actionsForPhase = [];
        actionsByPhase.set(phaseId, actionsForPhase);
      }
      actionsForPhase.push(action);
    }
  }

  return { actionsByPhase };
};

export const getPhaseActionIndex = (def: GameDef): PhaseActionIndex => {
  let cached = phaseActionIndexCache.get(def.actions);
  if (cached === undefined) {
    cached = buildPhaseActionIndex(def);
    phaseActionIndexCache.set(def.actions, cached);
  }
  return cached;
};
