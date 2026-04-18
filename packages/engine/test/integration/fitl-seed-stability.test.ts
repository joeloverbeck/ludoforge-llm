// @test-class: convergence-witness
// @witness: 126FREOPEBIN-004
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const MAX_TURNS = 300;
const PLAYER_COUNT = 4;
const FORMER_CRASH_OR_HANG_SEEDS = [
  1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1040, 1042, 1043, 1046, 1047, 1051, 1054,
] as const;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns']);

describe('FITL former crash/hang seeds stay bounded', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const runOnce = (seed: number) => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );
    return runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
  };

  for (const seed of FORMER_CRASH_OR_HANG_SEEDS) {
    it(`seed ${seed}: reaches a bounded post-fix stop reason`, () => {
      const trace = runOnce(seed);
      assert.equal(
        ALLOWED_STOP_REASONS.has(trace.stopReason),
        true,
        `seed ${seed}: expected terminal/maxTurns, got ${trace.stopReason} after ${trace.moves.length} moves`,
      );
    });
  }
});
