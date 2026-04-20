// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, deriveFitlPopulationZeroSpaces } from '../helpers/production-spec-helpers.js';

/**
 * Architectural invariants for FITL canary simulation:
 *   (a) `runGame` produces a trace whose stopReason is in the canonical
 *       allowed set {terminal, maxTurns, noLegalMoves};
 *   (b) every population-0 space stays `neutral` on `supportOpposition`
 *       in the final state;
 *   (c) `runGame` does not throw (an uncaught exception would fail the test
 *       before any assertion runs).
 *
 * Distilled from convergence-witnesses `132AGESTUVIA-008` and
 * `132AGESTUVIA-009` per Spec 137. Coverage spans every canary seed × every
 * supported policy-profile variant, not a pinned (seed, profile) pair.
 */

const CANARY_SEEDS = [1002, 1005, 1010, 1013] as const;
const POLICY_PROFILE_VARIANTS = [
  ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
  ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

describe('FITL canary bounded termination', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const populationZeroSpaces = deriveFitlPopulationZeroSpaces();

  it('derives a non-empty population-0 space set from the FITL production map', () => {
    assert.ok(populationZeroSpaces.length > 0, 'Expected FITL production map to expose population-0 spaces');
  });

  for (const profiles of POLICY_PROFILE_VARIANTS) {
    for (const seed of CANARY_SEEDS) {
      it(
        `profiles=${profiles.join(',')} seed=${seed}: bounded stop and population-0 neutrality`,
        { timeout: 20_000 },
        () => {
          const agents = profiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
          const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

          assert.ok(
            ALLOWED_STOP_REASONS.has(trace.stopReason),
            `stop=${trace.stopReason} after ${trace.decisions.length} moves`,
          );
          for (const space of populationZeroSpaces) {
            assert.equal(
              trace.finalState.markers[`${space}:none`]?.supportOpposition ?? 'neutral',
              'neutral',
              `population-0 space ${space} drifted on supportOpposition`,
            );
          }
        },
      );
    }
  }
});
