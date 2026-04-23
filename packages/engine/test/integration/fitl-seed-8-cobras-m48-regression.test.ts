// @test-class: architectural-invariant
// @witness: fitl-seed-8-cobras-m48-stochastic-recovery
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';

const MAX_TURNS = 100;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

describe('FITL seed 8 Cobras+M48 regression', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const sharedRuntime = createGameDefRuntime(def);

  it('runs seed 8 cleanly on fresh and shared-runtime paths', { timeout: 40_000 }, () => {
    const freshTrace = runGame(
      def,
      8,
      createSeededChoiceAgents(PLAYER_COUNT),
      MAX_TURNS,
      PLAYER_COUNT,
      { skipDeltas: true },
    );
    const sharedTrace = runGame(
      def,
      8,
      createSeededChoiceAgents(PLAYER_COUNT),
      MAX_TURNS,
      PLAYER_COUNT,
      { skipDeltas: true },
      sharedRuntime,
    );

    assert.equal(ALLOWED_STOP_REASONS.has(freshTrace.stopReason), true);
    assert.equal(ALLOWED_STOP_REASONS.has(sharedTrace.stopReason), true);
    assert.ok(freshTrace.decisions.length > 0, 'fresh runtime seed 8 should advance at least one decision');
    assert.ok(sharedTrace.decisions.length > 0, 'shared runtime seed 8 should advance at least one decision');
    assert.equal(sharedTrace.finalState.stateHash, freshTrace.finalState.stateHash);
    assert.equal(sharedTrace.stopReason, freshTrace.stopReason);
  });
});
