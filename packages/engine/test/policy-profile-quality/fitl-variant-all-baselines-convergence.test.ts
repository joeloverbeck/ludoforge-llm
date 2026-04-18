// @test-class: convergence-witness
// @profile-variant: all-baselines

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const VARIANT_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const FITL_1964_CANARY_SEEDS = [1020, 1049, 1054] as const;
const MAX_TURNS = 300;
const PLAYER_COUNT = 4;

describe('FITL all-baselines variant convergence witness', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  for (const seed of FITL_1964_CANARY_SEEDS) {
    it(`seed ${seed}: reaches terminal within ${MAX_TURNS} moves`, () => {
      const agents = VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

      assert.equal(trace.stopReason, 'terminal', `failed to converge - seed ${seed} stopped with ${trace.stopReason}`);
    });
  }
});
