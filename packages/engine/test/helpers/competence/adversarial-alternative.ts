import * as assert from 'node:assert/strict';

import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import type { Decision, GameDef } from '../../../src/kernel/index.js';
import type { CompetenceRunResult } from './live-frontier-runner.js';

export interface AssertAdversarialAlternativeAvoidedInput {
  readonly def: GameDef;
  readonly result: Pick<CompetenceRunResult, 'targetFrontier' | 'selectedDecision' | 'agentDecision'>;
  readonly trapStableMoveKeys: readonly string[];
}

export const assertAdversarialAlternativeAvoided = (
  input: AssertAdversarialAlternativeAvoidedInput,
): void => {
  assert.ok(input.trapStableMoveKeys.length > 0, 'expected at least one adversarial trap key');

  const frontierStableKeys = input.result.targetFrontier.map((decision) => decisionStableKey(input.def, decision));
  const selectedStableKey = selectedStableKeyFrom(input.def, input.result);

  for (const trapKey of input.trapStableMoveKeys) {
    assert.ok(
      frontierStableKeys.includes(trapKey),
      `expected trap alternative ${trapKey} in published frontier; got ${format(frontierStableKeys)}`,
    );
  }
  assert.ok(
    !input.trapStableMoveKeys.includes(selectedStableKey),
    `expected selected move ${selectedStableKey} not to be an adversarial trap`,
  );
};

const selectedStableKeyFrom = (
  def: GameDef,
  result: Pick<CompetenceRunResult, 'selectedDecision' | 'agentDecision'>,
): string => {
  if (result.agentDecision?.selectedStableMoveKey !== undefined && result.agentDecision.selectedStableMoveKey !== null) {
    return result.agentDecision.selectedStableMoveKey;
  }
  return decisionStableKey(def, result.selectedDecision);
};

const decisionStableKey = (def: GameDef, decision: Decision): string => {
  if (decision.kind !== 'actionSelection') {
    return `${decision.kind}:${JSON.stringify(decision)}`;
  }
  return decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(def, decision.move);
};

const format = (value: unknown): string => JSON.stringify(value);
