import { MAX_AUTO_RESOLVE_CHAIN } from './constants.js';
import { applyDecision, resolveStochasticDistribution } from './apply.js';
import type { AdvanceAutoresolvableResult, DecisionLog } from './types.js';
import type { GameDef, GameState, Rng } from '../types-core.js';
import type { GameDefRuntime } from '../gamedef-runtime.js';

const isAutoresolvableKind = (kind: string): kind is 'stochasticResolve' | 'outcomeGrantResolve' | 'turnRetirement' =>
  kind === 'stochasticResolve' || kind === 'outcomeGrantResolve' || kind === 'turnRetirement';

export const advanceAutoresolvable = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  runtime?: GameDefRuntime,
): AdvanceAutoresolvableResult => {
  let nextState = state;
  let nextRng = rng;
  const autoResolvedLogs: DecisionLog[] = [];

  for (let i = 0; i < MAX_AUTO_RESOLVE_CHAIN; i += 1) {
    const top = nextState.decisionStack?.at(-1);
    if (top === undefined || !isAutoresolvableKind(top.context.kind)) {
      return { state: nextState, rng: nextRng, autoResolvedLogs };
    }
    const context = top.context;
    if (context.kind === 'stochasticResolve') {
      const resolved = resolveStochasticDistribution(nextRng, context.distribution);
      const applied = applyDecision(def, nextState, {
        kind: 'stochasticResolve',
        decisionKey: context.decisionKey,
        value: resolved.value,
      }, undefined, runtime);
      nextState = applied.state;
      nextRng = resolved.rng;
      autoResolvedLogs.push(applied.log);
      continue;
    } else if (context.kind === 'outcomeGrantResolve') {
      const applied = applyDecision(def, nextState, {
        kind: 'outcomeGrantResolve',
        grantId: context.grant.grantId,
      }, undefined, runtime);
      nextState = applied.state;
      autoResolvedLogs.push(applied.log);
      continue;
    } else {
      const retiringTurnId = (context as Extract<typeof context, { readonly kind: 'turnRetirement' }>).retiringTurnId;
      const applied = applyDecision(def, nextState, {
        kind: 'turnRetirement',
        retiringTurnId,
      }, undefined, runtime);
      nextState = applied.state;
      autoResolvedLogs.push(applied.log);
    }
  }

  throw new Error(
    `MICROTURN_AUTO_RESOLVE_BUDGET_EXCEEDED: exceeded MAX_AUTO_RESOLVE_CHAIN=${MAX_AUTO_RESOLVE_CHAIN}`,
  );
};
