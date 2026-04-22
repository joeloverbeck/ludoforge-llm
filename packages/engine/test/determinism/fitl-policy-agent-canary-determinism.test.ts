// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Canary test: FITL seeds with production PolicyAgent profiles must produce
 * deterministic bounded early-game outcomes through the first turn boundary.
 *
 * This guards against regressions where kernel changes (e.g., free-operation
 * grant handling) silently alter legal-move enumeration or turn-flow
 * advancement, causing games to diverge, explode in microturn count, or loop
 * inside the historically pathological opening window.
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
  const MAX_TURNS = 1;
  const PLAYER_COUNT = 4;

  const runOnce = (seed: number) => {
    const agents = PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );
    return runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
  };

  // Post-126FREOPEBIN grant-determinism canary seeds. This file now fixes the
  // witness shape to the historically pathological opening window rather than a
  // full-game trajectory claim. Full bounded termination still lives in the
  // broader integration canaries; this file owns deterministic, bounded
  // progression through the first turn boundary for the seeds that previously
  // blew up in continuation/publication/policy interaction.
  const BOUNDED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
  for (const seed of [1020, 1040, 1049, 1054, 2046]) {
    it(`seed ${seed}: first-turn canary stays bounded`, { timeout: 20_000 }, () => {
      const trace = runOnce(seed);
      assert.ok(
        BOUNDED_STOP_REASONS.has(trace.stopReason),
        `seed ${seed}: expected a bounded stop reason, got ${trace.stopReason} after ${trace.decisions.length} decisions`,
      );
      assert.ok(
        trace.turnsCount <= MAX_TURNS,
        `seed ${seed}: turn count ${trace.turnsCount} exceeded MAX_TURNS budget of ${MAX_TURNS}`,
      );
    });

    it(`seed ${seed}: replay produces identical first-turn outcome`, { timeout: 20_000 }, () => {
      const trace1 = runOnce(seed);
      const trace2 = runOnce(seed);
      assert.equal(
        trace1.decisions.length,
        trace2.decisions.length,
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
