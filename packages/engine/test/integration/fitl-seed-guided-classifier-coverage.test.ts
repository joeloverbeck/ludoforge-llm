// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const SEEDS = [1002, 1010] as const;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
const PLAYER_COUNT = 4;
const MAX_TURNS = 200;

describe('FITL guided classifier coverage seeds', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  for (const seed of SEEDS) {
    it(`seed ${seed} reaches a bounded post-guidance stop reason`, () => {
      const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
      const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

      assert.equal(
        ALLOWED_STOP_REASONS.has(trace.stopReason),
        true,
        `seed ${seed}: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason}`,
      );
      assert.ok(trace.moves.length > 0, `seed ${seed}: expected non-empty move trace`);
    });
  }
});
