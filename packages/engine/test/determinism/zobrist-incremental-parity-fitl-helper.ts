// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_PLAYER_COUNT = 4;
const FITL_MAX_TURNS = 200;
const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('FITL compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createFitlPolicyAgents = (): readonly PolicyAgent[] =>
  FITL_POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

export const runFitlZobristIncrementalParitySeed = (seed: number): void => {
  const def = compileFitlDef();
  const runtime = createGameDefRuntime(def);
  const agents = createFitlPolicyAgents();
  let decisionCount = 0;

  const trace = runGame(def, seed, agents, FITL_MAX_TURNS, FITL_PLAYER_COUNT, {
    kernel: { verifyIncrementalHash: true },
    skipDeltas: true,
    traceRetention: 'finalStateOnly',
    decisionHook: (ctx) => {
      if (ctx.kind === 'decision') {
        decisionCount += 1;
      }
    },
  }, runtime);

  assert.equal(trace.decisions.length, 0, `seed=${seed} should not retain full decision logs`);
  assert.ok(decisionCount > 0, `seed=${seed} should produce at least one move`);
};
