// @test-class: convergence-witness
// @witness: 132AGESTUVIA-009
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const REGRESSION_SEEDS = [1005, 1010, 1013] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

describe('FITL campaign no-playable regression seeds', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  for (const seed of REGRESSION_SEEDS) {
    it(`seed ${seed} stays non-throwing under the campaign seat mapping`, { timeout: 20_000 }, () => {
      const agents = POLICY_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      );

      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

      assert.equal(
        ALLOWED_STOP_REASONS.has(trace.stopReason),
        true,
        `seed ${seed}: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason} after ${trace.moves.length} moves`,
      );
      assert.ok(trace.moves.length > 0, `seed ${seed}: expected the simulation to advance`);
    });
  }
});
