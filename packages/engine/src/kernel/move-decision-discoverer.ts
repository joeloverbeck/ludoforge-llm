import { legalChoicesDiscover } from './legal-choices.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { GameDef, GameState } from './types.js';
import type { DecisionSequenceChoiceDiscoverer } from './decision-sequence-satisfiability.js';

export const createMoveDecisionSequenceChoiceDiscoverer = (
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): DecisionSequenceChoiceDiscoverer => (move, discoverOptions) =>
  legalChoicesDiscover(def, state, move, {
    ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
      ? {}
      : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
  }, runtime);
