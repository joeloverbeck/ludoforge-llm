// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  createGameDefRuntime,
  serializeGameState,
  serializeTrace,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const FITL_TURNSHAPE_DETERMINISM_SEED = 1005;
const FITL_TURNSHAPE_DETERMINISM_MAX_TURNS = 80;
const FITL_PLAYER_COUNT = 4;

const serializedFinalState = (state: Parameters<typeof serializeGameState>[0]): string =>
  JSON.stringify(serializeGameState(state));

describe('turn-shape evaluator replay determinism', () => {
  const def = getFitlProductionFixture().gameDef;
  const runtime = createGameDefRuntime(def);

  const runFitlTurnShapeProfile = () => runGame(
    def,
    FITL_TURNSHAPE_DETERMINISM_SEED,
    FITL_POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' })),
    FITL_TURNSHAPE_DETERMINISM_MAX_TURNS,
    FITL_PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );

  it('keeps the FITL turn-shape-using profile byte-identical across repeated runs', () => {
    const first = runFitlTurnShapeProfile();
    const second = runFitlTurnShapeProfile();

    assert.equal(serializedFinalState(first.finalState), serializedFinalState(second.finalState));
    assert.deepEqual(first.decisions, second.decisions);
    assert.deepEqual(serializeTrace(first), serializeTrace(second));
  });
});
