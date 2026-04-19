// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent, RandomAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef } from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const PLAYER_COUNT = 4;
const MAX_TURNS = 200;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;

describe('Spec 139 failing seeds regression', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it('FITL seed=123 with RandomAgent completes without throwing', () => {
    const agents = Array.from({ length: PLAYER_COUNT }, () => new RandomAgent());
    const trace = runGame(def, 123, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

    assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason));
    assert.ok(trace.moves.length > 0);
  });

  for (const seed of [1002, 1010] as const) {
    it(`FITL seed=${seed} with arvn-evolved profile set completes without throwing`, () => {
      const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

      assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason));
      assert.ok(trace.moves.length > 0);
    });
  }
});
