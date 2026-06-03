// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type Agent,
  type Decision,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { canonicalStateChanged, runToCompetenceDecision } from '../helpers/competence/index.js';

const FITL_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

const compileFitl = () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const createFitlPolicyAgents = (): readonly Agent[] =>
  FITL_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));

const decisionKey = (decision: Decision): string => JSON.stringify(decision);

describe('competence live-frontier runner', () => {
  it('executes a real FITL actionSelection turn from the published frontier', () => {
    const def = compileFitl();
    const result = runToCompetenceDecision({
      def,
      seed: 209,
      agents: createFitlPolicyAgents(),
      playerCount: FITL_PROFILES.length,
      maxTurns: 5,
      microturnBound: 50,
      advanceUntil: ({ microturn }) => microturn.kind === 'actionSelection' && microturn.legalActions.length > 0,
    });

    assert.equal(result.targetMicroturn.kind, 'actionSelection');
    assert.ok(
      result.targetFrontier.some((decision) => decisionKey(decision) === decisionKey(result.selectedDecision)),
      'selected decision must be present in the kernel-published frontier',
    );
    assert.ok(canonicalStateChanged(result.preState, result.postState), 'executed turn must change canonical state');
    assert.ok(result.decisions.length > 0, 'runner must expose decision logs for the executed turn');
    assert.equal(result.decisions[0]?.decision.kind, result.selectedDecision.kind);
    assert.ok(result.agentDecision, 'runner must expose the agent trace for the selected root');
  });
});
