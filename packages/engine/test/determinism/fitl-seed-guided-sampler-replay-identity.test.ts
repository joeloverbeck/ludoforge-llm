// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime, serializeTrace } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const PLAYER_COUNT = 4;
const MAX_TURNS = 200;

describe('guided sampler replay identity', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const runOnce = (seed: number, disableGuidedChooser: boolean) => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary', disableGuidedChooser }),
    );
    return JSON.stringify(serializeTrace(runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime)));
  };

  it('seed 1000 remains byte-identical with guidance enabled versus disabled', () => {
    const legacy = runOnce(1000, true);
    const guided = runOnce(1000, false);
    assert.equal(guided, legacy);
  });
});
