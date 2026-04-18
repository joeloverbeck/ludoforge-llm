// @test-class: convergence-witness
// @witness: 132AGESTUVIA-008
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves', 'noPlayableMoveCompletion']);

describe('FITL seed 1002 regression', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it('stays bounded and leaves population-0 support/opposition neutral under the campaign seat mapping', { timeout: 15_000 }, () => {
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );

    const trace = runGame(def, 1002, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

    assert.equal(
      ALLOWED_STOP_REASONS.has(trace.stopReason),
      true,
      `seed 1002: expected terminal/maxTurns/noLegalMoves/noPlayableMoveCompletion, got ${trace.stopReason} after ${trace.moves.length} moves`,
    );
    assert.equal(
      trace.finalState.markers['phuoc-long:none']?.supportOpposition ?? 'neutral',
      'neutral',
      'Population-0 Phuoc Long must remain neutral on support/opposition',
    );
  });
});
