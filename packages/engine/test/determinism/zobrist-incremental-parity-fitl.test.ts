// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('FITL compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

const createFitlPolicyAgents = (): readonly PolicyAgent[] =>
  FITL_POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

describe('Zobrist incremental parity — FITL', () => {
  const FITL_PLAYER_COUNT = 4;
  const FITL_MAX_TURNS = 200;
  const FITL_SEEDS = [42, 123];

  const def = compileFitlDef();
  const runtime = createGameDefRuntime(def);

  for (const seed of FITL_SEEDS) {
    it(`seed=${seed}: incremental hash matches full recompute every move`, () => {
      const agents = createFitlPolicyAgents();

      const trace = runGame(def, seed, agents, FITL_MAX_TURNS, FITL_PLAYER_COUNT, {
        kernel: { verifyIncrementalHash: true },
      }, runtime);

      assert.ok(trace.decisions.length > 0, `seed=${seed} should produce at least one move`);
    });
  }
});
