import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  serializeTrace,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

describe('FITL seed 1000 regression gate', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const runOnce = () => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );
    return runGame(def, 1000, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
  };

  it('stays bounded and non-throwing under the campaign seat mapping', { timeout: 15_000 }, () => {
    const trace = runOnce();

    assert.equal(
      ALLOWED_STOP_REASONS.has(trace.stopReason),
      true,
      `seed 1000: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason} after ${trace.moves.length} moves`,
    );
    assert.ok(trace.moves.length <= MAX_TURNS, `seed 1000 exceeded ${MAX_TURNS} moves`);
  });

  it('remains deterministic across repeated runs', { timeout: 20_000 }, () => {
    const first = JSON.stringify(serializeTrace(runOnce()));
    const second = JSON.stringify(serializeTrace(runOnce()));

    assert.equal(first, second);
  });
});
