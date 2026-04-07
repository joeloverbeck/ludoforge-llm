import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Canary test: FITL seeds with production PolicyAgent profiles must produce
 * deterministic game outcomes and terminate within bounded moves.
 *
 * This guards against regressions where kernel changes (e.g., free-operation
 * grant handling) silently alter legal-move enumeration or turn-flow
 * advancement, causing games to diverge or loop infinitely.
 *
 * FOUNDATIONS §8: Same GameDef + same seed + same agents = identical result.
 * FOUNDATIONS §10: Games must complete within bounded moves.
 */
describe('FITL PolicyAgent determinism canary', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
  const MAX_TURNS = 100;
  const PLAYER_COUNT = 4;

  const runOnce = (seed: number) => {
    const agents = PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );
    return runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
  };

  // Seeds 1001-1004 produce terminal results with the current GameDef.
  // These are canaries for grant-related determinism regressions.
  for (const seed of [1001, 1002, 1003, 1004]) {
    it(`seed ${seed}: game reaches terminal within ${MAX_TURNS} moves`, () => {
      const trace = runOnce(seed);
      assert.equal(
        trace.stopReason,
        'terminal',
        `seed ${seed}: expected terminal, got ${trace.stopReason} after ${trace.moves.length} moves`,
      );
      assert.notEqual(trace.result, null, `seed ${seed}: expected a result`);
    });

    it(`seed ${seed}: replay produces identical outcome`, () => {
      const trace1 = runOnce(seed);
      const trace2 = runOnce(seed);
      assert.equal(
        trace1.moves.length,
        trace2.moves.length,
        `seed ${seed}: move count diverged`,
      );
      assert.equal(
        trace1.finalState.stateHash,
        trace2.finalState.stateHash,
        `seed ${seed}: final state hash diverged`,
      );
    });
  }
});
