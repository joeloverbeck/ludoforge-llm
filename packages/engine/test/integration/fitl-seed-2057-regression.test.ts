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
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns']);

describe('FITL seed 2057 regression', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it('keeps the former $targetSpaces crash witness bounded and non-throwing', () => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );

    const trace = runGame(def, 2057, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

    assert.equal(
      ALLOWED_STOP_REASONS.has(trace.stopReason),
      true,
      `seed 2057: expected terminal/maxTurns, got ${trace.stopReason} after ${trace.moves.length} moves`,
    );
    assert.equal(trace.moves.length > 0, true, 'seed 2057 should advance at least one move');
  });
});
