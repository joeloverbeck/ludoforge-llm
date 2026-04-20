import { MAX_AUTO_RESOLVE_CHAIN } from './constants.js';
import { applyDecision } from './apply.js';
import type { AdvanceAutoresolvableResult, DecisionLog } from './types.js';
import type { GameDef, GameState, Rng } from '../types-core.js';
import type { GameDefRuntime } from '../gamedef-runtime.js';

const isAutoresolvableKind = (kind: string): kind is 'turnRetirement' =>
  kind === 'turnRetirement';

export const advanceAutoresolvable = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  runtime?: GameDefRuntime,
): AdvanceAutoresolvableResult => {
  let nextState = state;
  const autoResolvedLogs: DecisionLog[] = [];

  for (let i = 0; i < MAX_AUTO_RESOLVE_CHAIN; i += 1) {
    const top = nextState.decisionStack?.at(-1);
    if (top === undefined || !isAutoresolvableKind(top.context.kind)) {
      return { state: nextState, rng, autoResolvedLogs };
    }
    const context = top.context;
    if (context.kind !== 'turnRetirement') {
      return { state: nextState, rng, autoResolvedLogs };
    }
    const applied = applyDecision(def, nextState, {
      kind: 'turnRetirement',
      retiringTurnId: context.retiringTurnId,
    }, undefined, runtime);
    nextState = applied.state;
    autoResolvedLogs.push(applied.log);
  }

  throw new Error(`UNSUPPORTED_AUTO_RESOLVE_THIS_TICKET: exceeded MAX_AUTO_RESOLVE_CHAIN=${MAX_AUTO_RESOLVE_CHAIN}`);
};
